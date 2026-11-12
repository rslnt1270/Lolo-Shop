# Subsistema B: paleta turquesa y botones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar la paleta turquesa `#22B8B8` y un sistema de botones único (primario, contorno, peligro) en la PWA de tienda y en el sitio público, con movimiento y comportamiento de "reducir movimiento" según la spec.

**Architecture:** Los tokens se definen una sola vez en `tailwind.config.ts`. Las clases de botón viven en un módulo puro (`components/ui/button-classes.ts`) que consume el componente `components/ui/Button.tsx`. El movimiento (elevación, presión, giro de carga, check que se dibuja) va en `app/globals.css` bajo clases `lolo-btn*`, para que los botones existentes solo cambien de clase. La migración del código existente es por archivo, en tareas separadas por zona de la app.

**Tech Stack:** Next.js 14.2 (App Router), React 18.3, Tailwind CSS 3.4.4, TypeScript, Vitest 1.6 + jsdom, @testing-library/react 16, framer-motion 12 (no se usa para botones).

**Orden de mezcla (cronograma §3):** B se divide en dos. **B base (Tasks 1–4)** se mezcla **primero**, el jueves 12, antes que cualquier otro plan, para que A, C, D y E usen `Button` y los tokens desde el inicio. **B zonas (Tasks 5–9)** se aplican cada una **después** de que se mezcle el plan dueño de esa zona: T5 después de A; T6 después de E; T7 después de A, G y D; T8 después de A, D y E; T9 después de C. **Task 10 al final.** B es el plan que se rebasa: si una zona cambió, se reaplican clases, nunca se reescribe lógica de otro plan.

**Spec:** `docs/superpowers/specs/2026-11-11-paleta-botones-catalogo-design.md` (§2 paleta, §3 botones). Referencia del sitio: `docs/superpowers/specs/2026-11-05-sitio-publico-ux-design.md` (§3.2 tokens, §8 animaciones). Vistas previas (no se pudieron abrir desde el constructor; la spec manda): https://claude.ai/artifact/8AE5DYjV3WFoSZaQhbW3me y https://claude.ai/artifact/LSFTMmebKgrZYGbdfWH3b7.

## Global Constraints

- Turquesa `#22B8B8` solo como relleno de botón principal, aro o halo. Nunca como color de texto.
- Texto sobre turquesa: `tinta` `#16302F` (5.75:1). Blanco sobre turquesa (2.44:1) prohibido.
- Enlaces, precios y contorno de botón: `turquesa-texto` `#0C7C7C` (5.01:1 con blanco).
- Titulares ≥ 28 px peso 800: `turquesa-titular` `#0E9494` (3.70:1, texto grande).
- Fondo blanco. `niebla` `#F3F7F7` solo para bloques y esqueletos.
- "Disponible" y "Agotado" siempre con texto además del color (`ok` `#1F7A4A`, `agotado` `#9A3B2E`).
- Altura mínima de botón 44 px.
- Deshabilitado: relleno `#BFE9E9`, texto `#5C6E6D`.
- Movimiento: hover eleva 2 px; press escala 0.97; carga con giro; confirmación con check que se dibuja.
- Con `prefers-reduced-motion: reduce` las transiciones duran 1 ms (no se eliminan) y el giro de carga se hace **más lento** (1600 ms por vuelta, el doble de 800 ms), **nunca se detiene** (spec alta §4.5, decisión 11; mismo factor 2 que `spinSlowFactor` de D).
- Check que se dibuja: 420 ms (spec alta §4.5; mismo valor que `checkMs` de D).
- Sin modo oscuro en este subsistema.
- Ningún cambio de lógica de negocio, rutas ni datos. Solo clases, tokens y el componente nuevo.
- Commits en Conventional Commits, sin secretos.

## Review Focus

1. Botón primario con texto blanco sobre turquesa (contraste 2.44:1, ilegible en sol de tienda). Test: "no primary fill uses white text" (Task 10).
2. Usuario con "reducir movimiento" que ve el giro de carga acelerarse o detenerse (parece colgado), o un check que aparece sin dibujarse. Test: "loading spinner slows down under reduced motion" y "success check is drawn without animation under reduced motion" (Task 3).
3. Botón de confirmación que se queda en "cargando" si la acción falla. Test: "loading resets when the wrapped action rejects" (Task 6, en `PendingPayments.tsx`, que es el consumidor que controla `loading`; el componente solo lo refleja).
4. Cancelar una venta sin paso de confirmación al pasar a botón de peligro. Test: "cancel sale keeps its confirmation step" (Task 6, en `CancelSalePanel`).
5. Tarjeta en pantalla estrecha con dos botones que desbordan o quedan con menos de 44 px. Test: "outline and primary buttons stay ≥ 44 px tall at phone width" (Task 2, prueba de clases `min-h-11`).

---

## File Structure

- Modify: `tailwind.config.ts` (tokens nuevos; alias de compatibilidad para `loloteal` y `primary`).
- Create: `components/ui/button-classes.ts` (función pura `buttonClasses(variant, state)`).
- Create: `components/ui/Button.tsx` (componente `Button`).
- Modify: `app/globals.css` (clases `lolo-btn*`, keyframes, bloque de reducir movimiento; sustituye `#007272` del escáner).
- Create tests: `components/__tests__/palette-tokens.test.ts`, `components/__tests__/button-classes.test.ts`, `components/__tests__/Button.test.tsx`, `components/__tests__/button-motion.test.ts`, `components/__tests__/palette-sweep.test.ts`.
- Modify (migración por zona): lista por tarea en Tasks 5–9.

---

### Task 1: Tokens de paleta en Tailwind

**Files:**
- Modify: `tailwind.config.ts` (bloque `extend.colors`)
- Test: `components/__tests__/palette-tokens.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: clases `bg-turquesa`, `text-tinta`, `text-turquesa-texto`, `border-turquesa-texto`, `text-turquesa-titular`, `bg-turquesa-luz`, `bg-niebla`, `text-ok`, `text-agotado`, `border-agotado`, `border-borde-control`. Export de constantes de color en `tailwind.config.ts` no se hace; los tests leen los valores desde el archivo de configuración importado (`import config from "../../tailwind.config"`).

- [ ] **Step 1: Write the failing test**

```ts
// components/__tests__/palette-tokens.test.ts
import { describe, expect, it } from "vitest";
import config from "../../tailwind.config";

const colors = (config.theme as any).extend.colors as Record<string, string>;

const SPEC: Record<string, string> = {
  turquesa: "#22B8B8",
  tinta: "#16302F",
  "turquesa-texto": "#0C7C7C",
  "turquesa-titular": "#0E9494",
  "turquesa-luz": "#5FE0DE",
  niebla: "#F3F7F7",
  ok: "#1F7A4A",
  agotado: "#9A3B2E",
  "borde-control": "#7F9392",
};

describe("palette tokens", () => {
  it("defines every spec token with the exact hex value", () => {
    for (const [name, hex] of Object.entries(SPEC)) {
      expect(colors[name], name).toBe(hex);
    }
  });

  it("keeps loloteal as an alias of turquesa-texto, not of the turquoise fill", () => {
    expect(colors["loloteal"]).toBe("#0C7C7C");
  });

  it("primary maps to turquesa-texto so text and borders using it meet contrast", () => {
    expect(colors["primary"]).toBe("#0C7C7C");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/__tests__/palette-tokens.test.ts`
Expected: FAIL: `colors["turquesa"]` es `undefined`, y `loloteal` vale `#007272`.

- [ ] **Step 3: Implement the tokens in `tailwind.config.ts`**

Add the nine spec tokens to `extend.colors`. Change `"loloteal"` to `#0C7C7C` and `"primary"` to `#0C7C7C`. Change `"surface-tint"` and `"loloteal-dark"` to `#0C7C7C` and `#0A6A6A` (solo para el hover de los usos que se migran; la migración de Tasks 5–9 los retira). Do not touch the remaining M3 tokens. Test: `npx vitest run components/__tests__/palette-tokens.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts components/__tests__/palette-tokens.test.ts
git commit -m "feat(theme): tokens turquesa y alias loloteal a turquesa-texto"
```

---

### Task 2: Contraste de tokens y clases de botón

**Files:**
- Create: `components/ui/button-classes.ts`
- Test: `components/__tests__/button-classes.test.ts`, `components/__tests__/palette-tokens.test.ts` (se añade el bloque de contraste)

**Interfaces:**
- Consumes: tokens de Task 1.
- Produces:
  ```ts
  export type ButtonVariant = "primary" | "outline" | "danger";
  export type ButtonState = { disabled?: boolean; loading?: boolean; success?: boolean };
  export function buttonClasses(variant: ButtonVariant, state?: ButtonState): string;
  ```

- [ ] **Step 1: Write the failing tests**

En `components/__tests__/palette-tokens.test.ts`, agregar un `describe("contrast")` con un helper `contrast(hexA, hexB)` (fórmula WCAG relativa) y estos casos exactos:
- `"tinta on turquesa is at least 5.75:1"`
- `"tinta on white is at least 14:1"`
- `"turquesa-texto on white is at least 5:1"`
- `"ok on white is at least 5.3:1"`
- `"agotado on white is at least 6.9:1"`
- `"turquesa-titular on white is at least 3.7:1 (large text only)"`

En `components/__tests__/button-classes.test.ts`:

```ts
import { buttonClasses } from "../ui/button-classes";

it("primary button uses turquesa fill and tinta text, never white", () => {
  const c = buttonClasses("primary");
  expect(c).toContain("bg-turquesa");
  expect(c).toContain("text-tinta");
  expect(c).not.toContain("text-white");
});
it("outline button uses white background with turquesa-texto border and text", () => {
  const c = buttonClasses("outline");
  expect(c).toContain("bg-white");
  expect(c).toContain("border-turquesa-texto");
  expect(c).toContain("text-turquesa-texto");
});
it("danger button uses agotado outline and text", () => {
  const c = buttonClasses("danger");
  expect(c).toContain("border-agotado");
  expect(c).toContain("text-agotado");
  expect(c).not.toContain("bg-agotado");
});
it("every variant has min-h-11 (44px)", () => {
  for (const v of ["primary", "outline", "danger"] as const) expect(buttonClasses(v)).toContain("min-h-11");
});
it("disabled primary uses BFE9E9 fill and 5C6E6D text", () => {
  const c = buttonClasses("primary", { disabled: true });
  expect(c).toContain("disabled:bg-[#BFE9E9]");
  expect(c).toContain("text-[#5C6E6D]");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/__tests__/button-classes.test.ts components/__tests__/palette-tokens.test.ts`
Expected: FAIL: el módulo `../ui/button-classes` no existe.

- [ ] **Step 3: Implement `buttonClasses`**

Base común: `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-turquesa-texto lolo-btn`. Variantes: `primary` → `bg-turquesa text-tinta border-2 border-transparent`; `outline` → `bg-white text-turquesa-texto border-2 border-turquesa-texto`; `danger` → `bg-white text-agotado border-2 border-agotado`. Estado `disabled` añade `disabled:bg-[#BFE9E9] disabled:text-[#5C6E6D] disabled:border-transparent disabled:cursor-not-allowed` (outline deshabilitado: `disabled:border-borde-control disabled:text-[#5C6E6D]`). Estado `loading` añade `aria-busy` por el componente, no clase. Estado `success` añade `lolo-btn-success`. Un solo lugar de verdad: cualquier cambio de variante pasa por este archivo.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/__tests__/button-classes.test.ts components/__tests__/palette-tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/button-classes.ts components/__tests__/button-classes.test.ts components/__tests__/palette-tokens.test.ts
git commit -m "feat(ui): clases de botón primario, contorno y peligro con contraste verificado"
```

---

### Task 3: Movimiento y reducir movimiento en CSS

**Files:**
- Modify: `app/globals.css`
- Test: `components/__tests__/button-motion.test.ts`

**Interfaces:**
- Consumes: clases `lolo-btn` y `lolo-btn-success` de Task 2.
- Produces: clases `lolo-btn`, `lolo-btn-spinner`, `lolo-btn-check` (con `path` hijo), `lolo-btn-success`; keyframes `lolo-spin` y `lolo-draw`.

- [ ] **Step 1: Write the failing tests**

```ts
// components/__tests__/button-motion.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const css = readFileSync(process.cwd() + "/app/globals.css", "utf8");

it("hover lifts the button 2px only where hover is available", () => {
  expect(css).toMatch(/@media \(hover: ?hover\)[\s\S]*\.lolo-btn:hover[\s\S]*translateY\(-2px\)/);
});
it("press scales the button to 0.97", () => {
  expect(css).toMatch(/\.lolo-btn:active[\s\S]*scale\(0\.97\)/);
});
it("loading spinner rotates with keyframes lolo-spin", () => {
  expect(css).toMatch(/@keyframes lolo-spin/);
  expect(css).toMatch(/\.lolo-btn-spinner[\s\S]*animation:[^;]*lolo-spin/);
});
it("check path is drawn with keyframes lolo-draw in 420ms", () => {
  expect(css).toMatch(/@keyframes lolo-draw/);
  expect(css).toMatch(/\.lolo-btn-check path[\s\S]*stroke-dasharray/);
  expect(css).toMatch(/\.lolo-btn-check path[^}]*lolo-draw 420ms/);
});
it("reduced motion sets transition and check animation durations to 1ms", () => {
  const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  expect(block).toMatch(/transition-duration:\s*1ms/);
  expect(block).toMatch(/lolo-btn-check path[\s\S]*animation-duration:\s*1ms/);
});
it("loading spinner slows down under reduced motion", () => {
  const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  expect(block).toMatch(/lolo-btn-spinner[^}]*animation-duration:\s*1600ms/);
  expect(block).not.toMatch(/lolo-btn-spinner[^}]*animation:\s*none/);
});
it("success check is drawn without animation under reduced motion", () => {
  const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  expect(block).toMatch(/lolo-btn-check path[\s\S]*stroke-dashoffset:\s*0/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/__tests__/button-motion.test.ts`
Expected: FAIL: las reglas no existen en `app/globals.css`.

- [ ] **Step 3: Implement the CSS**

Agregar a `app/globals.css` después de `@tailwind utilities`:
- `.lolo-btn { transition: transform 180ms ease, background-color 180ms ease, box-shadow 180ms ease; }`
- `@media (hover: hover) { .lolo-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 14px rgba(22,48,47,.14); } }`
- `.lolo-btn:active:not(:disabled) { transform: scale(0.97); }`
- `.lolo-btn-spinner { animation: lolo-spin 800ms linear infinite; }` y `@keyframes lolo-spin { to { transform: rotate(360deg); } }`
- `.lolo-btn-check path { stroke-dasharray: 24; stroke-dashoffset: 24; animation: lolo-draw 420ms ease forwards; }` y `@keyframes lolo-draw { to { stroke-dashoffset: 0; } }`
- `@media (prefers-reduced-motion: reduce) { .lolo-btn, .lolo-btn * { transition-duration: 1ms !important; } .lolo-btn-spinner { animation-duration: 1600ms !important; } .lolo-btn-check path { animation-duration: 1ms !important; stroke-dashoffset: 0; } }` (el giro sigue, más lento; no se usa `animation: none`)

Test: `npx vitest run components/__tests__/button-motion.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css components/__tests__/button-motion.test.ts
git commit -m "feat(ui): movimiento de botones y reducir movimiento"
```

---

### Task 4: Componente Button

**Files:**
- Create: `components/ui/Button.tsx`
- Test: `components/__tests__/Button.test.tsx`

**Interfaces:**
- Consumes: `buttonClasses`, `ButtonVariant`, `ButtonState` (Task 2); clases de Task 3.
- Produces:
  ```ts
  export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;   // default "primary"
    loading?: boolean;         // muestra giro, aria-busy, disabled
    success?: boolean;         // muestra check que se dibuja
  };
  export function Button(props: ButtonProps): JSX.Element;
  ```

- [ ] **Step 1: Write the failing tests**

```tsx
// components/__tests__/Button.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../ui/Button";

it("renders a primary button by default", () => {
  render(<Button>Guardar</Button>);
  expect(screen.getByRole("button", { name: "Guardar" }).className).toContain("bg-turquesa");
});
it("loading button shows a spinner, sets aria-busy and is disabled", () => {
  render(<Button loading>Guardando</Button>);
  const b = screen.getByRole("button", { name: /Guardando/ });
  expect(b).toHaveAttribute("aria-busy", "true");
  expect(b).toBeDisabled();
  expect(b.querySelector(".lolo-btn-spinner")).not.toBeNull();
});
it("success state renders an animated check path", () => {
  render(<Button success>Listo</Button>);
  expect(screen.getByRole("button", { name: /Listo/ }).querySelector(".lolo-btn-check path")).not.toBeNull();
});
it("danger variant renders agotado outline", () => {
  render(<Button variant="danger">Quitar</Button>);
  expect(screen.getByRole("button", { name: "Quitar" }).className).toContain("border-agotado");
});
it("forwards onClick and type", () => {
  const onClick = vi.fn();
  render(<Button type="submit" onClick={onClick}>Ok</Button>);
  screen.getByRole("button").click();
  expect(onClick).toHaveBeenCalledTimes(1);
});
```

(Importar `vi` de `vitest` en el archivo.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/__tests__/Button.test.tsx`
Expected: FAIL: `../ui/Button` no existe.

- [ ] **Step 3: Implement `Button.tsx`**

Componente `forwardRef` no es necesario. Usar `buttonClasses(variant, { disabled, loading, success })` y `className` extra al final. Cuando `loading`, renderizar un `<svg className="lolo-btn-spinner h-4 w-4" aria-hidden>` con un arco; `disabled` = `props.disabled || loading`; `aria-busy={loading || undefined}`. Cuando `success`, renderizar `<svg className="lolo-btn-check h-4 w-4" viewBox="0 0 24 24" aria-hidden><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>` antes del hijo. El hijo siempre se renderiza para que el nombre accesible sea el texto.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/__tests__/Button.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/Button.tsx components/__tests__/Button.test.tsx
git commit -m "feat(ui): componente Button con variantes, carga y check"
```

---

### Task 5: Migración del sitio público y acceso

**Cuándo:** después de que A esté en `main` (A quita "Movimientos" de `NavBar.tsx`).

**Files (Modify):**
- `app/page.tsx` (líneas 38, 82, 90: gradiente `from-loloteal`, `#0B5E5E`, `#147E7E`; reemplazar fills por `Button`; el gradiente del encabezado pasa a `from-turquesa-texto`)
- `app/login/page.tsx` (línea 110 y textos `text-loloteal`)
- `app/error.tsx`, `app/not-found.tsx`, `app/global-error.tsx` (botón `bg-loloteal text-white` → `Button`)
- `app/etiquetas/page.tsx` (línea 22)
- `app/cuenta/page.tsx` (líneas 52, 121)
- `components/layout/StaffLoadState.tsx` (línea 67)
- `components/layout/NavBar.tsx` (6 usos de `primary`/`loloteal` en estados activos: usar `text-turquesa-texto` y subrayado, nunca turquesa como texto)

**Interfaces:**
- Consumes: `Button` (Task 4).

- [ ] **Step 1: Write the failing test** — en `components/__tests__/ErrorPages.test.tsx` (existente) y `LoginPage.test.tsx` (existente) no cambiar expectativas de texto; agregar en `components/__tests__/palette-sweep.test.ts` el caso `it("public and access files have no bg-loloteal or text-white fill", ...)` que lee estos archivos con `fs` y falla si contienen `bg-loloteal` o `text-white` en la misma línea del botón.
- [ ] **Step 2: Run** `npx vitest run components/__tests__/palette-sweep.test.ts` → FAIL.
- [ ] **Step 3: Implement** reemplazar cada botón por `<Button>` (variante `primary` para acción principal, `outline` para "Ver prenda"/navegar). Quitar `text-white` de los encabezados en `bg-turquesa-texto` solo si el fondo es turquesa-texto (el blanco sobre `#0C7C7C` es 5.01:1, permitido para texto de encabezado; documentar en el comentario de cambio).
- [ ] **Step 4: Run** `npx vitest run components/__tests__/palette-sweep.test.ts components/__tests__/LoginPage.test.tsx components/__tests__/ErrorPages.test.tsx components/__tests__/NavBar.test.tsx` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(ui): paleta turquesa y Button en sitio público y acceso"`

---

### Task 6: Migración de ventas y POS

**Cuándo:** después de que E esté en `main` (E cambia `app/pos/page.tsx` y `SaleCart.tsx`, y agrega `SaleProductSearch.tsx`). Releer los números de línea antes de editar.

**Files (Modify):**
- `components/sales/styles.ts` (línea 3: `focus-visible:outline-loloteal` → `outline-turquesa-texto`; el string base de botón pasa a usar `buttonClasses`)
- `components/sales/SaleCart.tsx` (3, más las filas pendientes y "Reintentar" de E), `components/sales/SaleProductSearch.tsx` (de E), `components/sales/PendingPayments.tsx` (2, `bg-loloteal text-white` → primario; botones de confirmar cobro)
- `components/sales/CancelSalePanel.tsx` (línea 78: `bg-[#C23A2B] text-white` → `Button variant="danger"`; confirmación dentro de la pantalla se mantiene)
- `components/sales/RangePicker.tsx` (59: chip seleccionado `bg-loloteal text-white` → `bg-turquesa text-tinta`)
- `components/sales/PaymentPicker.tsx` (2), `components/sales/LowStockTable.tsx` (62)
- `app/pos/page.tsx` (344: botón de cobro → `Button` primario; 5 usos de `loloteal`)
- `app/ventas/page.tsx` (92: encabezado `bg-loloteal text-white` → `bg-turquesa-texto`; 126 botón → `Button`)

**Interfaces:**
- Consumes: `Button`, `buttonClasses` (Tasks 2, 4).

- [ ] **Step 1: Write the failing test** — en `palette-sweep.test.ts` agregar `it("sales files use turquesa primary and agotado danger", ...)`: lee `components/sales/*.tsx` y `app/pos/page.tsx`, `app/ventas/page.tsx`, y falla si aparece `bg-loloteal`, `text-white` en botones, o `#C23A2B`.
- [ ] **Step 2: Run** `npx vitest run components/__tests__/palette-sweep.test.ts` → FAIL.
- [ ] **Step 3: Implement** migrar cada archivo listado. Chips de selección (RangePicker, PaymentPicker) usan `bg-turquesa text-tinta` cuando activos y `bg-white text-turquesa-texto border-turquesa-texto` cuando inactivos.
- [ ] **Step 4: Run** `npx vitest run components/__tests__/SaleCart.test.tsx components/__tests__/PosPage.test.tsx components/__tests__/VentasPage.test.tsx components/__tests__/palette-sweep.test.ts` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(ui): paleta turquesa y botones en ventas y POS"`

---

### Task 7: Migración de productos

**Cuándo:** después de que A, G y D estén en `main` (los tres reescriben `NewProductForm.tsx`, `ProductAdminSheet.tsx` y `app/productos/page.tsx`; C agrega la sección "Sitio web" de la ficha, que ya usa `Button`). Releer los números de línea: los de abajo son de `main` d86ac21 y van a cambiar.

**Files (Modify):**
- `app/productos/page.tsx` (7 usos; botones 190, 204 → `Button`)
- `app/productos/unir/page.tsx` (1), `app/productos/unir/MergeGroups.tsx` (6; "Se queda" chip → `bg-turquesa text-tinta`; botones 160, 173 → `Button`)
- `components/products/NewProductForm.tsx` (11; botón 103 y 601 → `Button`; selector de modo 383 → chip activo `bg-turquesa text-tinta`)
- `components/products/ProductAdminSheet.tsx` (5; botón 52 → `Button`)
- `components/products/AddSizeForm.tsx` (3; botón 213 → `Button`)
- `components/products/ExistingProductSearch.tsx` (4), `components/products/BrandCombobox.tsx` (3), `components/products/SizeRows.tsx` (2), `components/products/ProductPhotoButton.tsx` (2), `components/products/ProductPhotoCapture.tsx` (2)
- `components/products/ProductCard.tsx` (1)
- Nuevos de G y D (si traen clases sueltas): `components/products/ClassificationFields.tsx`, `components/products/AltaTour.tsx`

**Interfaces:**
- Consumes: `Button`, `buttonClasses`.

- [ ] **Step 1: Write the failing test** — `palette-sweep.test.ts`: `it("products files have no bg-loloteal primary fills", ...)` sobre los archivos listados.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** migrar. Acción "Quitar" de talla o producto usa `variant="danger"` y mantiene confirmación existente.
- [ ] **Step 4: Run** `npx vitest run components/__tests__/NewProductForm components/__tests__/ProductAdminSheet.test.tsx components/__tests__/MergeGroups.test.tsx components/__tests__/ProductosAdmin.test.tsx components/__tests__/ProductosPhotos.test.tsx components/__tests__/ProductPhotoCapture.test.tsx components/__tests__/palette-sweep.test.ts` → PASS. (Los archivos `NewProductForm*.test.tsx` se corren con el patrón `NewProductForm`.)
- [ ] **Step 5: Commit** `git commit -m "feat(ui): paleta turquesa y botones en productos"`

---

### Task 8: Migración de inventario y escáner

**Cuándo:** después de que A, D y E estén en `main`. A borra `StockMovementPanel.tsx`, `app/movimientos/MovementList.tsx` y `components/__tests__/MovementList.test.tsx`, y quita traspasos, correcciones y mermas; D cambia `FORMATS` de `Scanner.tsx`; E agrega el modo continuo. Esta tarea **no** colorea traspaso, ajuste ni merma (ya no existen; la lista de acciones primarias de paleta §3 se lee sin ellos).

**Files (Modify):**
- `components/inventory/SumToMyStore.tsx` (2; 98 → `Button`; es la única entrada de piezas, incluido "Agregar nuevamente" de E), `components/inventory/AddLocationForm.tsx` (3; 91 → `Button`)
- `components/inventory/Scanner.tsx` (2; 229 primario, 258 `bg-red-600 text-white` → `Button variant="danger"`)
- `components/inventory/ManualCodeEntry.tsx` (2; 42 → `Button`), `components/inventory/StockSummary.tsx` (1; "Disponible"/"Agotado" con texto y `text-ok`/`text-agotado`)
- `app/escanear/page.tsx` (botón rojo `bg-red-600 text-white` → `Button variant="danger"`; localizar con `grep -n "bg-red-600" app/escanear/page.tsx`, la línea 237 de hoy cambia con A y E)
- `app/globals.css`: la regla `#reader button { background-color: #007272 !important; color: white !important; }` pasa a `background-color: #22B8B8 !important; color: #16302F !important;` (el escáner lo pinta html5-qrcode; no se puede poner la clase `Button` en su DOM).

**Interfaces:**
- Consumes: `Button`, tokens `ok`/`agotado`.

- [ ] **Step 1: Write the failing test** — `palette-sweep.test.ts`: `it("scanner override uses turquesa fill and tinta text, not white", ...)` lee `app/globals.css` y espera `#22B8B8` y `#16302F` en la regla `#reader button`. Y `it("stock labels pair color with text", ...)` busca en `StockSummary.tsx` la cadena "Disponible" y "Agotado".
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** migrar cada archivo y el override de `#reader button`. Antes, `ls components/inventory app/movimientos 2>/dev/null` confirma que el panel y la pantalla de movimientos ya no existen; si existen, A no está en `main`: esperar.
- [ ] **Step 4: Run** `npx vitest run components/__tests__/Scanner.test.tsx components/__tests__/Scanner-strictmode.test.tsx components/__tests__/Scanner-continuous.test.tsx components/__tests__/ManualCodeEntry.test.tsx components/__tests__/StockSummary.test.tsx components/__tests__/AddLocationForm.test.tsx app/escanear/__tests__/page.test.tsx components/__tests__/palette-sweep.test.ts` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(ui): paleta turquesa y botones en inventario y escáner"`

---

### Task 9: Catálogo público (zona visual-3d)

**Cuándo:** después de que C esté en `main`. C es dueño de la estructura de la tarjeta: quita el CTA de WhatsApp de `ProductCard3D` y pone "Guardar en favoritos" y "Ver prenda" (contorno) en `CatalogGrid`. Esta tarea **solo cambia colores**; no agrega, quita ni convierte botones.

**Files (Modify):**
- `components/products/ProductCard3D.tsx` (solo colores que queden después de C; el bloque del CTA lo controla `SHOW_WHATSAPP_CTA` de C y no se toca)
- `components/virtual-store/CatalogGrid.tsx`, `components/favorites/*.tsx` (de C; verificar que ya usan `Button`/`buttonClasses`, sin hex fijos)
- `components/virtual-store/CatalogDrawer.tsx` (7; `bg-primary text-white` 93 → `bg-turquesa text-tinta`)
- `components/virtual-store/DepartmentChips.tsx` (23; `border-loloteal bg-loloteal text-white` → `border-turquesa-texto bg-turquesa text-tinta`)
- `components/virtual-store/ProductHotspotModal.tsx` (2; línea 96 → turquesa + tinta)
- `components/virtual-store/VirtualStoreCatalog.tsx` (9), `components/virtual-store/VirtualStoreCanvas.tsx` (10), `components/virtual-store/StoreMinimap.tsx` (5): reemplazar `loloteal` por tokens; halos y aros con `turquesa`
- `lib/virtual-store/zones.ts` (1): color de zona, revisar si es texto (si lo es, usar `turquesa-texto`)

**Interfaces:**
- Consumes: `Button`, tokens. Nota: `components/virtual-store/` pertenece al agente `visual-3d`; coordinar antes de editar (ver Execution notes).

- [ ] **Step 1: Write the failing test** — `palette-sweep.test.ts`: `it("virtual store uses no loloteal or primary text colors", ...)` sobre `components/virtual-store/*.tsx` y `components/products/ProductCard3D.tsx`, falla si aparece `text-loloteal`, `text-primary`, `text-turquesa(\s|")`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** migrar. Ningún texto usa `text-turquesa`.
- [ ] **Step 4: Run** `npx vitest run components/__tests__/VirtualStore.test.tsx components/__tests__/CatalogA11y.test.tsx components/__tests__/CatalogGrid.test.tsx components/__tests__/CatalogDepartments.test.tsx components/__tests__/palette-sweep.test.ts` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(ui): paleta turquesa y botones en catálogo público"`

---

### Task 10: Barrido final y cierre

**Files:**
- Modify: cualquier archivo que el barrido encuentre (`app/`, `components/`), y `tailwind.config.ts` para retirar `loloteal-dark` si ya no tiene usos.
- Test: `components/__tests__/palette-sweep.test.ts`

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Write the failing test** — en `palette-sweep.test.ts`:
  - `it("no primary fill uses white text", ...)`: recorre `app/**/*.tsx` y `components/**/*.tsx`, y falla si una línea contiene `bg-loloteal` o `bg-turquesa` junto con `text-white` (excluir `components/__tests__`).
  - `it("no source file uses the old #007272 literal", ...)`: busca `#007272` en `app/` y `components/` (excluir `__tests__`) y espera cero. Tras la migración, `globals.css` ya no lo contiene.
  - `it("no loloteal-dark remains", ...)` solo si se retiró el token.
  - `it("no hardcoded palette hex in components", ...)`: busca `bg-[#22B8B8]`, `text-[#16302F]`, `border-[#0C7C7C]`, `text-[#0C7C7C]` y `#9A3B2E` en `app/**/*.tsx` y `components/**/*.tsx` (excluir `__tests__` y la regla `#reader button` de `globals.css`) y espera cero. Atrapa colores fijos que se hayan colado en C, D o E.
- [ ] **Step 2: Run** `npx vitest run components/__tests__/palette-sweep.test.ts` → FAIL (con los restos que falten).
- [ ] **Step 3: Fix** los restos que reporte el test. Revisar a mano `app/page.tsx` líneas con `#0B5E5E`, `#147E7E`, `#084848`, `#106666`: reemplazar por tokens (`turquesa-texto`, `turquesa`).
- [ ] **Step 4: Verify** con la suite completa: `npm test`, `npm run lint`, `npm run build`. Expected: todos en verde. Si una prueba existente asertaba `bg-loloteal`, actualizar la aserción al nuevo token, no la regla.
- [ ] **Step 5: Commit** `git commit -m "chore(ui): barrido de paleta y verificación de contraste"`

---

## Execution notes

- Orden: Tasks 1–4 (base) se mezclan el jueves 12, primero que cualquier plan. Tasks 5–9 se aplican por zona según el "Cuándo" de cada una (cronograma §3, paso 8), el lunes 16 a más tardar. Task 10 al final.
- Routing de agentes: `frontend-pwa` para `app/` y `components/` salvo `components/virtual-store/`; `visual-3d` para `components/virtual-store/`, `lib/virtual-store/` y el riel. Task 9 coordina con `visual-3d`.
- Verificación visual opcional: capturas de login, POS, ficha de producto, catálogo público en 390 px, con y sin `prefers-reduced-motion` (Playwright, fuera del alcance de Vitest).
- No modo oscuro en este subsistema. Los tokens M3 (`surface`, `on-surface`) no se tocan salvo lo indicado.

## Questions the spec does not answer

1. `loloteal` y `primary` (52 usos de `text-*` y `bg-*` con el alias): ¿el alias apunta a `#0C7C7C` (este plan) o a `#22B8B8`? Con `#22B8B8` cualquier texto que use el alias queda en turquesa, contra la regla.
2. Estado deshabilitado del botón de contorno: la spec solo define el relleno primario. Este plan usa `borde-control` `#7F9392` y texto `#5C6E6D`.
3. Botones rojos actuales (`CancelSalePanel`, `escanear`, `Scanner`): la spec dice contorno `agotado` para "quitar". ¿También para cancelar venta y "rechazar escaneo"?
4. ~~Reducir movimiento.~~ **Resuelta (decisión 11):** el giro se hace más lento (1600 ms), no se detiene (Task 3).
5. ~~Favoritos y CTA de WhatsApp.~~ **Resuelta:** los implementa C (Tasks 4–8); B solo colorea (Task 9).
6. `borde-control` no tiene uso definido: ¿bordes de campos de formulario?
7. El override de `#reader button` (html5-qrcode) no puede llevar la clase `Button`; este plan lo pinta por CSS. ¿Aceptable?
8. Hover de elevación: este plan lo limita a `(hover: hover)` para no dejar botones "pegados" en móvil tras tocar. Confirmar.
9. ~~Duración del check.~~ **Resuelta (auditoría C6):** 420 ms, como el alta (spec §4.5).
10. ~~Traspaso y ajuste como acciones primarias (paleta §3).~~ **Resuelta:** A los quita; Task 8 no los colorea.

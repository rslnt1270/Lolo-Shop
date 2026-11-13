# Pulido de la entrega 1 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los minors de la entrega 1 (`main` d05d68b, PR #34) que la revisión final marcó para la siguiente entrega y que viven en archivos de planes ya terminados (A y D). Los minors del POS van en el plan E (Task 6a) y la guarda de `catalogPhotosCheckedAt` en el plan C (Task 2c).

**Architecture:** Cambios pequeños y aislados: accesibilidad del recorrido del alta, un texto, una función pura de color, el recorte de `fetchLocationsAction` por rol y una prueba que faltaba. Sin migraciones, sin cambios en el cobro.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Vitest + React Testing Library.

**Origen:** ledger de la entrega 1 (`LoloShop-vf/.superpowers/sdd/2026-11-11-version-final-cronograma/progress.md`): G15 (AltaTour), G14 ("Para catálogo"; título con el color tecleado), G04 y revisión final (nombres de tiendas al colaborador; prueba de recorte en `addVariantAction`).

**Grupo:** G21 (`docs/superpowers/plans/2026-11-12-entrega-2-cronograma.md`). Se mezcla **después de G19** (plan C Task 2c), que también edita `NewProductForm.tsx` y `AltaTour.tsx`.

## Global Constraints

- Sin migraciones, sin cambios de esquema, sin tocar `lib/sales/*`.
- Rol y tienda se releen de la base (`currentUserOrNull`).
- Botones con `Button` de B base; sin hex fijos nuevos.
- Texto en español de México, tuteo.

---

### Task P1: Recorrido del alta con trampa de foco y retorno del foco

**Files:**
- Modify: `components/products/AltaTour.tsx`
- Test: `components/__tests__/AltaTour.test.tsx`

**Interfaces:** props sin cambio (`{ open: boolean; onClose: () => void }`).

Reglas: al abrir, guardar `document.activeElement` (normalmente "¿Cómo registrar?" o el primer campo del alta). Con el diálogo abierto, `Tab` en el último elemento enfocable vuelve al primero y `Shift+Tab` en el primero va al último (enfocables = `button:not([disabled])` dentro de `dialogRef`). Al cerrar (por "Saltar", "Empezar" o `Escape`), devolver el foco al elemento guardado si sigue en el documento. Se conserva el foco inicial en `[data-tour-next]`.

- [ ] **Step 1: Tests:**
  - `"Tab desde el último botón vuelve al primero sin salir del recorrido"`
  - `"Shift+Tab desde el primer botón va al último"`
  - `"al cerrar con Saltar, el foco vuelve a ¿Cómo registrar?"`
  - `"al cerrar con Escape, el foco vuelve al elemento que tenía el foco"`
- [ ] **Step 2: Run** `npm test -- components/__tests__/AltaTour.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** en el `onKeyDown` existente y un `useEffect` sobre `open`.
- [ ] **Step 4: Run** `npm test -- components/__tests__/AltaTour.test.tsx components/__tests__/NewProductForm-alta.test.tsx` → PASS.
- [ ] **Step 5: Commit.** `git commit -m "fix(alta): trampa de foco y retorno del foco en el recorrido"`

---

### Task P2: "Para catálogo" → "Catálogo"

**Files:**
- Modify: `components/products/NewProductForm.tsx` (opción del selector de modo `{ value: "catalog", label: "Para catálogo" }` → `"Catálogo"`)
- Test: `components/__tests__/NewProductForm-modes.test.tsx`, `components/__tests__/NewProductForm-alta.test.tsx`, `components/__tests__/NewProductForm-errors.test.tsx` (actualizar los textos buscados)

- [ ] **Step 1:** cambiar en las pruebas `"Para catálogo"` por `"Catálogo"` (con `{ exact: true }` o `name: /^Catálogo$/` para no chocar con "Listo para catálogo") y agregar `"el selector de modo dice Solo stock y Catálogo"`.
- [ ] **Step 2: Run** `npm test -- components/__tests__/NewProductForm` → FAIL.
- [ ] **Step 3: Implementar** (una línea).
- [ ] **Step 4: Run** → PASS. `grep -rn "Para catálogo" app components lib` → sin resultados.
- [ ] **Step 5: Commit.** `git commit -m "fix(alta): la opción de modo se llama Catálogo"`

---

### Task P3: Título sugerido con la etiqueta de color resuelta

Hoy el título sugerido usa el texto tecleado ("Playera Nike rosas") aunque se guarde la etiqueta de la lista ("Rosa"), y al guardar se compara solo por minúsculas exactas.

**Files:**
- Modify: `lib/domain/product-reference.ts` (nueva función pura)
- Modify: `components/products/NewProductForm.tsx` (efecto del título sugerido y resolución del color en el guardado)
- Test: `lib/domain/__tests__/product-reference.test.ts`, `components/__tests__/NewProductForm-alta.test.tsx`

**Interfaces (Produces):**
```ts
/** Etiqueta de la lista con la misma clave (normalizeColorKey); si no hay, displayColor(typed); vacío o sin clave → null. */
export function resolveColorLabel(typed: string, options: readonly string[]): string | null;
```
En `NewProductForm`: el efecto del título usa `resolveColorLabel(colorText, colors)`; en el guardado, `known = colors.find(...)` se sustituye por "si `resolveColorLabel` devuelve una etiqueta que está en `colors`, se usa sin llamar `createColorAction`; si no, `createColorAction(typed)` como hoy".

- [ ] **Step 1: Tests:**
  - `product-reference.test.ts`: `"resolveColorLabel: 'rosas' con la lista ['Rosa'] → 'Rosa'"`; `"sin coincidencia devuelve displayColor"`; `"texto vacío o solo símbolos → null"`.
  - `NewProductForm-alta.test.tsx`: `"el título sugerido usa la etiqueta de la lista: 'rosas' → '… rosa'"`; `"color que ya está en la lista con otra forma no llama createColorAction"`.
- [ ] **Step 2: Run** `npm test -- lib/domain/__tests__/product-reference.test.ts components/__tests__/NewProductForm-alta.test.tsx` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Run** → PASS, más `npm test -- components/__tests__/NewProductForm`.
- [ ] **Step 5: Commit.** `git commit -m "fix(alta): el título sugerido usa el color de la lista"`

---

### Task P4: `fetchLocationsAction` recortada por rol

Hoy devuelve todas las tiendas a cualquier sesión. El colaborador solo debe recibir la suya (decisión 4 de la entrega 1: ve solo su tienda; no se nombra la otra).

**Files:**
- Modify: `lib/actions.ts` (`fetchLocationsAction`)
- Modify (si hace falta): `lib/domain/inventory-scope.ts` (helper puro `scopeLocations<T extends { id: string }>(locations: T[], viewer: InventoryViewer): T[]`)
- Test: `lib/__tests__/actions-inventory-scope.test.ts`, `lib/domain/__tests__/inventory-scope.test.ts` (si se agrega el helper)

**Interfaces:** firma sin cambio: `fetchLocationsAction(): Promise<Location[] | null>`. Colaborador → solo `locationId` del usuario releído de la base (`[]` si no tiene); owner y manager → todas.

Consumidores revisados (sin cambio de código): `/pos` no la llama para el colaborador; `/escanear` solo usa el nombre de su tienda ("Registrando en"); `/ventas` y su tablero ya recortan al colaborador a su tienda (`scopeDashboardQuery`); `/productos` y `/` (`StockSummary`) reciben inventario ya recortado.

- [ ] **Step 1: Tests:** `"fetchLocationsAction: el colaborador recibe solo su tienda"`; `"colaborador sin tienda recibe []"`; `"owner y manager reciben todas"`; `"sesión vieja de owner con rol colaborador en la base → solo su tienda"`.
- [ ] **Step 2: Run** `npm test -- lib/__tests__/actions-inventory-scope.test.ts` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Run** → PASS, más `npm test -- lib/__tests__/actions-permissions.test.ts app/escanear/__tests__/page.test.tsx components/__tests__/VentasPage.test.tsx components/__tests__/ProductosAdmin.test.tsx`.
- [ ] **Step 5: Commit.** `git commit -m "fix(permisos): el colaborador solo recibe el nombre de su tienda"`

---

### Task P5: Prueba del recorte de inventario en `addVariantAction`

La acción ya devuelve `withVariant(scopeVariantMatch(match, user))`, pero ninguna prueba lo fija. (La prueba de tienda ajena, "colaborador en otra tienda → FORBIDDEN", ya existe.)

**Files:** Test `lib/__tests__/actions-sizes.test.ts`.

- [ ] **Step 1: Test:** `"addVariantAction: el colaborador recibe el producto solo con el inventario de su tienda"` (producto con existencias en `loc-1` y `loc-2`; colaborador de `loc-1` agrega una talla; todas las filas de `inventory` del resultado son de `loc-1`).
- [ ] **Step 2: Run** `npm test -- lib/__tests__/actions-sizes.test.ts` → PASS de entrada (es regresión). Si falla, el hueco es real: corregir en `lib/actions.ts` en el mismo commit.
- [ ] **Step 3: Commit.** `git commit -m "test(tallas): recorte por tienda del resultado de addVariantAction"`

---

### Task P6: Verificación del grupo

- [ ] `npm test && npm run lint && npm run build` → verde. Sin `test:db` nuevo en este plan (correr el completo en el cierre de la entrega).

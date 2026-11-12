# Subsistema A: permisos y limpieza de inventario Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quitar `/movimientos`, los traspasos entre tiendas, las correcciones y las mermas (UI, server actions y capa de datos), dejar que el colaborador edite precios en el servidor y en la ficha, que el colaborador vea solo el stock de su tienda, y confirmar que el alta de producto permite crear marcas.

**Architecture:** Cambios aditivos en `lib/auth/permissions.ts` (constante de roles que pueden editar precio) y en el gate de `lib/products/actions.ts`; la UI de la ficha separa "puede editar precio" de "puede editar datos". La limpieza elimina código muerto de traspasos, correcciones, mermas y de la pantalla de movimientos; `StockMovementPanel` desaparece y `/escanear` usa `SumToMyStore` (entrada `restock`) para sumar piezas. Las filas `Movement` se siguen escribiendo (ventas, entradas) y no se borran; los valores `DAMAGE`, `ADJUSTMENT` y `TRANSFER` del enum `MovementType` se conservan en la base con sus filas viejas. No hay migraciones ni cambios de esquema.

**Tech Stack:** Next.js (App Router, versión de `package.json`), React, TypeScript, Prisma 5.22 sobre Postgres, next-auth, Vitest (`npm test`) y Vitest con config de base (`npm run test:db`, `vitest.db.config.ts`).

**Orden de mezcla:** segundo, después de B base (T1–T4) y antes de las migraciones (cronograma §3). Las tareas de B por zona (T5, T7, T8) se rebasan sobre A; A no aplica estilos nuevos.

**Decisiones aplicadas** (`.superpowers/sdd/2026-11-11-version-final/decisiones.md`): 4 (el colaborador ve solo su tienda) y 6 (sin correcciones, mermas, traspasos ni `/movimientos` para ningún rol).

**Spec:** `docs/superpowers/specs/2026-11-11-alcance-inventario-simplificado-design.md` (§2 qué se quita, §4 supuestos, §5 decisiones) y `docs/superpowers/specs/2026-11-11-alta-producto-tienda-design.md` (§6 referencia de producto, §8 decisiones de la revisión: permisos, marcas).

## Global Constraints

- Sin migraciones ni cambios en `prisma/schema.prisma`. No ejecutar `prisma migrate`. El enum `MovementType` conserva `DAMAGE`, `ADJUSTMENT` y `TRANSFER` (filas viejas); solo la app deja de escribirlos.
- Las filas `Movement` se siguen creando en ventas y entradas; no se borran ni se cambia su `type`.
- El rol se lee de la base en cada acción: `getCurrentUser()` (`lib/auth/current-user.ts:17-25`), no del JWT de la sesión.
- Ningún permiso se decide solo en la UI: cada server action vuelve a validar el rol.
- Solo cambian permisos de precio. El colaborador sigue sin poder editar título, marca, departamento, categoría, activar/desactivar ni fusionar.
- Textos de UI y de error en español, con los mensajes ya existentes cuando aplique.
- Commits en Conventional Commits, en una rama nueva desde `main` (no en `main`). Cada commit lleva las líneas de atribución indicadas por el sistema.
- No se commitea ningún `.env` ni secreto. Los datos de prueba usan IDs ficticios.

## Review Focus

1. **Rol revocado en la base:** un usuario degradado a colaborador (o dado de baja) intenta cambiar un precio con una sesión vieja que dice `owner`. Esperado: se usa el rol de la base; con colaborador cambia el precio, con usuario inexistente responde `SESSION`.
2. **Conflicto de precio para colaborador:** dos personas editan la misma talla y el colaborador guarda con un precio esperado viejo. Esperado: `CONFLICT` con el precio vigente, sin cambiar nada.
3. **Etiqueta solo en otra tienda en `/escanear`:** sin traspaso, la pantalla avisa que la etiqueta está en otra tienda y no ofrece ninguna acción de mover piezas, sin error.
4. **Marca inactiva con el mismo nombre en el alta:** `createBrandAction` no reutiliza la marca inactiva y responde con el mensaje de fusión existente, en vez de crear un duplicado.
5. **URL antigua `/movimientos`:** un marcador o enlace viejo no debe mostrar la pantalla vacía ni romper la app; la barra de navegación ya no ofrece el enlace.
6. **Cliente viejo que manda `kind: "damage"` o `"adjustment"`** a `recordStockMovementAction`: responde `INVALID` y no escribe `Movement`.
7. **Colaborador con sesión vieja de owner** abre una prenda con piezas en las dos tiendas: el servidor solo le devuelve las filas de inventario de su tienda.

Cada línea tiene su prueba en la tarea que es dueña del código: 1 en Task 1, 2 en Task 1, 3 en Task 4 (texto final en Task 7), 4 en Task 5, 5 en Task 3, 6 en Task 6, 7 en Task 7.

---

### Task 1: Colaborador puede editar precios (servidor)

**Files:**
- Modify: `lib/auth/permissions.ts` (agregar constante después de la línea 1)
- Modify: `lib/products/actions.ts:70` (gate de `updateVariantPriceAction`) y `lib/products/actions.ts:112` (gate de `listPriceChangesAction`)
- Test: `lib/auth/__tests__/permissions.test.ts` (agregar casos), `lib/products/__tests__/actions.test.ts:48-76` (ajustar bloque "permisos y sesión"), `lib/auth/__tests__/current-user.test.ts` (archivo nuevo)

**Interfaces:**
- Consumes: `requireRole(user, roles)` y `ForbiddenError` ya existentes en `lib/auth/permissions.ts`; `gate(roles)` en `lib/products/actions.ts:42`.
- Produces: `export const PRICE_EDIT_ROLES: readonly Role[]` en `lib/auth/permissions.ts`, con valor `["owner", "manager", "collaborator"]`. Lo usan los gates de precio de `lib/products/actions.ts`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `lib/auth/__tests__/permissions.test.ts`, agregar:

```ts
describe("PRICE_EDIT_ROLES", () => {
  it("incluye owner, manager y collaborator; excluye cualquier otro valor", () => {
    expect([...PRICE_EDIT_ROLES].sort()).toEqual(["collaborator", "manager", "owner"]);
  });
});
```

En `lib/auth/__tests__/current-user.test.ts` (nuevo), mockear `next-auth` (`getServerSession` devuelve `{ user: { id: "u1", role: "owner" } }`) y `@/lib/prisma` (`user.findUnique` devuelve `{ id: "u1", role: "collaborator", locationId: "loc-1" }`):

- `it("el rol sale de la base, no de la sesión")`: `getCurrentUser()` resuelve `role: "collaborator"`.
- `it("usuario que ya no existe en la base: UnauthenticatedError")`: `findUnique` devuelve `null` → rechaza con `UnauthenticatedError`.

En `lib/products/__tests__/actions.test.ts`:

1. En el bloque `describe("permisos y sesión")` (línea 48), sacar `["updateVariantPriceAction", ...]` del arreglo `calls` (líneas 50-56) y crear `const priceCall = ["updateVariantPriceAction", () => updateVariantPriceAction(price())] as const;`. El `it.each(calls)` de FORBIDDEN queda sin esa entrada; el `it.each` de "sin sesión devuelve SESSION" (línea ~72) usa `[...calls, priceCall]`.
2. Reemplazar `it("listPriceChangesAction: colaborador recibe null")` (líneas 65-68) por `it("listPriceChangesAction: colaborador recibe el historial de la talla")` con `as("collaborator", "loc-1")` y `await expect(listPriceChangesAction("var-1")).resolves.toEqual(expect.any(Array))`.
3. Agregar en `describe("updateVariantPriceAction")` (línea 86):
   - `it("colaborador guarda el precio y queda en el historial con su usuario")`: `as("collaborator", "loc-1")`, llamar con `price()` y `newPrice` distinto; esperar `{ ok: true, price: <nuevo> }`.
   - `it("colaborador con precio esperado viejo: CONFLICT con el precio vigente")`: `as("collaborator", "loc-1")`, `expectedPrice` distinto del actual; esperar `{ ok: false, code: "CONFLICT", currentPrice: 450 }`.
   - Verificar que `updateProductAction`, `setProductActiveAction`, `setVariantActiveAction` y `assignDepartmentAction` siguen en la lista FORBIDDEN del colaborador.

Los nombres de `as(...)`, `price()` y `ds` son los del archivo; leer las líneas 1-47 antes de editar para reutilizar el mock de `getCurrentUser`.

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `npx vitest run lib/auth/__tests__/permissions.test.ts lib/auth/__tests__/current-user.test.ts lib/products/__tests__/actions.test.ts`
Expected: FAIL con `PRICE_EDIT_ROLES is not exported` y los casos de colaborador de precio en rojo. Los casos de `current-user` pueden pasar si `getCurrentUser` ya lee la base: si pasan, dejarlos como regresión.

- [ ] **Step 3: Implementar**

- En `lib/auth/permissions.ts`, agregar `export const PRICE_EDIT_ROLES = ["owner", "manager", "collaborator"] as const satisfies readonly Role[];` (usa el `Role` ya importado en la línea 1).
- En `lib/products/actions.ts:70`, cambiar `gate()` por `gate(PRICE_EDIT_ROLES)` dentro de `updateVariantPriceAction`. Importar la constante desde `@/lib/auth/permissions` (la línea 3 ya importa de ahí).
- En `lib/products/actions.ts:112`, hacer lo mismo en `listPriceChangesAction` (el historial es parte de la edición de precio).
- No tocar `updateProductAction`, `setProductActiveAction`, `setVariantActiveAction` ni `assignDepartmentAction`: siguen en `ROLES`/`OWNER_ONLY`.

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `npx vitest run lib/auth/__tests__/permissions.test.ts lib/auth/__tests__/current-user.test.ts lib/products/__tests__/actions.test.ts`
Expected: PASS en todos.

Run: `npm test`
Expected: PASS. Si falla `components/__tests__/ProductAdminSheet.test.tsx` no es esperado en esta tarea: se corrige en Task 2.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/permissions.ts lib/auth/__tests__/permissions.test.ts lib/auth/__tests__/current-user.test.ts lib/products/actions.ts lib/products/__tests__/actions.test.ts
git commit -m "feat(permisos): el colaborador puede editar precios en el servidor"
```

---

### Task 2: Ficha de producto muestra precio al colaborador

**Files:**
- Modify: `components/products/ProductAdminSheet.tsx:58` (definición de `canEdit`), `:89` y `:111` (efecto de carga), `:269` (bloque de título/estado), `:296` (sección "Datos del producto"), `:350` (sección "Precio por talla")
- Test: `components/__tests__/ProductAdminSheet.test.tsx:304-313`

**Interfaces:**
- Consumes: `updateVariantPriceAction` y `listPriceChangesAction` ya permitidos al colaborador por Task 1.
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Escribir la prueba que falla**

En `components/__tests__/ProductAdminSheet.test.tsx`, reemplazar el caso `"el colaborador no ve controles de edición pero sí el stock"` (líneas 304-313) por dos casos:

- `it("el colaborador ve la sección de precio y puede guardarlo")`: `open("collaborator")`; `expect(await screen.findByRole("region", { name: "Precio por talla" })).toBeInTheDocument()`; `expect(screen.getByRole("button", { name: /guardar/i })).toBeInTheDocument()`; `expect(products.listPriceChangesAction).toHaveBeenCalled()`.
- `it("el colaborador no ve datos del producto ni desactivar")`: `open("collaborator")`; `expect(screen.queryByRole("region", { name: "Datos del producto" })).toBeNull()`; `expect(screen.queryByRole("button", { name: /desactivar/i })).toBeNull()`.

Mantener el caso de stock: la tabla `Stock por tienda` sigue visible para el colaborador, pero desde Task 7 solo trae la fila de su tienda (decisión 4).

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `npx vitest run components/__tests__/ProductAdminSheet.test.tsx`
Expected: FAIL en "el colaborador ve la sección de precio" (la sección no se renderiza hoy).

- [ ] **Step 3: Implementar**

En `components/products/ProductAdminSheet.tsx`:
- Línea 58: reemplazar `const canEdit = role === "owner" || role === "manager";` por `const canEditData = role === "owner" || role === "manager";` y `const canEditPrice = canEditData || role === "collaborator";`.
- Línea 269 (bloque de título y estado) y línea 296 (sección "Datos del producto"): usar `canEditData`.
- Línea 350 (sección "Precio por talla"): usar `canEditPrice`.
- Líneas 89 y 111: el efecto carga marcas y departamentos solo si `canEditData`, y el historial de precios si `canEditPrice`. Separar en dos efectos o en dos ramas dentro del mismo; dependencias `[canEditData, canEditPrice, variantKey]`.
- Verificar con `grep -n canEdit components/products/ProductAdminSheet.tsx` que no quede ninguna referencia suelta.

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `npx vitest run components/__tests__/ProductAdminSheet.test.tsx components/__tests__/ProductosAdmin.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/products/ProductAdminSheet.tsx components/__tests__/ProductAdminSheet.test.tsx
git commit -m "feat(productos): la ficha deja al colaborador editar el precio por talla"
```

---

### Task 3: Quitar la pantalla de movimientos

**Files:**
- Delete: `app/movimientos/page.tsx`, `app/movimientos/MovementList.tsx`, `components/__tests__/MovementList.test.tsx`
- Modify: `components/layout/NavBar.tsx:5` (import `History`) y `:22` (elemento "Movimientos")
- Modify: `components/__tests__/NavBar.test.tsx:76` (lista de nombres) y `:84-91` (caso del enlace)
- Delete: `lib/inventory/movement-actions.ts`, `lib/inventory/__tests__/movement-actions.test.ts`, `lib/domain/movement-scope.ts`, `lib/domain/__tests__/movement-scope.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: nada. Se conservan `DataSource.listMovements` (`lib/data/source.ts:177`), su implementación en `lib/data/prisma-source.ts` y `lib/data/__tests__/prisma-movements.db.test.ts` (ver pregunta 4 en Open questions).

- [ ] **Step 1: Escribir la prueba que falla**

En `components/__tests__/NavBar.test.tsx`, reemplazar el caso de la línea 84 por:

```ts
it("no enlaza /movimientos", () => {
  // render del NavBar con sesión, como en el caso de la línea 43
  expect(screen.queryByRole("link", { name: "Movimientos" })).toBeNull();
  expect(document.querySelector('a[href="/movimientos"]')).toBeNull();
});
```

Quitar "Movimientos" de la lista de nombres en la línea 76.

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `npx vitest run components/__tests__/NavBar.test.tsx`
Expected: FAIL en "no enlaza /movimientos".

- [ ] **Step 3: Implementar**

- Borrar `app/movimientos/` completo, `components/__tests__/MovementList.test.tsx`, `lib/inventory/movement-actions.ts`, `lib/inventory/__tests__/movement-actions.test.ts`, `lib/domain/movement-scope.ts`, `lib/domain/__tests__/movement-scope.test.ts`.
- Antes de borrar `movement-scope.ts`, correr `grep -rn "movement-scope" lib components app` y confirmar que solo lo usan los archivos borrados. Si aparece otro uso, detenerse y reportarlo.
- `components/layout/NavBar.tsx:22`: quitar la línea del elemento "Movimientos" y quitar `History` del import de la línea 5.
- Verificar con `grep -rn "movimientos" app components lib --include=*.tsx --include=*.ts` que solo queden textos de copy (por ejemplo `app/productos/unir/page.tsx:45`) y ningún `href`.

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `npx vitest run components/__tests__/NavBar.test.tsx`
Expected: PASS.

Run: `npm test && npm run lint`
Expected: PASS, sin imports sin usar.

- [ ] **Step 5: Commit**

```bash
git add -A app/movimientos components/layout/NavBar.tsx components/__tests__/NavBar.test.tsx components/__tests__/MovementList.test.tsx lib/inventory lib/domain/movement-scope.ts lib/domain/__tests__/movement-scope.test.ts
git commit -m "refactor(movimientos): quitar la pantalla de movimientos; el historial queda en la base"
```

---

### Task 4: Quitar traspasos entre tiendas (UI, acciones, datos)

**Files:**
- Modify: `lib/actions.ts:125-197` (`transferStockAction`, con su comentario de `:125-128`) y sus imports no usados (ver `:20-21`, `:14-15` según `npm run lint`)
- Modify: `lib/data/source.ts:204` (`transferStock`) y el tipo `TransferStockData` si queda sin uso
- Modify: `lib/data/prisma-source.ts:339-~400` (`transferStock`), `lib/data/fixture-source.ts:170` (`transferStock`)
- Modify: `app/escanear/page.tsx:173` (`canTransfer`), `:175-180` (`richestOther`, solo si queda sin uso), `:323-340` (bloque `StockMovementPanel transferOnly`)
- Modify: `components/inventory/StockMovementPanel.tsx:6` (import), `:24` (prop `transferOnly`), `:43`, `:139-146` (modo transfer), `:206-210` (botón de entrada del modo transferOnly), `:256-` (bloque de transferencia)
- Delete: `lib/__tests__/actions-transfer.test.ts`, `lib/data/__tests__/prisma-transfer.db.test.ts`
- Modify: `lib/__tests__/actions-tx-timeout.test.ts:17` (import) y `:58-62` (caso "traspaso")
- Modify: `app/escanear/__tests__/page.test.tsx:6`, `:17` (mock), `:62` (reset), y los casos de traspaso en `:209-368`
- Test (nueva): `app/escanear/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `StockMovementPanel` sin `transferOnly`, `defaultFromId`, `defaultToId` ni modo transferencia (props: `variantId`, `locationId`, `role`, `storeBound`, `onDone`). Es un estado intermedio: Task 6 borra el panel completo.

- [ ] **Step 1: Escribir la prueba que falla y registrar lo que queda**

En `app/escanear/__tests__/page.test.tsx`, agregar:

```ts
it("etiqueta solo en otra tienda: muestra el aviso y no ofrece traspasar", async () => {
  // mock de lookup con inventory solo en otra tienda (locationId distinto al de la sesión)
  expect(await screen.findByText(/está registrada en otra tienda/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /registrar traspaso/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /traspas/i })).toBeNull();
});
```

Run: `npx vitest run app/escanear/__tests__/page.test.tsx -t "otra tienda"`
Expected: PASS con el código actual (la prueba fija el comportamiento que queda). Si falla por el texto exacto, ajustar al texto real de `app/escanear/page.tsx:309-312`.

- [ ] **Step 2: Borrar pruebas de traspaso y verificar que el resto pasa**

Borrar `lib/__tests__/actions-transfer.test.ts` y `lib/data/__tests__/prisma-transfer.db.test.ts`. Quitar el caso de `lib/__tests__/actions-tx-timeout.test.ts:58-62` y el import de `transferStockAction` (línea 17). Quitar de `app/escanear/__tests__/page.test.tsx` el mock `transfer` (líneas 6 y 17), su reset (línea 62) y los casos de la sección de traspaso (líneas ~209-368, todo lo que busca `/registrar traspaso/i`).

Nota de cobertura: la carrera venta contra stock 1 ya la cubre `lib/data/__tests__/prisma-sales.db.test.ts:120` ("1. stock 1, dos ventas en paralelo..."), así que borrar `prisma-transfer.db.test.ts` no deja sin prueba la concurrencia de ventas. Confirmarlo con `grep -n "stock 1" lib/data/__tests__/prisma-sales.db.test.ts` antes de borrar.

Run: `npm test`
Expected: PASS. Si falla, es que queda una referencia a `transferStockAction`: buscarla con `grep -rn transferStock lib app components`.

- [ ] **Step 3: Implementar la eliminación**

- `lib/actions.ts`: borrar `transferStockAction` (líneas 125-197). Borrar imports que `npm run lint` marque como no usados.
- `lib/data/source.ts:204`: quitar `transferStock` de la interfaz; quitar `TransferStockData` si solo lo usaba esto (verificar con grep).
- `lib/data/prisma-source.ts` y `lib/data/fixture-source.ts`: borrar el método `transferStock`. No tocar `recordStockMovement` ni las escrituras de `Movement` de ventas.
- `app/escanear/page.tsx`: quitar `canTransfer` (`:173`) y el bloque `:323-340`. Quitar `richestOther` (`:175-180`) solo si ya no se usa. Mantener `onlyInOtherStore` (`:171-172`) porque sigue alimentando el aviso de `:309`.
- `components/inventory/StockMovementPanel.tsx`: quitar `transferOnly`, `defaultFromId`, `defaultToId`, el modo `"transfer"` y `transferStockAction` del import. El modo `"adjust"` se quita en Task 6, junto con el panel.

- [ ] **Step 4: Correr las pruebas, lint y build**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: PASS, sin referencias a `transfer`/`traspaso` en código (`grep -rni "traspas\|transferStock" lib app components` solo devuelve copy de la spec si lo hubiera).

Run: `npm run test:db`
Expected: PASS (no debe quedar `prisma-transfer.db.test.ts`; `prisma-sales.db.test.ts` y `prisma-movements.db.test.ts` siguen pasando).

- [ ] **Step 5: Commit**

```bash
git add -A lib app components
git commit -m "refactor(inventario): quitar traspasos entre tiendas de la app"
```

---

### Task 5: El alta de producto permite crear marcas

**Files:**
- Verify (sin cambios esperados): `lib/catalog/actions.ts:72-101` (`createBrandAction`, hoy abierta a cualquier sesión), `components/products/NewProductForm.tsx:207-212` (`createBrand`) y `:442` (`BrandCombobox onCreate`), `components/products/BrandCombobox.tsx:66-69`
- Test: `lib/catalog/__tests__/actions.test.ts`, `components/__tests__/NewProductForm.test.tsx`

**Interfaces:**
- Consumes: `createBrandAction(name: string): Promise<CreateBrandResult>` (`lib/catalog/actions.ts:72`), `CreateBrandResult = { ok: true; brand: BrandOption } | { ok: false; message: string }`.
- Produces: nada.

- [ ] **Step 1: Escribir las pruebas**

En `lib/catalog/__tests__/actions.test.ts` (leer primero lo que ya cubre; no duplicar):

- `it("colaborador crea una marca nueva y la recibe activa")`: sesión con rol `collaborator`; esperar `{ ok: true, brand: { name: "Marca Nueva", ... } }`.
- `it("marca inactiva con el mismo nombre: no la reutiliza y avisa la fusión")`: crear `Brand` con `isActive: false` y slug igual; esperar `{ ok: false, message: expect.stringContaining("se fusionó") }`.
- `it("nombre vacío: rechaza sin tocar la base")`: `createBrandAction("   ")` → `{ ok: false, message: "Escribe el nombre de la marca." }`.

En `components/__tests__/NewProductForm.test.tsx`:

- `it("crea una marca desde el combobox y la deja seleccionada")`: escribir un nombre que no existe, elegir la opción de crear, esperar que `createBrandAction` se llame con ese nombre y que el combobox muestre la marca creada.

Run: `npx vitest run lib/catalog/__tests__/actions.test.ts components/__tests__/NewProductForm.test.tsx`
Expected: si todo pasa, la funcionalidad ya existe (ver Open questions 5); la tarea queda como prueba de regresión. Si falla algún caso de colaborador, corregir el gate de `lib/catalog/actions.ts` a `sessionUser()` (ya lo es) y revisar el mock de sesión.

- [ ] **Step 2: Implementar solo si falla**

Si un caso falla por el rol: `createBrandAction` no debe exigir owner (ya es el comportamiento actual, `lib/catalog/actions.ts:73-74`). No cambiar `mergeBrandsAction` (`:104-107`, solo owner).

- [ ] **Step 3: Correr pruebas**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/catalog/__tests__/actions.test.ts components/__tests__/NewProductForm.test.tsx
git commit -m "test(alta): cubrir la creación de marca desde el alta para todos los roles"
```

---

### Task 6: Quitar correcciones y mermas (UI, acción y dominio)

**Files:**
- Delete: `components/inventory/StockMovementPanel.tsx` (tras Task 4 solo le quedan el modo `"adjust"`, líneas ~32–33, 48, 112, 197 y 344–372 con "Registrar merma" y "Registrar corrección", y la entrada `restock`, que ya cubre `SumToMyStore`)
- Modify: `app/escanear/page.tsx` (el bloque que hoy monta `<StockMovementPanel ...>` para la prenda que sí está en la tienda pasa a `<SumToMyStore variantId locationId onDone />`; mensaje `Piezas sumadas: {título}. Ahora hay {n} en esta tienda.`, el mismo que ya usa la rama de "otra tienda")
- Modify: `lib/actions.ts:66-90` (`STOCK_TYPE` queda `{ restock: "RESTOCK" }`; se borra la rama `if (v.kind !== "restock") requireRole(...)`; se conserva `assertCanOperate(user, v.locationId)`)
- Modify: `lib/domain/stock-movement.ts` (`StockMovementKind = "restock"`; `validateStockMovement` rechaza cualquier otro `kind` con `INVALID`; se quitan `direction` y el signo negativo)
- Modify tests: `lib/__tests__/actions-stock.test.ts`, `lib/domain/__tests__/stock-movement.test.ts` (si existe), `app/escanear/__tests__/page.test.tsx`, `components/__tests__/NewProductForm-sizes.test.tsx` (quitar lo que use `damage`/`adjustment` o el panel)

**Interfaces:**
- Consumes: `SumToMyStore` (`components/inventory/SumToMyStore.tsx`, ya llama `recordStockMovementAction` con `kind: "restock"`).
- Produces: `recordStockMovementAction(input: { variantId; locationId; kind: "restock"; quantity; requestId; reason? })` con el mismo `StockMovementResult`. Es la **única** acción de entrada de piezas de la app; E (Task 5, "Agregar nuevamente") la reutiliza. `MovementType` y `MOVEMENT_TYPE_LABEL` de `lib/domain/types.ts` no cambian.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `lib/__tests__/actions-stock.test.ts`:
- `it("kind damage: INVALID y no escribe")` y `it("kind adjustment: INVALID y no escribe")`: `recordStockMovement` del data source no se llama.
- `it("restock del colaborador en otra tienda: FORBIDDEN")` (si no existe ya): `as("collaborator", "loc-1")`, `locationId: "loc-2"`.
- Borrar los casos que esperaban que owner/manager registraran merma o corrección.

En `app/escanear/__tests__/page.test.tsx`:
- `it("prenda en la tienda: ofrece Sumar piezas y no ofrece merma ni corrección")`: `queryByRole("button", { name: /merma|corrección/i })` es null y aparece "Sumar piezas en tu tienda".

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run lib/__tests__/actions-stock.test.ts app/escanear/__tests__/page.test.tsx`
Expected: FAIL en los casos nuevos.

- [ ] **Step 3: Implementar**

Aplicar los cambios de Files. Antes de borrar el panel: `grep -rn "StockMovementPanel" app components lib` debe mostrar solo `app/escanear/page.tsx` y el propio archivo. Quitar los imports de `Role` o `storeBound` que queden sin uso en `/escanear` (lint).

- [ ] **Step 4: Correr pruebas, lint y tipos**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: PASS.

Run: `npm run test:db`
Expected: PASS (`recordStockMovement` con `RESTOCK` sigue cubierto en `lib/data/__tests__/`).

- [ ] **Step 5: Commit**

```bash
git add -A components/inventory app/escanear lib/actions.ts lib/domain/stock-movement.ts lib/__tests__ lib/domain/__tests__ components/__tests__
git commit -m "refactor(inventario): quitar correcciones y mermas; /escanear solo suma piezas"
```

---

### Task 7: El colaborador ve solo el stock de su tienda

**Files:**
- Create: `lib/domain/inventory-scope.ts`
- Test: `lib/domain/__tests__/inventory-scope.test.ts` (nuevo), `lib/__tests__/actions-inventory-scope.test.ts` (nuevo)
- Modify: `lib/actions.ts` (`fetchProductsAction`, `getProductByBarcodeAction`, `getProductByVariantIdAction`, `lookupCodeAction`, y cualquier otra acción que devuelva `inventory`: localizarlas con `grep -n "inventory\|Product\[\]\|VariantMatch" lib/actions.ts lib/products/actions.ts`)
- Modify: `app/escanear/page.tsx` (`onlyInOtherStore` → `notInMyStore`; texto del aviso)
- Modify: `components/products/ProductAdminSheet.tsx` (la tabla "Stock por tienda" pinta lo que llega; sin cambio de lógica si el servidor ya recorta) y `components/__tests__/ProductAdminSheet.test.tsx`
- Modify: `app/escanear/__tests__/page.test.tsx` (texto del caso de Task 4)

**Interfaces:**
- Consumes: `CurrentUser` (`lib/auth/current-user.ts`), `InventoryLevel`, `Product`, `VariantMatch` (`lib/domain/types.ts`).
- Produces: `scopeInventory<T extends { variants: { inventory: InventoryLevel[] }[] }>(product: T, viewer: { role: Role; locationId: string | null }): T` y `scopeVariantMatch(match: VariantMatch, viewer): VariantMatch`. Con `role === "collaborator"` deja solo las filas de `viewer.locationId` (ninguna si no tiene tienda); con owner o manager devuelve el objeto sin cambios. Puras, sin Prisma. E (Task 1) llama `lookupCodeAction` ya recortada.

- [ ] **Step 1: Escribir las pruebas que fallan**

`inventory-scope.test.ts`:
- `"colaborador: solo queda la fila de su tienda"`
- `"colaborador sin tienda: ninguna fila"`
- `"owner y manager: sin cambios"`
- `"no muta la entrada"`

`actions-inventory-scope.test.ts` (mock de `currentUserOrNull` con rol de la base y data source fixture con stock en `loc-1` y `loc-2`):
- `"lookupCodeAction de un colaborador de loc-1 no trae la fila de loc-2"`
- `"fetchProductsAction de un colaborador no trae filas de otra tienda"`
- `"sesión vieja de owner con rol colaborador en la base: se recorta"`

`app/escanear/__tests__/page.test.tsx`: cambiar el caso de Task 4 a `expect(await screen.findByText("Esta prenda no está en tu tienda")).toBeInTheDocument()` y `expect(screen.queryByText(/otra tienda/i)).toBeNull()`.

`ProductAdminSheet.test.tsx`: `"el colaborador ve en Stock por tienda solo su tienda"` (la acción mockeada devuelve ya recortado; la prueba fija que la ficha no pide otra fuente).

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run lib/domain/__tests__/inventory-scope.test.ts lib/__tests__/actions-inventory-scope.test.ts app/escanear/__tests__/page.test.tsx components/__tests__/ProductAdminSheet.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- `lib/domain/inventory-scope.ts` con las firmas de Interfaces.
- En cada acción de Files, aplicar `scopeInventory`/`scopeVariantMatch` con el usuario releído de la base **antes** de devolver. El recorte es del servidor; la UI no filtra.
- `app/escanear/page.tsx`: `const notInMyStore = !!variant && !!locationId && !variant.inventory.some((l) => l.locationId === locationId);` (ya no depende de que haya filas de otras tiendas). Texto: `Esta prenda no está en tu tienda` (sin nombrar la otra), seguido de `SumToMyStore`.

- [ ] **Step 4: Correr y verificar que pasan**

Run: el mismo comando de Step 2, luego `npm test`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/inventory-scope.ts lib/domain/__tests__/inventory-scope.test.ts lib/__tests__/actions-inventory-scope.test.ts lib/actions.ts lib/products/actions.ts app/escanear components/products/ProductAdminSheet.tsx components/__tests__/ProductAdminSheet.test.tsx
git commit -m "feat(permisos): el colaborador solo ve el stock de su tienda"
```

---

### Task 8: Verificación final del subsistema

**Files:** ninguno nuevo.

**Interfaces:** consume todas las tareas anteriores.

- [ ] **Step 1: Revisar que no quedó nada de lo quitado**

Run: `grep -rni "movimientos\|traspas\|transferStock\|/movimientos\|merma\|corrección\|StockMovementPanel" app components lib --include=*.ts --include=*.tsx | grep -v __tests__ | grep -v generated`
Expected: solo copy de texto (p. ej. `app/productos/unir/page.tsx:45`) y las etiquetas de `MOVEMENT_TYPE_LABEL` en `lib/domain/types.ts` (filas viejas); ningún `href`, import, botón ni `kind` de merma o corrección.

- [ ] **Step 2: Suites completas**

Run: `npm test`
Expected: PASS.

Run: `npm run test:db`
Expected: PASS.

Run: `npm run lint && npm run build`
Expected: PASS. El build no requiere `BLOB_READ_WRITE_TOKEN` para pasar porque las pruebas usan mock.

- [ ] **Step 3: Verificación manual (preview de Vercel, no producción)**

Con el preview desplegado desde la rama:
- Colaborador: abre una prenda en `/productos`, cambia un precio, ve el historial, no ve "Datos del producto" ni "Desactivar".
- Owner: la barra no muestra "Movimientos"; `/movimientos` no muestra la pantalla.
- `/escanear` con una etiqueta de otra tienda: aviso "Esta prenda no está en tu tienda", sin traspaso, sin merma ni corrección, con "Sumar piezas en tu tienda".
- Colaborador: en la ficha, "Stock por tienda" muestra solo su tienda.

- [ ] **Step 4: Commit de cierre (solo si hubo ajustes)**

Si Steps 1-3 obligaron a cambios, commitear con `git commit -m "chore: ajustes de verificación del subsistema A"`. Si no, no hay commit de cierre.

---

## Open questions (para el dueño o el solicitante)

1. ~~Correcciones y mermas.~~ **Resuelta (decisión 6):** se quitan para todos los roles en Task 6. Devolución = aviso por WhatsApp; el dueño cancela la venta en `/ventas`. El conteo físico (1.13) sigue en backlog.
2. **"Editar precios" del colaborador.** El plan asume el precio de la **prenda** (ficha de `/productos`). No cambia el precio de línea en el carrito de `/pos` (`app/pos/page.tsx:47`, `canEditPrice`). Confirmar.
3. **Historial de precios.** El plan deja que el colaborador lea el historial de cambios de precio de la talla (necesario para el aviso de conflicto). Confirmar que no es dato sensible para él.
4. **`listMovements` en la capa de datos.** Sin pantalla queda sin consumidor. El plan lo conserva (`lib/data/source.ts:177`, `prisma-movements.db.test.ts`) para auditoría; alternativa: borrarlo.
5. **Marcas.** `createBrandAction` ya acepta cualquier sesión y el alta ya la usa. La tarea 5 es de verificación. Confirmar que no se esperaba otro cambio.
6. ~~Etiqueta solo en otra tienda.~~ **Resuelta (decisión 4):** texto "Esta prenda no está en tu tienda", sin nombrar la otra (Task 7).
7. **Colaborador sin tienda asignada.** El plan permite que edite precio aunque no tenga tienda (el precio es global por talla). Confirmar.

## Riesgos principales

1. **Pruebas que fijan el permiso anterior.** `lib/products/__tests__/actions.test.ts:48-76` y `components/__tests__/ProductAdminSheet.test.tsx:304-313` afirman que el colaborador no edita precios; cambiarlos es parte del cambio, no un fallo. Riesgo: cambiar un FORBIDDEN de otra acción por error. Mitigación: Task 1 mueve solo `updateVariantPriceAction` fuera de la lista.
2. **Borrado de código con imports y tipos compartidos.** `transferStock` vive en `DataSource` (interfaz, Prisma y fixtures) y `TransferStockData` puede usarse en otro lado. Mitigación: `grep` antes de borrar y `npx tsc --noEmit` en Task 4.
3. **Cobertura de concurrencia.** La prueba de traspaso contra venta vivía en `prisma-transfer.db.test.ts`. Mitigación: `prisma-sales.db.test.ts:120` ya cubre dos ventas en stock 1; se verifica antes de borrar.

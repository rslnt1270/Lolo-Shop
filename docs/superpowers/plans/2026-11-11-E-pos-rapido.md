# Subsistema E: escaneo rápido en /pos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir escanear varias prendas seguidas en /pos con la cámara abierta, agregar cada prenda al carrito en cuanto llega su consulta, validar existencias por talla en la tienda elegida, ofrecer "Agregar nuevamente" en `/escanear` para prendas ya vendidas y agregar prendas sin código desde un buscador de productos registrados. El cobro conserva `clientRequestId` sin cambios.

**Architecture:** El escáner (`components/inventory/Scanner.tsx`) gana un modo continuo opt-in que no se desmonta ni detiene tras cada lectura; `/escanear` sigue en modo de una lectura. `lookupCodeAction` recibe la tienda, valida que el usuario pueda operar en ella (`assertCanOperate`) y devuelve existencias de la talla y si ya se vendió. Mientras llega la consulta, `/pos` muestra una fila pendiente **por código** (no por `variantId`); al llegar, la prenda entra al carrito (`lib/sales/use-sale-draft.ts`) con su existencia conocida. "Agregar nuevamente" vive en `/escanear` y reutiliza `recordStockMovementAction` (`kind: "restock"`, que ya valida la tienda) mediante `SumToMyStore`; no hay acción nueva de entrada. E es el **único dueño** de la búsqueda "Sin código" (`searchProducts`/`searchProductsAction`, C21 y C22). El servidor de `createSaleAction` no cambia: ya valida stock con `InsufficientStockError` y `NO_STOCK`.

**Tech Stack:** Next.js (App Router) + React + TypeScript, Prisma sobre PostgreSQL, Vitest + React Testing Library (`npm test`), Vitest con base real (`npm run test:db`), html5-qrcode, Vercel (preview).

> **Revisión 2026-11-12 (entrega 2).** Tasks 1–4 salieron a producción en `main` d05d68b (PR #34, grupos G16–G17 y la ronda final f802cb7): `getStockAt`, `listVariantStockAt`, `lookupCodeAction(raw, locationId?)` con `stock`, `listVariantStockAtAction`, `Scanner continuous` con `SAME_CODE_GAP_MS`, `DraftLine.available`, filas `PendingScan` (`loading | error | queued`), cola `heldRef` durante el cobro y carrito bloqueado con cobro incierto. Pendientes: Task 5 (G22), Task 6 (G23) y la nueva **Task 6a** (avisos del POS que no se pierden, minors G17 de la entrega 1), Tasks 7–8 (G24). Cronograma: `docs/superpowers/plans/2026-11-12-entrega-2-cronograma.md`. La decisión del 2026-11-12 (fotos sin fondo blanco) no toca este plan.

**Spec:** `docs/superpowers/specs/2026-11-11-alcance-inventario-simplificado-design.md` (§1, §5, §5.1–5.3). Se lee junto con `docs/superpowers/specs/2026-11-11-alta-producto-tienda-design.md` (§6 referencia, C21 y C22). Decisiones: `.superpowers/sdd/2026-11-11-version-final/decisiones.md` (2, 4 y 7).

**Orden de mezcla (cronograma §3):** sexto, después de B base, A, las migraciones, G y D; antes de C. Consume de A `lookupCodeAction` ya recortada al inventario del colaborador y `recordStockMovementAction` solo con `restock`; de G, `Product.category` = `ProductType.name`; de H, `Product.color`.

## Global Constraints

- Ventas están en producción: esta rama no se mezcla sin preview de Vercel revisado y `npm run test:db` en verde.
- No se despliega directo a producción. No se corre `prisma migrate` (este subsistema no cambia el esquema; `Product.color` lo crea H).
- **Tienda validada en el servidor:** toda acción que recibe `locationId` (`lookupCodeAction`, `listVariantStockAtAction`, `recordStockMovementAction`) llama `assertCanOperate(user, locationId)` con el usuario releído de la base. El colaborador solo opera en su tienda.
- Botones con `Button`/`buttonClasses` de B base.
- `clientRequestId` del cobro: mismo comportamiento que hoy (`draft.requestIdFor`, `renewRequestId`, `markUncertain`, `markRejected`). No se tocan las reglas de `PRICE_CHANGED`, `request_conflict` ni `UNAVAILABLE`.
- Las ventas offline quedan fuera (subsistema F).
- Existencias se validan por variante (talla), en la tienda elegida.
- Copy exacto: "Sin existencias de la talla M en esta tienda" (la talla va sin comillas, tomada de `Variant.size`); "Agregar nuevamente"; "Sin código".
- Sin secretos en código, tests ni fixtures. No se commitea `.env`.
- Commits en Conventional Commits, con las líneas de atribución del sistema.

## Review Focus

1. **Lectura repetida de la misma prenda con la cámara abierta.** Con la cámara abierta el mismo código se lee decenas de veces. Esperado (decisión 2): suma una vez por presentación; vuelve a sumar solo si la prenda sale del cuadro y se presenta de nuevo; "×N" con controles para bajar o quitar. Test: `Scanner-continuous.test.tsx` "modo continuo: una misma prenda que sigue en cuadro suma una sola vez" y "modo continuo: la misma prenda presentada otra vez tras salir del cuadro suma de nuevo".
2. **Existencias cambian entre la lectura y el cobro.** Otra persona vende la última pieza. Esperado: el cobro falla con `NO_STOCK` junto a la línea, el carrito no se pierde. Test: `PosPage.test.tsx` "NO_STOCK en el cobro conserva el carrito y marca la línea" (ya existe como "NO_STOCK muestra el mensaje junto a la línea afectada"; se conserva).
3. **Falla la consulta de una lectura con la cámara abierta.** Esperado: la fila pendiente de ese código queda en "Reintentar", no se pierde ni se duplica. Test: `PosPage-scan.test.tsx` "lectura con error de red deja la fila del código en Reintentar y no la duplica".
6. **Colaborador manda el `locationId` de otra tienda** a `lookupCodeAction` o a `listVariantStockAtAction`. Esperado: no devuelve existencias de esa tienda. Test: `lookup-code-stock.test.ts` "lookupCodeAction con locationId ajeno responde el error de tienda".
4. **Talla agotada en la tienda elegida pero con piezas en otra tienda.** Esperado: "Sin existencias de la talla M en esta tienda", no "no encontramos el código". Test: `PosPage-scan.test.tsx` "talla sin existencias en la tienda elegida no agrega la línea".
5. **Búsqueda "Sin código" sin resultados o con caracteres especiales.** Esperado: mensaje "No encontramos productos con «…»" y sin error. Test: `SaleProductSearch.test.tsx` "consulta sin resultados muestra el mensaje y no agrega nada".

---

### Task 1: Consulta de existencias por talla y por producto en la tienda

**Files:**
- Modify: `lib/data/source.ts` (interfaz `DataSource`)
- Modify: `lib/data/prisma-source.ts`
- Modify: `lib/data/fixture-source.ts`
- Modify: `lib/actions.ts` (`lookupCodeAction`, tipo `LookupCodeResult`)
- Test: `lib/data/__tests__/prisma-stock.db.test.ts` (existente, se agrega caso)
- Test: `lib/__tests__/lookup-code-stock.test.ts` (crear)

**Interfaces:**
- Consumes: `getProductByBarcode(code)` existente.
- Produces:
  - `DataSource.getStockAt(variantId: string, locationId: string): Promise<{ available: number; sold: boolean }>`. `available` es `InventoryLevel.available` (0 si no hay fila). `sold` es true si existe al menos una `SaleLine` de esa variante.
  - `DataSource.listVariantStockAt(productId: string, locationId: string): Promise<{ variantId: string; size: string; sku: string; price: number; available: number }[]>`, ordenado por `size`.
  - `lookupCodeAction(raw: string, locationId?: string): Promise<LookupCodeResult>`. Si llega `locationId`, primero `assertCanOperate(user, locationId)`; si falla, `{ found: false, code, error: "Solo puedes operar en tu tienda asignada." }` sin consultar existencias. Cuando hay `found: true` y `locationId`, incluye `stock?: { available: number; sold: boolean }`. Sin `locationId` el resultado no cambia. `/pos` y `/escanear` (Task 5) pasan su tienda. El recorte de inventario del colaborador (A Task 7) se conserva.
  - `listVariantStockAtAction(productId: string, locationId: string): Promise<VariantStockRow[] | null>` en `lib/actions.ts`: `null` sin sesión; `assertCanOperate` → `[]` si la tienda no es suya; llama `listVariantStockAt`. `VariantStockRow = { variantId: string; size: string; sku: string; price: number; available: number }`. Es la única puerta del cliente a `listVariantStockAt`.

- [x] **Step 1: Escribir la prueba de base de `getStockAt`**

En `lib/data/__tests__/prisma-stock.db.test.ts` agregar:

```ts
it("getStockAt devuelve available de la talla en la tienda y sold=true solo si hay SaleLine", async () => {
  // Arrange: variante con 3 piezas en la tienda A y sin ventas; misma variante sin fila en la tienda B.
  // Assert: getStockAt(variantA, storeA) -> { available: 3, sold: false }
  //         getStockAt(variantA, storeB) -> { available: 0, sold: false }
  // Tras una venta de 1 pieza en A: getStockAt(variantA, storeA) -> { available: 2, sold: true }
});
```

- [x] **Step 2: Ejecutar la prueba y ver que falla**

Run: `npm run test:db -- -t "getStockAt"`
Expected: FAIL con "getStockAt is not a function".

- [x] **Step 3: Implementar `getStockAt` y `listVariantStockAt`**

Agregar los dos métodos a `DataSource` (`lib/data/source.ts`) y su implementación en `prisma-source.ts` (consultas `inventoryLevel.findUnique` por `variantId_locationId` y `saleLine.count`) y en `fixture-source.ts` (mismo contrato con los datos de prueba). Sin upsert: sin fila, `available: 0`.

- [x] **Step 4: Ejecutar la prueba y ver que pasa**

Run: `npm run test:db -- -t "getStockAt"`
Expected: PASS.

- [x] **Step 5: Escribir la prueba de `lookupCodeAction` con tienda**

Crear `lib/__tests__/lookup-code-stock.test.ts` con mocks de `getDataSource` y `currentUserOrNull` (mismo patrón que `lib/sales/__tests__/actions.test.ts`):

```ts
it("lookupCodeAction con locationId incluye stock de la talla en esa tienda", async () => {
  // getProductByBarcode -> variante v1; getStockAt(v1, "l1") -> { available: 0, sold: true }
  // expect(result).toMatchObject({ found: true, variantId: "v1", stock: { available: 0, sold: true } })
});
it("lookupCodeAction sin locationId no agrega stock", async () => {
  // expect(result).not.toHaveProperty("stock")
});
it("lookupCodeAction con locationId ajeno responde el error de tienda", async () => {
  // colaborador de "l1" pide "l2": { found: false, error: "Solo puedes operar en tu tienda asignada." }; getStockAt no se llama
});
it("listVariantStockAtAction de un colaborador en otra tienda devuelve []", async () => {});
```

- [x] **Step 6: Ejecutar la prueba y ver que falla**

Run: `npm test -- lib/__tests__/lookup-code-stock.test.ts`
Expected: FAIL (`stock` no existe).

- [x] **Step 7: Implementar en `lookupCodeAction`**

Firma: `lookupCodeAction(raw: string, locationId?: string)`. Si `locationId` es texto no vacío, `assertCanOperate(user, locationId)` antes de buscar (`ForbiddenError` → `found: false` con su mensaje). Si `found`, llamar `getStockAt(match.variant.id, locationId)` y agregar `stock`. Agregar `listVariantStockAtAction` con la misma guarda. Si falla esa consulta, devolver `found: true` sin `stock` (el carrito lo tratará como "por confirmar", ver Task 3). Tipo: `{ found: true; product; variantId; stock?: { available: number; sold: boolean } }`.

- [x] **Step 8: Ejecutar pruebas y ver que pasan**

Run: `npm test -- lib/__tests__/lookup-code-stock.test.ts && npm run test:db -- -t "getStockAt"`
Expected: PASS.

- [x] **Step 9: Commit**

```bash
git add lib/data/source.ts lib/data/prisma-source.ts lib/data/fixture-source.ts lib/actions.ts lib/data/__tests__/prisma-stock.db.test.ts lib/__tests__/lookup-code-stock.test.ts
git commit -m "feat(pos): consulta de existencias por talla en la tienda"
```

---

### Task 2: Modo continuo del escáner (sin remontar la cámara)

**Files:**
- Modify: `components/inventory/Scanner.tsx`
- Test: `components/__tests__/Scanner-continuous.test.tsx` (crear)
- Test (regresión, sin cambios): `components/__tests__/Scanner.test.tsx`, `components/__tests__/Scanner-strictmode.test.tsx`

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: prop nueva `continuous?: boolean` (por defecto `false`) y constante exportada `SAME_CODE_GAP_MS = 1000`. Con `continuous` true: `onScan` se llama una vez por presentación y la cámara sigue corriendo; no se llama `stopScanner` ni `setStatus("idle")` tras una lectura. "Presentación" (decisión 2): el mismo código vuelve a emitirse solo si pasaron ≥ `SAME_CODE_GAP_MS` sin leerlo (la prenda salió del cuadro); un código distinto se emite en cuanto se confirma. Sin `continuous`, el comportamiento es idéntico al actual (usado por `/escanear`).

- [x] **Step 1: Escribir las pruebas**

```tsx
it("modo continuo: tras una lectura confirmada la cámara sigue activa y onScan recibe el código", () => {
  // render <Scanner continuous onScan={fn} autoStart />; simular dos decodes del mismo texto;
  // expect(fn).toHaveBeenCalledWith("7501234567890") una vez; expect(stop).not.toHaveBeenCalled()
});
it("modo continuo: una misma prenda que sigue en cuadro suma una sola vez", () => {
  // vi.useFakeTimers(); 10 decodes del mismo código cada 100 ms; onScan llamado 1 vez
});
it("modo continuo: la misma prenda presentada otra vez tras salir del cuadro suma de nuevo", () => {
  // decode A; avanzar SAME_CODE_GAP_MS + 1 sin decodes; decode A dos veces → onScan llamado 2 veces en total
});
it("modo continuo: un código distinto se emite sin esperar", () => {});
it("sin continuous, tras una lectura la cámara se detiene (comportamiento de /escanear)", () => {
  // render <Scanner onScan={fn} autoStart />; tras dos decodes: expect(stop).toHaveBeenCalled()
});
```

- [x] **Step 2: Ejecutar y ver que fallan las dos primeras**

Run: `npm test -- components/__tests__/Scanner-continuous.test.tsx`
Expected: FAIL en las pruebas de modo continuo; la de sin `continuous` pasa.

- [x] **Step 3: Implementar**

En `handleDecoded`, si `continuous`: no marcar `handledRef`, no llamar `stopScanner`, no cambiar `status`. Mantener la confirmación de dos lecturas consecutivas (`lastRef`) para descartar lecturas falsas. Guardar `{ code, lastSeenAt }` de la última emisión y actualizar `lastSeenAt` en cada lectura de ese código; emitir el mismo código otra vez solo si `now - lastSeenAt >= SAME_CODE_GAP_MS`. Bajar o quitar piezas se hace en el carrito ("−" y "Quitar"), no en el escáner. Respetar los formatos de `SCAN_FORMAT_NAMES` (D Task 7).

- [x] **Step 4: Ejecutar pruebas de regresión y ver que pasan**

Run: `npm test -- components/__tests__/Scanner`
Expected: PASS (las existentes sin cambios y las nuevas).

- [x] **Step 5: Commit**

```bash
git add components/inventory/Scanner.tsx components/__tests__/Scanner-continuous.test.tsx
git commit -m "feat(scanner): modo continuo opt-in para escaneo de ventas"
```

---

### Task 3: Carrito con existencias por línea y ×N

**Files:**
- Modify: `lib/sales/use-sale-draft.ts`
- Test: `lib/sales/__tests__/use-sale-draft.test.ts` (existente, se agregan casos)

**Interfaces:**
- Consumes: `lookupCodeAction` con `stock` (Task 1).
- Produces:
  - `DraftLine` gana `available: number | null` (null = no confirmado). No hay estado "pendiente" en las líneas: lo pendiente es por código y vive en `/pos` (Task 4).
  - `add(match: VariantMatch, stock?: { available: number; sold: boolean }): { ok: true } | { ok: false; reason: "NO_STOCK"; size: string }`. Con `stock.available === 0` devuelve `NO_STOCK` sin agregar. Si la talla ya está en el carrito, `quantity + 1` solo si `available === null || quantity + 1 <= available`; si no, `NO_STOCK`.
  - `setQty` y `remove` sin cambio de firma. `setQty` no baja de 1 (el botón "−" se deshabilita en 1; "Quitar" elimina la línea).

- [x] **Step 1: Escribir las pruebas**

```ts
it("add con el mismo variantId suma quantity a 2 y la línea se muestra como ×2", () => {});
it("add rechaza la segunda pieza si available es 1: devuelve NO_STOCK con la talla", () => {
  // expect(result).toEqual({ ok: false, reason: "NO_STOCK", size: "M" })
});
it("add sin stock confirmado (null) acepta la pieza con available null", () => {});
it("add con available 0 devuelve NO_STOCK y no crea la línea", () => {});
it("remove elimina la línea completa aunque tenga quantity 2", () => {});
```

- [x] **Step 2: Ejecutar y ver que fallan**

Run: `npm test -- lib/sales/__tests__/use-sale-draft.test.ts`
Expected: FAIL en los casos nuevos.

- [x] **Step 3: Implementar**

Agregar `available` a `DraftLine`. En `add`, validar contra `available` cuando no es null. `reset()` y `renewRequestId()` no cambian. No tocar `requestIdFor`, `markRejected`, `markUncertain`, `isUncertain`.

- [x] **Step 4: Ejecutar y ver que pasan**

Run: `npm test -- lib/sales/__tests__/use-sale-draft.test.ts`
Expected: PASS (incluye los casos previos de id de la petición).

- [x] **Step 5: Commit**

```bash
git add lib/sales/use-sale-draft.ts lib/sales/__tests__/use-sale-draft.test.ts
git commit -m "feat(pos): carrito con existencias por talla y cantidad acumulada"
```

---

### Task 4: Flujo de escaneo continuo en `/pos`

**Files:**
- Modify: `app/pos/page.tsx` (función `handleScan`, render del `Scanner`, aviso de confirmación)
- Modify: `components/sales/SaleCart.tsx` (botón "−" deshabilitado en 1, "×N" en el título, botón "Reintentar" si `pending`, mensaje de talla agotada junto a la línea)
- Test: `components/__tests__/PosPage-scan.test.tsx` (crear)
- Test (regresión): `components/__tests__/PosPage.test.tsx` y `components/__tests__/SaleCart.test.tsx` (sin cambios de expectativas)

**Interfaces:**
- Consumes: `lookupCodeAction(code, locationId)` con `stock` (Task 1), `useSaleDraft().add` (Task 3), `Scanner` con `continuous` (Task 2).
- Produces: `type PendingScan = { code: string; status: "loading" | "error" }` (estado de `/pos`, clave = código normalizado). En `SaleCart` nuevas props opcionales `pendingScans?: PendingScan[]` y `onRetry?: (code: string) => void`. Sin cambios en `createSaleAction`.

Reglas de `handleScan(code)`:
1. No cambia `scannerKey` ni remonta el escáner. Se elimina `setScannerKey`.
2. Al recibir el código, agrega una fila `PendingScan { code, status: "loading" }` ("Buscando {código}…") y llama `lookupCodeAction(code, locationId)` en segundo plano. El carrito y el escáner siguen activos; otras lecturas no esperan.
3. Al llegar `found: true`: quita la fila pendiente y llama `add(match, stock)`. Con `ok` muestra `Agregado: {producto} ({talla}) · ×{n}`. Con `NO_STOCK` no agrega y muestra `Sin existencias de la talla {size} en esta tienda` (también cuando la prenda ya se vendió: en `/pos` no hay "Agregar nuevamente"; eso es de `/escanear`, Task 5).
4. Si la consulta falla (error de red o `error` en el resultado), la fila del código queda `status: "error"` con "Reintentar" (`onRetry(code)` repite la consulta). No se duplica ni se pierde. Un segundo escaneo del mismo código mientras hay fila pendiente no crea otra fila.
5. `found: false` sin error: quita la fila y muestra `No encontramos el código {código}`.

- [x] **Step 1: Escribir las pruebas**

```tsx
it("escanear no vuelve a montar el escáner: el mock de Scanner se renderiza una sola vez", () => {});
it("escanear muestra la fila pendiente del código y, al llegar la consulta, agrega 'Agregado: … ×1'", () => {});
it("mismo código dos veces muestra '×2' y no crea una línea nueva", () => {});
it("talla sin existencias en la tienda elegida no agrega la línea y muestra 'Sin existencias de la talla M en esta tienda'", () => {
  // lookupCodeAction -> { found: true, stock: { available: 0, sold: false } } con variant size "M"
});
it("lectura con error de red deja la fila del código en Reintentar y no la duplica", () => {
  // lookupCodeAction rechaza; una sola fila con "Reintentar"; click repite lookup con el mismo código
});
it("prenda vendida sin piezas en /pos muestra solo 'Sin existencias de la talla M en esta tienda'", () => {
  // stock { available: 0, sold: true }; queryByRole("button", { name: "Agregar nuevamente" }) es null
});
it("NO_STOCK en el cobro conserva el carrito y marca la línea", () => {
  // ya cubierto en PosPage.test.tsx "NO_STOCK muestra el mensaje junto a la línea afectada"; se re-ejecuta
});
```

- [x] **Step 2: Ejecutar y ver que fallan**

Run: `npm test -- components/__tests__/PosPage-scan.test.tsx`
Expected: FAIL.

- [x] **Step 3: Implementar**

Cambios en `app/pos/page.tsx`: `<Scanner continuous>` sin `key` dinámico (quitar `scannerKey` y su `setScannerKey`); estado `pendingScans`; `handleScan` según las 5 reglas; pasar `locationId` a `lookupCodeAction`. Cambios en `SaleCart.tsx` según el Interfaces (filas pendientes arriba de las líneas, "×N", "−" deshabilitado en 1, "Quitar"). No se cambia `charge`, `requestSignature`, ni el manejo de `PRICE_CHANGED` / `UNAVAILABLE` / `request_conflict`.

- [x] **Step 4: Ejecutar pruebas de cobro y de escaneo**

Run: `npm test -- components/__tests__/PosPage components/__tests__/SaleCart`
Expected: PASS. Todas las pruebas existentes de `PosPage.test.tsx` (incluidas "tras un error de red, reintentar manda el mismo clientRequestId" y "PRICE_CHANGED: …") deben pasar sin cambios.

- [x] **Step 5: Commit**

```bash
git add app/pos/page.tsx components/sales/SaleCart.tsx components/__tests__/PosPage-scan.test.tsx
git commit -m "feat(pos): escaneo continuo con cámara abierta y existencias por talla"
```

---

### Task 5: "Agregar nuevamente" en `/escanear` para prendas ya vendidas — G22

**Estado del código (d05d68b):** `app/escanear/page.tsx` llama `lookupCodeAction(code)` **sin** tienda (función `handleScan`), así que `found.stock` nunca llega; el resultado siempre muestra `SumToMyStore` (en la rama `notInMyStore` con el aviso "Esta prenda no está en tu tienda" y en la otra sin aviso). `SumToMyStore` (`components/inventory/SumToMyStore.tsx`) tiene props `{ variantId, locationId, quantity?, defaultQuantity?, onDone }` y su texto sale de `sumLabel(n)`. `FixtureDataSource.getStockAt` siempre devuelve `sold: false` porque las ventas viven en otra fixture (`FixtureSalesDataSource`); por eso las pruebas de esta tarea **simulan `sold` con el mock de `lookupCodeAction`** (carry G16) y la parte de base real la cubre `prisma-stock.db.test.ts`.

**Files:**
- Modify: `app/escanear/page.tsx` (`handleScan` pasa `locationId` a `lookupCodeAction`; con `found.stock?.sold && found.stock.available === 0` muestra el aviso y `SumToMyStore label="Agregar nuevamente"`; en los demás casos, igual que hoy)
- Modify: `components/inventory/SumToMyStore.tsx` (prop opcional `label?: string`; si llega, sustituye a `sumLabel(shown)` en el botón; "Sumando…" no cambia)
- Test: `app/escanear/__tests__/page.test.tsx` (agregar casos), `components/__tests__/SumToMyStore.test.tsx` (nuevo, solo la prop `label`)

**Interfaces:**
- Consumes: `lookupCodeAction(code, locationId)` con `stock` (Task 1, ya en `main`); `SumToMyStore` y `recordStockMovementAction({ kind: "restock", ... })` (con `assertCanOperate` y `requestId` idempotente).
- Produces: sin acción nueva. **No existe `restockSoldVariantAction`.** No crea `Product` ni `Variant`.

Reglas:
1. Solo en `/escanear` (decisión 7). En `/pos` una prenda vendida sin piezas solo muestra "Sin existencias de la talla X en esta tienda".
2. Texto: `Esta prenda ya se vendió. Puedes agregar piezas al mismo producto.` y `SumToMyStore label="Agregar nuevamente"`.
3. Si `lookupCodeAction` responde el error de tienda ("Solo puedes operar en tu tienda asignada."), se muestra como `lookupError`, sin resultado.
4. Owner sin tienda elegida todavía: se llama sin `locationId` (comportamiento actual, sin "Agregar nuevamente").

- [ ] **Step 1: Escribir las pruebas**

```ts
// app/escanear/__tests__/page.test.tsx
it("escanear manda la tienda del usuario a lookupCodeAction", () => {});
it("prenda vendida sin piezas en la tienda muestra 'Agregar nuevamente'", () => {
  // lookupCodeAction -> { found: true, stock: { available: 0, sold: true } }
});
it("Agregar nuevamente llama recordStockMovementAction con kind restock, la tienda del usuario y el mismo requestId en el reintento", () => {});
it("prenda con piezas o nunca vendida no muestra 'Agregar nuevamente'", () => {});

// components/__tests__/SumToMyStore.test.tsx
it("label sustituye el texto del botón; sin label usa sumLabel", () => {});
```

- [ ] **Step 2: Ejecutar y ver que fallan.** Run: `npx vitest run app/escanear/__tests__/page.test.tsx components/__tests__/SumToMyStore.test.tsx` → FAIL en los nuevos.
- [ ] **Step 3: Implementar** según Files. No tocar `recordStockMovementAction` (la prueba "colaborador en otra tienda → FORBIDDEN" de restock ya existe en `lib/__tests__/actions-stock.test.ts`; correrla como regresión).
- [ ] **Step 4: Ejecutar y ver que pasan.** El comando de Step 2, `npx vitest run lib/__tests__/actions-stock.test.ts lib/__tests__/lookup-code-stock.test.ts` y `npm run test:db -- -t "getStockAt"` → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(escanear): agregar nuevamente piezas a una prenda ya vendida"`

---

### Task 6: Botón "Sin código" con búsqueda de productos registrados — G23

**Estado del código (d05d68b):** `searchProducts` (`lib/data/prisma-source.ts`, `lib/data/fixture-source.ts`) busca código público exacto y luego `title`/`brand` (`contains`, insensible), hasta `MAX_SEARCH_RESULTS`. `ProductSearchHit = { productId, title, brand, publicCode, imageUrl, sizes }`. `ExistingProductSearch` **no tiene archivo de prueba propio**: su comportamiento lo cubren `app/escanear/__tests__/page.test.tsx`, `components/__tests__/NewProductForm-sizes.test.tsx` y `lib/__tests__/actions-sizes.test.ts`. En `/pos`, `ManualCodeEntry onNoBarcode` hoy pone el aviso "Una prenda sin código no se puede vender aquí: dala de alta primero en Escanear."

**Files:**
- Modify: `components/products/ExistingProductSearch.tsx` (props opcionales `heading`, `placeholder`, `pickLabel`, `hideNewButton`; por defecto el comportamiento actual)
- Create: `components/sales/SaleProductSearch.tsx`
- Modify: `lib/data/prisma-source.ts` y `lib/data/fixture-source.ts` (`searchProducts`: el `OR` gana `category`, `color` y `variants: { some: { isActive: true, sku: { in: codeCandidates(q) } } }`)
- Modify: `lib/data/source.ts` (solo el comentario de `searchProducts`)
- Modify: `app/pos/page.tsx` (`onNoBarcode` abre `SaleProductSearch` con la tienda de la venta; el carrito bloqueado (`lock !== null || submitting`) deshabilita "Sin código")
- Test: `components/__tests__/SaleProductSearch.test.tsx` (crear), `lib/data/__tests__/prisma-products.db.test.ts` (C21), `lib/data/__tests__/prisma-sales.db.test.ts` (C22), `lib/data/__tests__/fixture-source.test.ts` (paridad de `searchProducts`)

**Interfaces:**
- Consumes: `searchProductsAction(query)` (firma sin cambio), `listVariantStockAtAction(productId, locationId)` y `VariantStockRow` (Task 1), `add` del carrito (Task 3), `Product.color` (H), `Product.category` = `ProductType.name` (G).
- Produces:
  - `SaleProductSearch({ locationId: string; disabled?: boolean; onAdd(match: VariantMatch, stock: { available: number; sold: boolean }): void })`. Para armar `VariantMatch` sin otra acción, usa `lookupCodeAction(row.sku, locationId)` de la talla elegida (devuelve `product`, `variantId` y `stock` ya recortados al colaborador).
  - **Una sola acción de búsqueda** para `/escanear` y `/pos`. No se crea `searchRegisteredProductsAction`.

Reglas: cada resultado muestra sus tallas con existencia en la tienda elegida; talla sin existencias deshabilitada con "Sin existencias"; elegir talla con existencias agrega la línea con `add`. Si la tienda cambia, la búsqueda se limpia.

- [ ] **Step 1: Escribir las pruebas**

```ts
// components/__tests__/SaleProductSearch.test.tsx
it("consulta sin resultados muestra 'No encontramos productos con «…»' y no agrega nada", () => {});
it("elegir producto y talla con existencias agrega la línea de esa talla", () => {});
it("talla con cero existencias aparece deshabilitada con 'Sin existencias'", () => {});
it("caracteres especiales en la consulta no rompen la búsqueda", () => {});

// lib/data/__tests__/prisma-products.db.test.ts
it("C21 (db): \"Sin código\" encuentra por tipo, marca, color o código interno", () => {});
it("C21 (db): texto que no es producto no devuelve nada", () => {});

// lib/data/__tests__/prisma-sales.db.test.ts
it("C22 (db): vender por referencia descuenta la talla", () => {});
```

- [ ] **Step 2: Ejecutar y ver que fallan.** Run: `npm test -- components/__tests__/SaleProductSearch.test.tsx lib/data/__tests__/fixture-source.test.ts && npm run test:db -- -t "C2[12]"` → FAIL.
- [ ] **Step 3: Implementar.** `ExistingProductSearch` conserva su comportamiento por defecto.
- [ ] **Step 4: Ejecutar y ver que pasan.** Run: `npm test -- components/__tests__/SaleProductSearch.test.tsx components/__tests__/NewProductForm-sizes.test.tsx app/escanear/__tests__/page.test.tsx lib/__tests__/actions-sizes.test.ts components/__tests__/PosPage && npm run test:db -- -t "searchProducts|C2[12]"` → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(pos): venta sin código desde búsqueda de productos registrados"`

---

### Task 6a: Avisos del POS que no se pierden (minors G17 de la entrega 1) — G24

**Estado del código (d05d68b), `app/pos/page.tsx`:**
- `flushHeld` aplica la cola con `applyFound` en un bucle; cada llamada hace `setNotice(...)`, así que un rechazo ("Sin existencias de la talla M en esta tienda") queda tapado por el "Agregado: …" siguiente.
- `handleScan` sale en silencio si el código está `loading` o `queued`: una segunda pieza idéntica presentada mientras su consulta está en curso o en espera se ignora sin aviso. (Con `Scanner continuous`, una segunda emisión del mismo código ya es una segunda presentación: `SAME_CODE_GAP_MS`.)
- Tras una venta exitosa, `clearErrorRows()` borra sin aviso las filas en error creadas durante el cobro (`Cobrar` ya está deshabilitado con filas en error antes de cobrar).

**Files:**
- Modify: `app/pos/page.tsx` (`flushHeld`, `handleScan`, `applyFound`, rama `result.ok` de `charge`)
- Modify: `components/sales/SaleCart.tsx` (fila `queued`/`loading` muestra "×N en espera" si hay piezas extra)
- Modify: `components/sales/SaleCart.tsx` tipo `PendingScan` → `{ code: string; status: "loading" | "error" | "queued"; extra?: number }`
- Test: `components/__tests__/PosPage-scan.test.tsx` (agregar casos), `components/__tests__/SaleCart.test.tsx` (caso `extra`)

**Interfaces:**
- `applyFound(result): { ok: true } | { ok: false; text: string }` (devuelve el resultado en vez de solo pintar el aviso).
- `pendingRef: Map<string, { status: "loading" | "error" | "queued"; extra: number }>`.

Reglas:
1. **Rechazo visible al vaciar la cola:** `flushHeld` junta los resultados; si hubo algún rechazo, el aviso final es de error y lista los rechazos (`Sin existencias de la talla M en esta tienda: Playera Nike rosa.`), seguido de "Se agregaron N prendas." si las hubo. Ningún rechazo queda tapado.
2. **Segunda pieza idéntica:** si llega el mismo código con estado `loading` o `queued`, `extra += 1` y el aviso dice `Otra pieza de {código} en espera (×{1 + extra}).` Al aplicar, `add` se llama `1 + extra` veces; cada llamada valida existencias (la regla `NO_STOCK` de `add` no cambia) y los rechazos siguen la regla 1. Con estado `error`, releer sigue siendo reintentar (sin `extra`).
3. **Filas en error tras la venta:** en la rama `result.ok`, antes de `clearErrorRows()`, si hay filas `error`, el aviso queda `Venta #{n} registrada. No se agregaron: {códigos}. Escanéalos de nuevo si van en otra venta.` (sigue siendo `kind: "ok"`; la venta sí se registró).
4. Nada de esto toca `charge` fuera de la rama `result.ok`, `requestIdFor`, `renewRequestId`, `markUncertain`, `markRejected` ni el bloqueo.

- [ ] **Step 1: Escribir las pruebas** (`PosPage-scan.test.tsx`):
  - `"al vaciar la cola tras el cobro, un rechazo no queda tapado por un Agregado"`
  - `"segunda pieza del mismo código durante el cobro queda en espera ×2 y se suma al terminar"`
  - `"segunda pieza del mismo código mientras su consulta carga suma ×2 al llegar"`
  - `"segunda pieza en espera sin existencias suficientes: entra una y se avisa el rechazo de la otra"`
  - `"fila de error creada durante el cobro se avisa al registrar la venta"`
  - `SaleCart.test.tsx`: `"fila en espera con extra muestra ×N en espera"`
- [ ] **Step 2: Ejecutar y ver que fallan.** Run: `npm test -- components/__tests__/PosPage-scan.test.tsx components/__tests__/SaleCart.test.tsx` → FAIL en los nuevos.
- [ ] **Step 3: Implementar** según Reglas.
- [ ] **Step 4: Ejecutar y ver que pasan.** Run: `npm test -- components/__tests__/PosPage components/__tests__/SaleCart lib/sales/__tests__/use-sale-draft.test.ts` → PASS, incluidas todas las pruebas existentes de `PosPage.test.tsx` sin cambio de expectativas.
- [ ] **Step 5: Commit.** `git commit -m "fix(pos): avisos de rechazo, segunda pieza en espera y filas en error tras la venta"`

---

### Task 7: Regresión del cobro y de la capa de datos — G24

**Files:** sin cambios de código. Pruebas: `components/__tests__/PosPage.test.tsx`, `components/__tests__/PosPage-scan.test.tsx`, `lib/sales/__tests__/actions.test.ts`, `lib/data/__tests__/prisma-sales.db.test.ts`, `lib/sales/__tests__/use-sale-draft.test.ts`.

- [ ] **Step 1: El servidor del cobro no cambió.** Run: `git diff main -- lib/sales/actions.ts lib/data/prisma-sales-source.ts lib/sales/use-sale-draft.ts` → sin diferencias. Si hay, parar y revisar con el dueño.
- [ ] **Step 2:** `npm test -- components/__tests__/PosPage components/__tests__/SaleCart lib/sales/__tests__/actions.test.ts lib/sales/__tests__/use-sale-draft.test.ts` → PASS.
- [ ] **Step 3:** `npm run test:db -- lib/data/__tests__/prisma-sales.db.test.ts` → PASS.
- [ ] **Step 4:** sin commit.

---

### Task 8: Gate de preview y de base antes de mezclar — G24

- [ ] **Step 1:** `npm test && npm run test:db && npm run lint && npm run build` → todo en verde; `test:db` obligatorio para mezclar.
- [ ] **Step 2: Preview de Vercel** (sin `prod`), contra la rama de Neon `ventas-prueba`, nunca la base de producción.
- [ ] **Step 3: Prueba manual en el preview:** escanear 3 prendas seguidas sin reiniciar la cámara; sostener una prenda (suma una vez) y presentarla de nuevo (×2); escanear durante un cobro dos piezas iguales (×2 en espera) y una sin existencias (rechazo visible al terminar); "Agregar nuevamente" en `/escanear` con una prenda vendida; colaborador sin acceso a la otra tienda; "Sin código" por tipo, marca, color y código interno; cobrar y confirmar que se resta la talla correcta.
- [ ] **Step 4: Mezclar solo con evidencia** y aprobación del dueño. Sin `prisma migrate` ni despliegue directo a producción.

---

## Preguntas abiertas (no las responde el spec)

1. ~~Lectura repetida con cámara abierta.~~ **Resuelta (decisión 2)**; `SAME_CODE_GAP_MS = 1000` se calibra en tienda (minor G16: si el decodificador pierde lecturas > 1 s con la prenda en cuadro, suma otra; la red de seguridad es ×N y quitar).
2. ~~¿"Agregar nuevamente" vive en `/pos` o en `/escanear`?~~ **Resuelta (decisión 7).**
3. **¿Qué significa "ya se vendió"?** Existe una `SaleLine` de la variante (incluye ventas canceladas). No bloquea.
4. ~~"Tipo" en la búsqueda.~~ **Resuelta:** `category` = `ProductType.name`.
5. ~~Permisos de "Agregar nuevamente".~~ **Resuelta:** cualquier rol con sesión, solo en su tienda.
6. **Preview y base:** el preview usa `ventas-prueba`; nunca escribir ventas de prueba en producción.
7. **Fuera de esta entrega (minors G17 aceptados):** canal/método/alias editables con carrito bloqueado; `NO_STOCK` en reintento incierto deja el carrito bloqueado (rígido pero seguro). Quedan para F (venta sin internet), que reescribe el cobro.

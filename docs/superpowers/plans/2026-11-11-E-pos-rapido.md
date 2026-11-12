# Subsistema E: escaneo rápido en /pos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir escanear varias prendas seguidas en /pos con la cámara abierta, agregar cada prenda al carrito en cuanto llega su consulta, validar existencias por talla en la tienda elegida, ofrecer "Agregar nuevamente" en `/escanear` para prendas ya vendidas y agregar prendas sin código desde un buscador de productos registrados. El cobro conserva `clientRequestId` sin cambios.

**Architecture:** El escáner (`components/inventory/Scanner.tsx`) gana un modo continuo opt-in que no se desmonta ni detiene tras cada lectura; `/escanear` sigue en modo de una lectura. `lookupCodeAction` recibe la tienda, valida que el usuario pueda operar en ella (`assertCanOperate`) y devuelve existencias de la talla y si ya se vendió. Mientras llega la consulta, `/pos` muestra una fila pendiente **por código** (no por `variantId`); al llegar, la prenda entra al carrito (`lib/sales/use-sale-draft.ts`) con su existencia conocida. "Agregar nuevamente" vive en `/escanear` y reutiliza `recordStockMovementAction` (`kind: "restock"`, que ya valida la tienda) mediante `SumToMyStore`; no hay acción nueva de entrada. E es el **único dueño** de la búsqueda "Sin código" (`searchProducts`/`searchProductsAction`, C21 y C22). El servidor de `createSaleAction` no cambia: ya valida stock con `InsufficientStockError` y `NO_STOCK`.

**Tech Stack:** Next.js (App Router) + React + TypeScript, Prisma sobre PostgreSQL, Vitest + React Testing Library (`npm test`), Vitest con base real (`npm run test:db`), html5-qrcode, Vercel (preview).

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

- [ ] **Step 1: Escribir la prueba de base de `getStockAt`**

En `lib/data/__tests__/prisma-stock.db.test.ts` agregar:

```ts
it("getStockAt devuelve available de la talla en la tienda y sold=true solo si hay SaleLine", async () => {
  // Arrange: variante con 3 piezas en la tienda A y sin ventas; misma variante sin fila en la tienda B.
  // Assert: getStockAt(variantA, storeA) -> { available: 3, sold: false }
  //         getStockAt(variantA, storeB) -> { available: 0, sold: false }
  // Tras una venta de 1 pieza en A: getStockAt(variantA, storeA) -> { available: 2, sold: true }
});
```

- [ ] **Step 2: Ejecutar la prueba y ver que falla**

Run: `npm run test:db -- -t "getStockAt"`
Expected: FAIL con "getStockAt is not a function".

- [ ] **Step 3: Implementar `getStockAt` y `listVariantStockAt`**

Agregar los dos métodos a `DataSource` (`lib/data/source.ts`) y su implementación en `prisma-source.ts` (consultas `inventoryLevel.findUnique` por `variantId_locationId` y `saleLine.count`) y en `fixture-source.ts` (mismo contrato con los datos de prueba). Sin upsert: sin fila, `available: 0`.

- [ ] **Step 4: Ejecutar la prueba y ver que pasa**

Run: `npm run test:db -- -t "getStockAt"`
Expected: PASS.

- [ ] **Step 5: Escribir la prueba de `lookupCodeAction` con tienda**

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

- [ ] **Step 6: Ejecutar la prueba y ver que falla**

Run: `npm test -- lib/__tests__/lookup-code-stock.test.ts`
Expected: FAIL (`stock` no existe).

- [ ] **Step 7: Implementar en `lookupCodeAction`**

Firma: `lookupCodeAction(raw: string, locationId?: string)`. Si `locationId` es texto no vacío, `assertCanOperate(user, locationId)` antes de buscar (`ForbiddenError` → `found: false` con su mensaje). Si `found`, llamar `getStockAt(match.variant.id, locationId)` y agregar `stock`. Agregar `listVariantStockAtAction` con la misma guarda. Si falla esa consulta, devolver `found: true` sin `stock` (el carrito lo tratará como "por confirmar", ver Task 3). Tipo: `{ found: true; product; variantId; stock?: { available: number; sold: boolean } }`.

- [ ] **Step 8: Ejecutar pruebas y ver que pasan**

Run: `npm test -- lib/__tests__/lookup-code-stock.test.ts && npm run test:db -- -t "getStockAt"`
Expected: PASS.

- [ ] **Step 9: Commit**

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

- [ ] **Step 1: Escribir las pruebas**

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

- [ ] **Step 2: Ejecutar y ver que fallan las dos primeras**

Run: `npm test -- components/__tests__/Scanner-continuous.test.tsx`
Expected: FAIL en las pruebas de modo continuo; la de sin `continuous` pasa.

- [ ] **Step 3: Implementar**

En `handleDecoded`, si `continuous`: no marcar `handledRef`, no llamar `stopScanner`, no cambiar `status`. Mantener la confirmación de dos lecturas consecutivas (`lastRef`) para descartar lecturas falsas. Guardar `{ code, lastSeenAt }` de la última emisión y actualizar `lastSeenAt` en cada lectura de ese código; emitir el mismo código otra vez solo si `now - lastSeenAt >= SAME_CODE_GAP_MS`. Bajar o quitar piezas se hace en el carrito ("−" y "Quitar"), no en el escáner. Respetar los formatos de `SCAN_FORMAT_NAMES` (D Task 7).

- [ ] **Step 4: Ejecutar pruebas de regresión y ver que pasan**

Run: `npm test -- components/__tests__/Scanner`
Expected: PASS (las existentes sin cambios y las nuevas).

- [ ] **Step 5: Commit**

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

- [ ] **Step 1: Escribir las pruebas**

```ts
it("add con el mismo variantId suma quantity a 2 y la línea se muestra como ×2", () => {});
it("add rechaza la segunda pieza si available es 1: devuelve NO_STOCK con la talla", () => {
  // expect(result).toEqual({ ok: false, reason: "NO_STOCK", size: "M" })
});
it("add sin stock confirmado (null) acepta la pieza con available null", () => {});
it("add con available 0 devuelve NO_STOCK y no crea la línea", () => {});
it("remove elimina la línea completa aunque tenga quantity 2", () => {});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npm test -- lib/sales/__tests__/use-sale-draft.test.ts`
Expected: FAIL en los casos nuevos.

- [ ] **Step 3: Implementar**

Agregar `available` a `DraftLine`. En `add`, validar contra `available` cuando no es null. `reset()` y `renewRequestId()` no cambian. No tocar `requestIdFor`, `markRejected`, `markUncertain`, `isUncertain`.

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `npm test -- lib/sales/__tests__/use-sale-draft.test.ts`
Expected: PASS (incluye los casos previos de id de la petición).

- [ ] **Step 5: Commit**

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

- [ ] **Step 1: Escribir las pruebas**

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

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npm test -- components/__tests__/PosPage-scan.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Cambios en `app/pos/page.tsx`: `<Scanner continuous>` sin `key` dinámico (quitar `scannerKey` y su `setScannerKey`); estado `pendingScans`; `handleScan` según las 5 reglas; pasar `locationId` a `lookupCodeAction`. Cambios en `SaleCart.tsx` según el Interfaces (filas pendientes arriba de las líneas, "×N", "−" deshabilitado en 1, "Quitar"). No se cambia `charge`, `requestSignature`, ni el manejo de `PRICE_CHANGED` / `UNAVAILABLE` / `request_conflict`.

- [ ] **Step 4: Ejecutar pruebas de cobro y de escaneo**

Run: `npm test -- components/__tests__/PosPage components/__tests__/SaleCart`
Expected: PASS. Todas las pruebas existentes de `PosPage.test.tsx` (incluidas "tras un error de red, reintentar manda el mismo clientRequestId" y "PRICE_CHANGED: …") deben pasar sin cambios.

- [ ] **Step 5: Commit**

```bash
git add app/pos/page.tsx components/sales/SaleCart.tsx components/__tests__/PosPage-scan.test.tsx
git commit -m "feat(pos): escaneo continuo con cámara abierta y existencias por talla"
```

---

### Task 5: "Agregar nuevamente" en `/escanear` para prendas ya vendidas

**Files:**
- Modify: `app/escanear/page.tsx` (pasa `locationId` a `lookupCodeAction`; si `stock.sold && stock.available === 0` en la tienda del usuario, muestra el aviso y "Agregar nuevamente")
- Modify: `components/inventory/SumToMyStore.tsx` (prop opcional `label?: string`, por defecto el texto actual de `sumLabel`)
- Test: `app/escanear/__tests__/page.test.tsx` (se agregan casos)
- Test: `lib/__tests__/actions-stock.test.ts` (se agrega caso de tienda ajena si A no lo dejó)

**Interfaces:**
- Consumes: `lookupCodeAction(code, locationId)` con `stock.sold` (Task 1); `SumToMyStore` y `recordStockMovementAction({ kind: "restock", ... })` (existentes; A Task 6 los deja como única entrada de piezas, con `assertCanOperate` y `requestId` idempotente).
- Produces: sin acción nueva. **No existe `restockSoldVariantAction`.** No crea `Product` ni `Variant`.

Reglas:
1. Solo en `/escanear` (decisión 7). En `/pos` una prenda vendida sin piezas solo muestra "Sin existencias de la talla X en esta tienda" (Task 4).
2. Texto: `Esta prenda ya se vendió. Puedes agregar piezas al mismo producto.` y botón `SumToMyStore` con `label="Agregar nuevamente"`, que pide cuántas piezas (1 a `MAX_STOCK_QUANTITY`) y llama `recordStockMovementAction` en la tienda del usuario.
3. La tienda la valida el servidor: un colaborador solo suma en su tienda (`assertCanOperate`); `/escanear` siempre pasa la tienda de la sesión.

- [ ] **Step 1: Escribir las pruebas**

```ts
// app/escanear/__tests__/page.test.tsx
it("prenda vendida sin piezas en la tienda muestra 'Agregar nuevamente'", () => {
  // lookupCodeAction -> { found: true, stock: { available: 0, sold: true } }
});
it("Agregar nuevamente llama recordStockMovementAction con kind restock, la tienda del usuario y el mismo requestId en el reintento", () => {});
it("prenda con piezas no muestra 'Agregar nuevamente'", () => {});

// lib/__tests__/actions-stock.test.ts
it("restock del colaborador en otra tienda: FORBIDDEN y no escribe", () => {});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npx vitest run app/escanear/__tests__/page.test.tsx lib/__tests__/actions-stock.test.ts`
Expected: FAIL en los casos nuevos de `/escanear` (el de tienda ajena puede pasar si A ya lo dejó; queda como regresión).

- [ ] **Step 3: Implementar**

Cambios de Files. No tocar `recordStockMovementAction` salvo que la prueba de tienda ajena falle (en ese caso, el fallo es de A: reportarlo).

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: el comando de Step 2 y `npm run test:db -- -t "RESTOCK"`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/escanear components/inventory/SumToMyStore.tsx app/escanear/__tests__/page.test.tsx lib/__tests__/actions-stock.test.ts
git commit -m "feat(escanear): agregar nuevamente piezas a una prenda ya vendida"
```

---

### Task 6: Botón "Sin código" con búsqueda de productos registrados

**Files:**
- Modify: `components/products/ExistingProductSearch.tsx` (props opcionales: `searchAction`, `heading`, `placeholder`, `pickLabel`, `hideNewButton`; por defecto el comportamiento actual)
- Create: `components/sales/SaleProductSearch.tsx` (envuelve `ExistingProductSearch` con `searchAction` de ventas y la elección de talla)
- Modify: `lib/data/prisma-source.ts` y `lib/data/fixture-source.ts` (`searchProducts` también busca por tipo, color y SKU interno)
- Modify: `lib/data/source.ts` (solo el comentario de `searchProducts`)
- Modify: `app/pos/page.tsx` (`ManualCodeEntry` `onNoBarcode` abre `SaleProductSearch`)
- Test: `components/__tests__/SaleProductSearch.test.tsx` (crear)
- Test: `lib/data/__tests__/prisma-products.db.test.ts` (C21) y `lib/data/__tests__/prisma-sales.db.test.ts` (C22)

**Interfaces:**
- Consumes: `listVariantStockAtAction(productId, locationId)` (Task 1), `add` del carrito (Task 3), `Product.color` (H), `Product.category` = `ProductType.name` (G).
- Produces:
  - **Una sola acción de búsqueda:** `searchProductsAction(query: string): Promise<ProductSearchHit[] | null>` (firma sin cambio) la usan `/escanear` y `/pos`. No se crea `searchRegisteredProductsAction`. D no implementa búsqueda (su antigua Task 6 se movió aquí).
  - `SaleProductSearch` props: `{ locationId: string; onAdd(match: VariantMatch, stock: { available: number; sold: boolean }): void }`.
  - `searchProducts(query)` (en `InventoryDataSource`, firma sin cambio) amplía el criterio: código público exacto, título, marca, `category` (el "tipo": con G es `ProductType.name`; no existe campo `tipo`), `color` y SKU interno de variantes activas (con `codeCandidates` para códigos). Solo productos activos y sin unir; máximo `MAX_SEARCH_RESULTS`.

Reglas de la búsqueda: no es texto libre; cada resultado muestra tallas con su existencia en la tienda elegida (de `listVariantStockAt`); elegir un producto y una talla con existencias agrega la línea con `add` y resta esa talla al vender. Talla sin existencias no se puede elegir (se muestra deshabilitada con la leyenda "Sin existencias").

- [ ] **Step 1: Escribir las pruebas**

```ts
// components/__tests__/SaleProductSearch.test.tsx
it("consulta sin resultados muestra 'No encontramos productos con «…»' y no agrega nada", () => {});
it("elegir producto y talla con existencias agrega la línea de esa talla", () => {});
it("talla con cero existencias aparece deshabilitada con 'Sin existencias'", () => {});

// lib/data/__tests__/prisma-products.db.test.ts
it("C21 (db): \"Sin código\" encuentra por tipo, marca, color o código interno", () => {
  // producto con category "Playeras" (tipo), brand "ALO", color "Rosa": "playeras", "alo", "rosa" y el sku interno lo devuelven
});
it("C21 (db): texto que no es producto no devuelve nada", () => {
  // searchProducts("zzzz-no-existe") -> []
});

// lib/data/__tests__/prisma-sales.db.test.ts
it("C22 (db): vender por referencia descuenta la talla", () => {
  // stock 3 de la talla M; venta de 1 por ese variantId (elegido desde la búsqueda) -> M queda en 2 y las demás tallas sin cambio
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npm test -- components/__tests__/SaleProductSearch.test.tsx && npm run test:db -- -t "C2[12]"`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`ExistingProductSearch` conserva su comportamiento por defecto (las pruebas `ExistingProductSearch` existentes en `components/__tests__/` deben pasar sin cambios). `SaleProductSearch` usa `searchProductsAction` y `listVariantStockAtAction`. El botón "Sin código" en `/pos` reemplaza el aviso actual "Una prenda sin código no se puede vender aquí…" en `ManualCodeEntry`.

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `npm test -- components/__tests__/SaleProductSearch.test.tsx components/__tests__/ExistingProductSearch && npm run test:db -- -t "searchProducts|C2[12]"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/products/ExistingProductSearch.tsx components/sales/SaleProductSearch.tsx lib/actions.ts lib/data/ app/pos/page.tsx components/__tests__/SaleProductSearch.test.tsx
git commit -m "feat(pos): venta sin código desde búsqueda de productos registrados"
```

---

### Task 7: Regresión del cobro y de la capa de datos

**Files:**
- Test (sin cambios de código): `components/__tests__/PosPage.test.tsx`, `lib/sales/__tests__/actions.test.ts`, `lib/data/__tests__/prisma-sales.db.test.ts`, `lib/sales/__tests__/use-sale-draft.test.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: confirmación de que el cobro no cambió.

- [ ] **Step 1: Verificar que `clientRequestId` y el cobro no cambiaron**

Run: `git diff main -- lib/sales/actions.ts lib/data/prisma-sales-source.ts`
Expected: sin diferencias. Si hay diferencias, parar y revisar con el dueño.

- [ ] **Step 2: Ejecutar pruebas de cobro**

Run: `npm test -- components/__tests__/PosPage.test.tsx lib/sales/__tests__/actions.test.ts lib/sales/__tests__/use-sale-draft.test.ts`
Expected: PASS, sin cambios de expectativa en ninguna prueba existente.

- [ ] **Step 3: Ejecutar base real de ventas**

Run: `npm run test:db -- lib/data/__tests__/prisma-sales.db.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

No hay cambios en este paso. No se crea commit.

---

### Task 8: Gate de preview y de base antes de mezclar

**Files:** ninguno (verificación y despliegue de preview).

**Interfaces:**
- Consumes: ramas de Tasks 1 a 7.
- Produces: evidencia de preview y de pruebas para el dueño.

- [ ] **Step 1: Pruebas completas**

Run: `npm test && npm run test:db && npm run lint && npm run build`
Expected: todo en verde. `npm run test:db` es obligatorio para mezclar.

- [ ] **Step 2: Preview de Vercel, sin producción**

Run: `vercel:deploy` (preview, sin argumento `prod`).
Expected: URL de preview. No se despliega a producción.

- [ ] **Step 3: Prueba manual en el preview**

Con una tienda de prueba y una prenda registrada: escanear 3 prendas seguidas sin reiniciar la cámara; sostener una prenda frente a la cámara (suma una vez) y volver a presentarla (×2); talla sin existencias (mensaje exacto); "Agregar nuevamente" en `/escanear` con una prenda vendida; colaborador sin acceso a la otra tienda; "Sin código" con búsqueda por tipo, marca y color; cobrar y confirmar que la venta resta la talla correcta.
Expected: cada punto se cumple. Sin registro de cliente real en la base de producción.

- [ ] **Step 4: Mezclar solo con evidencia**

Solo después de Steps 1 a 3 y de la aprobación del dueño. No hay `prisma migrate` ni deploy directo a producción.

---

## Preguntas abiertas (no las responde el spec)

1. ~~Lectura repetida con cámara abierta.~~ **Resuelta (decisión 2):** una vez por presentación (`SAME_CODE_GAP_MS = 1000`, Task 2); "×N" con controles para bajar o quitar. El valor de 1000 ms se calibra en el ensayo.
2. ~~¿"Agregar nuevamente" vive en `/pos` o en `/escanear`?~~ **Resuelta (decisión 7):** en `/escanear`, Task 5, con la tienda validada en el servidor.
3. **¿Qué significa "ya se vendió"?** Este plan usa "existe una `SaleLine` de la variante". Sigue abierta; no bloquea.
4. ~~"Tipo" en la búsqueda "Sin código".~~ **Resuelta:** busca por `category`, que con G es `ProductType.name`; sin campo `tipo`.
5. ~~Permisos de "Agregar nuevamente".~~ **Resuelta:** cualquier rol con sesión, solo en su tienda (`recordStockMovementAction` con `restock` y `assertCanOperate`).
6. **Preview y base.** ¿El preview de Vercel usa la base de producción? Si sí, las pruebas manuales de Task 8 escriben ventas reales. Usar `ventas-prueba` (cronograma, ensayo del 18).

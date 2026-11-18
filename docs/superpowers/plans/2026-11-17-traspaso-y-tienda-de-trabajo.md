# Traspaso entre tiendas y tienda de trabajo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que colaborador y encargado elijan en qué tienda trabajan (alta, POS, ventas) y que cualquier rol traspase piezas entre tiendas con dos movimientos atómicos.

**Architecture:** el servidor deja de amarrar a colaborador y encargado a `User.locationId`; la tienda viaja en cada petición y se valida. Un hook `useWorkLocation()` guarda la tienda elegida en `sessionStorage` y la comparten `/escanear`, `/pos` y `/ventas`. El traspaso es un método nuevo del data source (`transferStock`) que en una transacción crea `Movement` de salida y de entrada de tipo `TRANSFER`, ligados por `requestId` con sufijo. No hay migración.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Prisma 5.22 / PostgreSQL, next-auth 4.24, Vitest (`npm test`, `npm run test:db`).

**Spec:** `docs/superpowers/specs/2026-11-17-traspaso-y-tienda-de-trabajo-design.md` (issue #39)

## Global Constraints

- Trabajar en un worktree con `.env` de base local (podman `loloshop_pg_dev`, 127.0.0.1:55432). **Nunca** correr prisma ni scripts desde `~/Documentos/LoloShop` (su `.env` es producción). Sin migraciones.
- Ningún camino deja `InventoryLevel.available < 0`; salida y entrada del traspaso van en la misma transacción.
- Lo restringido por rol no cambia: precios del colaborador, anular ventas, aprobar ventas sin internet, crear tiendas, costos, rango de fechas del dashboard (el colaborador solo ve hoy) y `pendingReviewCount/Total` solo para el dueño.
- La venta sin internet no cambia de alcance: copia de la tienda elegida, firma por usuario y tienda, formato de IndexedDB igual. Basta con no romperla.
- Piezas por traspaso: entero de 1 a `MAX_STOCK_QUANTITY` (200). Motivo opcional con `validateReason` (3–120, sin 7+ dígitos seguidos).
- Clave común de `sessionStorage`: `loloshop:work-location` (reemplaza `loloshop:pos:location` y `loloshop:escanear:location`).
- Textos exactos (español, sin emojis):
  - Cabecera: "Estás en: {tienda}" · enlace o botón "Cambiar tienda".
  - Sin tienda elegida: "Elige en qué tienda estás."
  - Traspaso hecho: "Traspasadas {n} piezas de {origen} a {destino}. Ahora: {origen} {a} · {destino} {b}." (con n = 1: "Traspasada 1 pieza de …").
  - Errores: "Solo hay {n} en {origen}." / "Elige otra tienda de destino." / "No encontramos la prenda o la tienda." / el `DB_TIMEOUT_TEXT` existente.
  - Sin red: botón deshabilitado con "Conéctate para traspasar".
  - Notas de los movimientos: salida "A {destino}" o "A {destino}: {motivo}"; entrada "De {origen}" o "De {origen}: {motivo}".
- Repo público: sin secretos. Conventional Commits con "Refs #39". Implementador opus en las tareas 1, 4 y 5 (permisos y existencias).

## Review Focus

- **Doble toque o reintento del traspaso** tras un tiempo agotado: el mismo `requestId` no mueve piezas dos veces y responde con las existencias actuales (Task 4 y Task 6 lo prueban).
- **Dos personas traspasan la última pieza a la vez** desde la misma tienda: una gana, la otra recibe "Solo hay 0 en …" y no queda una entrada sin salida (Task 4, prueba de concurrencia).
- **Tienda guardada que ya no existe** en `sessionStorage` (otra sesión, tienda renombrada o base distinta): el selector cae a la tienda de siempre o pide elegir, sin enviar un id inválido (Task 6).
- **Colaborador sin red con copia de Lomas pero tienda elegida Alva**: el selector queda bloqueado en la tienda de la copia y la venta sale con esa tienda, como hoy (Task 7, prueba en `/pos`).
- **`/ventas` del colaborador con `location` de otra cosa** (id inventado o vacío): no muestra nada y no truena; nunca abre el rango de fechas (Task 2).

---

### Task 1: Permisos sin amarre de tienda

**Files:**
- Modify: `lib/auth/permissions.ts`
- Modify: `lib/sales/actions.ts:30-37`
- Modify: `lib/sales/offline-actions.ts:4,124-130`
- Test: `lib/__tests__/actions-permissions.test.ts`, pruebas de `lib/sales/__tests__` que hoy esperan "Solo puedes vender en tu tienda." o "No tienes tienda asignada."

**Interfaces:**
- Produces: `assertCanOperate(user: CurrentUser, locationId: string): void` — lanza `ForbiddenError("Elige en qué tienda estás.")` si `locationId` no es un texto no vacío; ya no compara con `user.locationId`. La existencia de la tienda la garantiza la llave foránea al escribir (P2003 → `StockTargetNotFoundError` / `NOT_FOUND`).
- `isStoreBound` se elimina (sin usos tras esta tarea; `app/escanear/page.tsx` solo lo menciona en un comentario, que se borra en Task 7).

- [ ] **Step 1: Pruebas que fallan**
  - Colaborador con `locationId = A` hace `recordStockMovementAction` en B → `ok: true`.
  - Colaborador **sin** tienda asignada hace entrada en A → `ok: true`.
  - Encargado con tienda A vende (`createSaleAction`) en B → no devuelve `FORBIDDEN`.
  - `submitOfflineSaleAction` de colaborador con tienda A y venta en B con token firmado para (usuario, B) → se registra.
  - `submitOfflineSaleAction` con token firmado para (usuario, A) y venta en B → sigue rechazada por el token (comportamiento actual de `verifySnapshotToken`).
  - `createSaleAction` con `locationId` que no existe → error controlado (`NOT_FOUND` o `INVALID`), no excepción.
  - `assertCanOperate(user, "")` lanza `ForbiddenError` con "Elige en qué tienda estás.".
- [ ] **Step 2:** `npm test` → FALLAN las nuevas.
- [ ] **Step 3:** Implementar. En `createSaleAction` cambiar el bloque `storeBound` por `assertCanOperate(user, sale.locationId)` con su `ForbiddenError` mapeado a `fail("FORBIDDEN", …)`. En `offline-actions.ts` quitar las dos comprobaciones de tienda asignada (líneas 124-130); dejar el token como la atadura.
- [ ] **Step 4:** `npm test`, `npm run test:db`, `npx tsc --noEmit`, `npm run lint` → verde.
- [ ] **Step 5:** Commit `feat(permisos): colaborador y encargado operan en cualquier tienda`.

### Task 2: Alcance de inventario, tiendas y dashboard

**Files:**
- Modify: `lib/domain/inventory-scope.ts`
- Modify: `lib/domain/dashboard-scope.ts`
- Modify: `lib/sales/dashboard-actions.ts`
- Test: `lib/domain/__tests__/inventory-scope.test.ts`, `lib/domain/__tests__/dashboard-scope.test.ts`, `lib/__tests__/actions-inventory-scope.test.ts`

**Interfaces:**
- `scopeInventory`, `scopeVariantMatch`, `scopeLocations`: el colaborador ve todo, igual que owner y manager. Se conservan las firmas (devuelven la entrada sin cambios) para no tocar a los llamadores; el comentario explica que el recorte de stock por tienda se retiró por #39.
- `scopeDashboardQuery(user, requested, today)`: para colaborador devuelve `{ from: today, to: today, locationIds: <ids>, pendingScope: "range" }` donde `<ids>` es `[requested.locationIds[0]]` si es un texto no vacío, y `[]` en otro caso. Encargado con tienda: mismo trato que encargado sin tienda (rango pedido, `locationIds` pedido o `"all"`), sin `recentSalesDate`.
- `getDashboardAction(requested)`: antes de consultar, si el usuario es colaborador, conserva el id pedido solo si está en `getDataSource().getLocations()`; si no, `locationIds: []`.

- [ ] **Step 1: Pruebas que fallan**
  - Colaborador con tienda A, `scopeInventory` de un producto con filas en A y B → conserva ambas.
  - `scopeLocations` del colaborador sin tienda → todas.
  - `scopeDashboardQuery` colaborador con `requested = { locationIds: ["B"], from: "2026-01-01" }` → `{ from: today, to: today, locationIds: ["B"], pendingScope: "range" }`.
  - Colaborador sin `locationIds` pedido → `locationIds: []`.
  - Encargado con tienda A pidiendo `locationIds: ["B"]` y un rango → recibe B y el rango; no recibe `recentSalesDate`.
  - `getDashboardAction` de colaborador con id inexistente → la consulta llega con `locationIds: []` y no lanza.
- [ ] **Step 2:** `npm test` → FALLAN.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, `npm run lint` → verde.
- [ ] **Step 5:** Commit `feat(ventas): colaborador ve existencias de todas las tiendas y el día de la tienda elegida`.

### Task 3: Validación del traspaso

**Files:**
- Modify: `lib/domain/stock-movement.ts`
- Test: `lib/domain/__tests__/stock-movement.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ValidTransfer {
  variantId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  reason: string | null;
  requestId: string;
}
export type TransferValidation = { ok: true; value: ValidTransfer } | { ok: false; message: string };
export function validateTransfer(input: unknown): TransferValidation;
```

- Mensajes: reutiliza los de `validateStockMovement` ("Falta la prenda.", "Falta la tienda.", "Identificador de la operación inválido.", "La cantidad debe ser un entero entre 1 y 200.", los de `validateReason`) y agrega "Elige otra tienda de destino." cuando `fromLocationId === toLocationId`.

- [ ] **Step 1: Pruebas que fallan:** válido con y sin motivo; origen igual a destino; cantidad 0, 201, 1.5 y "2"; `requestId` no UUID; motivo de 2 caracteres; motivo con un teléfono.
- [ ] **Step 2:** `npx vitest run lib/domain/__tests__/stock-movement.test.ts` → FALLA.
- [ ] **Step 3:** Implementar reutilizando `UUID_RE`, `MIN/MAX_STOCK_QUANTITY` y `validateReason`.
- [ ] **Step 4:** La misma prueba → PASA.
- [ ] **Step 5:** Commit `feat(inventario): validación del traspaso`.

### Task 4: `transferStock` en el data source

**Files:**
- Modify: `lib/data/source.ts` (interfaz `InventoryDataSource` + tipo de datos)
- Modify: `lib/data/prisma-source.ts` (junto a `recordStockMovement`, l. 365)
- Modify: `lib/data/fixture-source.ts`
- Test: `lib/data/__tests__/prisma-stock.db.test.ts` (o nuevo `prisma-transfer.db.test.ts`), `lib/data/__tests__/fixture-source.test.ts`

**Interfaces:**
- Consumes: `ValidTransfer` (Task 3).
- Produces:

```ts
export interface TransferStockData {
  variantId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;          // > 0
  notes: string | null;      // motivo ya validado
  requestId: string;         // UUID base; los movimientos usan `${requestId}:out` y `${requestId}:in`
  userId: string;
}
export interface TransferStockResult {
  fromAvailable: number;
  toAvailable: number;
  fromName: string;
  toName: string;
  replayed: boolean;
}
transferStock(data: TransferStockData): Promise<TransferStockResult>;
```

- Orden dentro de una sola `$transaction` con `INVENTORY_TX_OPTIONS`:
  1. Lee los nombres de ambas tiendas; si falta alguna o la talla, `StockTargetNotFoundError`.
  2. Si existe `Movement` con `requestId = "<id>:out"` → `replayed: true` con las existencias actuales.
  3. `movement.create` de salida (`type: "TRANSFER"`, `delta: -n`, origen, notas "A {destino}[: motivo]").
  4. `inventoryLevel.updateMany` con `available >= n`; con `count === 0`, `InsufficientStockError(variantId, actual, n)`.
  5. `movement.create` de entrada (`delta: +n`, destino, `"<id>:in"`, notas "De {origen}[: motivo]").
  6. `inventoryLevel.upsert` en destino.
- Fuera de la transacción: `P2002` sobre `requestId` → replay (como `recordStockMovement`); `P2003` → `StockTargetNotFoundError`.
- El fixture reproduce el mismo contrato en memoria (incluido el replay).

- [ ] **Step 1: Pruebas que fallan (db)**
  - Éxito: A=3, B=0, traspaso de 2 → A=1, B=2; dos `Movement` `TRANSFER` (−2 en A, +2 en B) con el `userId`, sufijos `:out`/`:in` y notas "A Lomas" / "De Club Alva".
  - Con motivo "Alta en tienda equivocada" → notas "A Lomas: Alta en tienda equivocada" y "De Club Alva: Alta en tienda equivocada".
  - Faltante: A=1, pide 2 → `InsufficientStockError` con `available: 1`; no hay `Movement` nuevos y B sigue igual.
  - Sin fila en origen → `InsufficientStockError` con `available: 0`.
  - Replay: mismo `requestId` dos veces → la segunda devuelve `replayed: true`, A y B no cambian otra vez, siguen 2 movimientos.
  - Concurrencia: A=1, dos traspasos simultáneos de 1 con `requestId` distintos → exactamente uno gana; A=0, B=1, 2 movimientos en total.
  - Destino inexistente → `StockTargetNotFoundError`; nada escrito.
- [ ] **Step 2:** `npm run test:db` → FALLAN.
- [ ] **Step 3:** Implementar en Prisma y en el fixture.
- [ ] **Step 4:** `npm run test:db`, `npm test`, `npx tsc --noEmit` → verde.
- [ ] **Step 5:** Commit `feat(inventario): traspaso atómico entre tiendas en el data source`.

### Task 5: `transferStockAction`

**Files:**
- Modify: `lib/actions.ts` (junto a `recordStockMovementAction`)
- Test: `lib/__tests__/actions-stock.test.ts` (o nuevo `actions-transfer.test.ts`)

**Interfaces:**
- Consumes: `validateTransfer` (Task 3), `transferStock` (Task 4), `assertCanOperate` (Task 1).
- Produces:

```ts
export type TransferResult =
  | { ok: true; replayed: boolean; fromAvailable: number; toAvailable: number; message: string }
  | { ok: false; code: "SESSION" | "FORBIDDEN" | "INVALID" | "INSUFFICIENT" | "NOT_FOUND" | "ERROR"; message: string; available?: number };
export async function transferStockAction(input: {
  variantId: string; fromLocationId: string; toLocationId: string;
  quantity: number; reason?: string; requestId: string;
}): Promise<TransferResult>;
```

- Nunca lanza. `message` en éxito es el texto exacto de Global Constraints ("Traspasadas 2 piezas de Club Alva a Lomas. Ahora: Club Alva 1 · Lomas 2."). `INSUFFICIENT` → "Solo hay {n} en {origen}." (el nombre lo obtiene de `getDataSource().getLocations()` si el error no lo trae). Tiempo agotado → `DB_TIMEOUT_TEXT`. `revalidatePath("/catalogo")` y `revalidatePath("/productos")` en éxito.

- [ ] **Step 1: Pruebas que fallan:** sin sesión → `SESSION`; colaborador traspasa de A a B → ok con el texto exacto; singular "Traspasada 1 pieza de …"; origen igual a destino → `INVALID` "Elige otra tienda de destino."; faltante → `INSUFFICIENT` con el texto; tienda inexistente → `NOT_FOUND`; error inesperado → `ERROR` sin lanzar.
- [ ] **Step 2:** `npm test` → FALLAN.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, `npm run lint` → verde.
- [ ] **Step 5:** Commit `feat(inventario): acción de traspaso`.

### Task 6: Tienda de trabajo compartida (`useWorkLocation`)

**Files:**
- Create: `lib/client/use-work-location.ts`
- Create: `components/layout/WorkLocationPicker.tsx`
- Test: `lib/client/__tests__/use-work-location.test.tsx`, `components/layout/__tests__/WorkLocationPicker.test.tsx`

**Interfaces:**
- Produces:

```ts
export const WORK_LOCATION_KEY = "loloshop:work-location";
export function pickWorkLocation(
  locations: { id: string }[], saved: string | null, assigned: string | null,
): string; // saved si existe en la lista; si no, assigned si existe; si no, "".
export function useWorkLocation(opts: { assigned: string | null; enabled: boolean }): {
  locations: { id: string; name: string }[];
  locationId: string;           // "" = sin elegir
  locationName: string | null;
  choose(id: string): void;     // guarda en WORK_LOCATION_KEY
  status: "loading" | "ready" | "error" | "session";
  retry(): void;
};
```

- `useWorkLocation` carga con `fetchLocationsAction()` (null → `session`), lee y escribe `sessionStorage` dentro de try/catch, y al montar migra una sola vez el valor de `loloshop:pos:location` o `loloshop:escanear:location` si la clave nueva está vacía.
- `WorkLocationPicker({ value, locations, onChange, disabled, lockedLabel? })` muestra "Estás en: {tienda}" y un `<select>` con la etiqueta "Cambiar tienda"; sin valor, "Elige en qué tienda estás.". `disabled` con `lockedLabel` sirve para el bloqueo sin red.

- [ ] **Step 1: Pruebas que fallan:** `pickWorkLocation` (guardada válida, guardada inexistente → asignada, ninguna → ""); el hook persiste al elegir y migra la clave vieja; sin `sessionStorage` (getItem lanza) sigue funcionando; el picker muestra "Estás en: Lomas" y "Elige en qué tienda estás.".
- [ ] **Step 2:** `npm test` → FALLAN.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, `npm run lint` → verde.
- [ ] **Step 5:** Commit `feat(ui): tienda de trabajo compartida`.

### Task 7: Selector en `/escanear`, `/pos` y `/ventas`

**Files:**
- Modify: `app/escanear/page.tsx:28,76-118,188-205`
- Modify: `app/pos/page.tsx:96,103-104,141-153,175-217,797-805,925-955`
- Modify: `app/ventas/page.tsx:38-60`
- Test: pruebas existentes de las tres páginas (`app/**/__tests__`)

**Interfaces:**
- Consumes: `useWorkLocation`, `WorkLocationPicker` (Task 6); `getDashboardAction({ ...range, locationIds: [locationId] })` (Task 2).
- `/escanear`: quitar `storeBound`; `locationId` sale del hook para todos los roles; el picker reemplaza al `<select>` actual y se ve siempre arriba del escáner.
- `/pos`: quitar `LOCATION_KEY` y la carga propia de tiendas; `useOfflinePos({ locationId })` recibe la tienda elegida para todos los roles; borrar la pantalla "Tu usuario no tiene una tienda asignada…" (l. 797). Sin red, el picker queda deshabilitado en la tienda de la copia (mismo cálculo que hoy usa `offline.locationId`) con `lockedLabel` = nombre guardado o "Tienda guardada en este teléfono".
- `/ventas`: el colaborador ve el picker y la consulta lleva `locationIds: [locationId]`; al cambiar de tienda recarga. Owner y encargado conservan su filtro actual.

- [ ] **Step 1: Pruebas que fallan:**
  - `/escanear` como colaborador con tienda A: aparece el picker con "Estás en: …", elige B y el alta se envía con B.
  - `/pos` como colaborador sin tienda asignada: ya no aparece el bloqueo; con tienda guardada B, la venta sale con B.
  - `/pos` sin red con copia de A y tienda elegida B: el picker está deshabilitado y la venta en cola lleva A.
  - `/ventas` como colaborador: la llamada a `getDashboardAction` incluye la tienda elegida; cambiarla vuelve a pedir.
- [ ] **Step 2:** `npm test` → FALLAN.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` → verde.
- [ ] **Step 5:** Commit `feat(ui): elegir tienda de trabajo en alta, POS y ventas`.

### Task 8: Pantalla "Traspasar"

**Files:**
- Create: `components/inventory/TransferStock.tsx`
- Modify: `app/escanear/page.tsx` (junto a `SumToMyStore`)
- Modify: `components/products/ProductAdminSheet.tsx:586` (fila por talla) y quitar el filtro de tiendas del colaborador en esa línea
- Test: `components/inventory/__tests__/TransferStock.test.tsx`

**Interfaces:**
- Consumes: `transferStockAction`, `TransferResult` (Task 5); `MAX_STOCK_QUANTITY`.
- Produces: `TransferStock({ variantId, title, size, inventory, locations, defaultFrom, online, onDone })`, donde `inventory: { locationId: string; available: number }[]` y `onDone(result: { fromAvailable: number; toAvailable: number })`.
- Comportamiento: "De" lista solo tiendas con existencias > 0 de la talla (predeterminada `defaultFrom` si tiene piezas); "A" lista las demás; piezas de 1 al disponible (tope 200); motivo opcional; botón "Traspasar {n} pieza(s)". El `requestId` se conserva entre reintentos y se renueva tras éxito o tras cambiar origen, destino o piezas (mismo patrón que `SumToMyStore`). `online === false` → botón deshabilitado con "Conéctate para traspasar". Muestra el `message` de la acción tal cual.

- [ ] **Step 1: Pruebas que fallan:** el origen sin piezas no aparece; destino excluye al origen; el botón dice "Traspasar 2 piezas"; doble toque manda un solo `requestId`; error `INSUFFICIENT` muestra "Solo hay 1 en Club Alva."; sin red, botón deshabilitado con el texto; éxito muestra el mensaje y llama a `onDone`.
- [ ] **Step 2:** `npm test` → FALLAN.
- [ ] **Step 3:** Implementar y montar en `/escanear` (al encontrar una prenda) y en la hoja de producto (por talla).
- [ ] **Step 4:** `npm test`, `npm run test:db`, `npx tsc --noEmit`, `npm run lint`, `npm run build` → verde.
- [ ] **Step 5:** Commit `feat(inventario): traspasar piezas desde alta y hoja de producto`.

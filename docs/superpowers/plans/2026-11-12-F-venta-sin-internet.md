# Subsistema F: venta sin internet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que `/pos` cobre sin internet en una cola local (IndexedDB) que se sincroniza sola, aceptando con revisión del dueño las ventas sin internet que al llegar no encuentran stock, sin que ningún camino deje stock negativo.

**Architecture:** Una migración aditiva (`Sale.origin`, campos de revisión, `SaleLine.shortfall`). `createSale` gana un modo `offline` que descuenta hasta 0 y registra el faltante; el camino en línea no cambia. En el cliente, `lib/offline/` guarda copia por tienda, cola e identidad en IndexedDB (`idb`) y un motor de sincronización FIFO reenvía cada venta con su mismo `clientRequestId`. El dueño aprueba o rechaza en `/ventas/revision`. El service worker cachea el HTML de `/pos`.

**Tech Stack:** Next.js 14.2 (App Router), React 18, TypeScript strict, `next-pwa` 5.6, Prisma 5.22 / PostgreSQL, `next-auth` 4 (JWT 12 h), Vitest (`npm test` jsdom; `npm run test:db` contra `TEST_DATABASE_URL`), `idb` 8, `fake-indexeddb` 6 (dev).

**Spec:** `docs/superpowers/specs/2026-11-12-venta-sin-internet-design.md`

## Global Constraints

- Online nunca negativo: `createSaleAction` y `createSale` sin `opts.offline` conservan `UPDATE … WHERE available >= n` e `InsufficientStockError`, sin cambios de comportamiento.
- Ningún camino deja `InventoryLevel.available < 0`.
- Migraciones solo con `prisma migrate dev --create-only`, en un worktree cuyo `.env` apunta al Postgres local; prohibido correr `migrate` en `/home/y4ga_/Documentos/LoloShop` (su `.env` es producción). Sin `DROP`, `RENAME` ni cambio de tipos. Prohibido editar SQL a mano.
- Repo público: ningún host, usuario, contraseña ni URL en código, docs o commits; solo nombres de variables.
- IndexedDB nunca guarda JWT, cookie, contraseñas ni secretos. `OfflineSnapshot` solo con las llaves de §5 del spec.
- UI sin Prisma: todo por `getDataSource()` / `getSalesSource()`.
- Cada acción nueva relee al usuario con `getCurrentUser()`; las de revisión exigen `role === "owner"`.
- Valores fijos: copia vigente ≤ 24 h; identidad sin conexión ≤ 12 h; refresco de copia cada 10 min; máximo 20 000 variantes por copia; espera de sincronización 15 s → 30 s → 60 s → … tope 5 min; `synced` se purga a los 7 días; `price_unverified` mira `PriceChange` de los últimos 7 días; `clock_skew` si `soldAt` > ahora + 5 min o < ahora − 7 días; `reviewNote` y motivo de rechazo ≤ 200.
- Folio local: `"L-" + clientRequestId.slice(0, 8)`.
- Textos al cajero en español, sin emojis, copiados del spec §10.
- Conventional Commits en rama `feat/venta-sin-internet`; no se mezcla ni despliega sin preview y prueba en dispositivo.

## Review Focus

1. **Teléfono cerrado con una venta en `sending`**: al reabrir se reenvía con el mismo id y el servidor hace replay; no hay segunda venta. Test: `sending huérfano se reenvía con el mismo clientRequestId` (Task 8) y `replay sin internet no descuenta dos veces` (Task 3).
2. **Dos teléfonos de la misma tienda venden sin internet la última pieza**: la segunda llega con `shortfall = 1`, queda en revisión y el stock queda en 0, no en −1. Test: `dos ventas sin internet concurrentes sobre la última pieza` (Task 3).
3. **Wifi conectado sin salida (navigator.onLine true, fetch falla)**: el carrito se bloquea como hoy y "Guardar sin internet" lo encola con su id incierto. Test: `lie-fi: bloqueo incierto ofrece Guardar sin internet con el mismo id` (Task 10).
4. **Sesión vencida al volver la red**: la cola no se marca como fallida ni se pierde; queda `pending` con aviso de iniciar sesión. Test: `session_expired detiene la cola y deja pending` (Task 8).
5. **Rechazar una venta con faltante y "la prenda regresó"**: solo reingresa lo que se descontó. Test: `rechazar con devolución reingresa quantity - shortfall` (Task 4).
6. **Cerrar sesión con ventas sin enviar**: la cola sobrevive; identidad y copias se borran. Test: `clearOnSignOut conserva la cola` (Task 7).

---

### Task 1: Migración aditiva y mapeo de `SaleRecord`

**Files:**
- Modify: `prisma/schema.prisma` (enums nuevos; `Sale`, `SaleLine`, `User`)
- Create (generado por Prisma): `prisma/migrations/<timestamp>_offline_sales_review/migration.sql`
- Modify: `lib/domain/sale.ts` (tipos), `lib/data/sales-source.ts` (`SaleRecord`), `lib/data/prisma-sales-source.ts` (`toRecord`), `lib/data/fixture-sales-source.ts`
- Test: `lib/data/__tests__/prisma-sales.db.test.ts`, `lib/data/__tests__/fixture-sales.test.ts`

**Interfaces:**
- Produces: `type SaleOrigin = "online" | "offline"`; `type SaleReviewStatus = "pending" | "approved" | "rejected"`; `type ReviewReason = "insufficient_stock" | "price_unverified" | "inactive_product" | "clock_skew"` (en `lib/domain/sale.ts`). `SaleRecord` suma `origin: SaleOrigin`, `soldAt: string | null`, `reviewStatus: SaleReviewStatus | null`, `reviewReasons: ReviewReason[]`, y cada línea `shortfall: number`.

- [ ] **Step 1: Escribir la prueba que falla** — en `prisma-sales.db.test.ts`: `venta en línea nace origin online, sin revisión y shortfall 0` → `expect(sale.origin).toBe("online"); expect(sale.reviewStatus).toBeNull(); expect(sale.reviewReasons).toEqual([]); expect(sale.lines.every(l => l.shortfall === 0)).toBe(true)`. Igual en `fixture-sales.test.ts`.
- [ ] **Step 2: Correr y ver que falla** — `npm run test:db -- prisma-sales` → FAIL (`origin` undefined).
- [ ] **Step 3: Esquema** — enums `SaleOrigin { online offline }`, `SaleReviewStatus { pending approved rejected }`; en `Sale`: `origin SaleOrigin @default(online)`, `soldAt DateTime?`, `offlineSnapshotAt DateTime?`, `reviewStatus SaleReviewStatus?`, `reviewReasons String[] @default([])`, `reviewedById String?`, `reviewedBy User? @relation("SaleReviewedBy", fields: [reviewedById], references: [id], onDelete: Restrict)`, `reviewedAt DateTime?`, `reviewNote String? @db.VarChar(200)`, `@@index([reviewStatus, createdAt])`; en `SaleLine`: `shortfall Int @default(0)`; en `User`: `salesReviewed Sale[] @relation("SaleReviewedBy")`.
- [ ] **Step 4: Generar la migración en el worktree local** — `npx prisma migrate dev --create-only --name offline_sales_review`, luego `npx prisma migrate dev`. Revisar que el SQL solo tenga `CREATE TYPE`, `ALTER TABLE … ADD COLUMN`, `CREATE INDEX`, `ADD CONSTRAINT` (sin `DROP`).
- [ ] **Step 5: Mapear** `toRecord` y la fixture (`reviewReasons` se filtra a `ReviewReason`).
- [ ] **Step 6: Verificar** — `npm run typecheck && npm test && npm run test:db` → PASS; `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --exit-code` → exit 0.
- [ ] **Step 7: Commit** — `feat(db): origen y revisión de ventas sin internet (migración aditiva)`

### Task 2: Dominio puro de la venta sin internet

**Files:**
- Create: `lib/domain/offline-sale.ts`
- Test: `lib/domain/__tests__/offline-sale.test.ts`

**Interfaces:**
- Consumes: `validateNewSale`, `NewSaleInput`, `ReviewReason` (Task 1).
- Produces:
  - `interface OfflineMeta { soldAt: string; snapshotAt: string }`
  - `type OfflineSaleInput = NewSaleInput & OfflineMeta`
  - `validateOfflineSale(input: unknown): { ok: true; value: OfflineSaleInput } | { ok: false; message: string }`
  - `planOfflineLine(available: number | null, quantity: number): { taken: number; shortfall: number }`
  - `resolveSoldAt(soldAt: string, now: Date): { at: Date; skewed: boolean }`
  - `isPriceKnown(unitPrice: number, current: number, recent: { oldPrice: number; newPrice: number }[]): boolean` (centavos)
  - `REVIEW_REASON_TEXT: Record<ReviewReason, string>` con: `insufficient_stock` "Faltó stock", `price_unverified` "Precio distinto al registrado", `inactive_product` "Prenda dada de baja", `clock_skew` "Hora del teléfono incorrecta".
  - `offlineFolio(clientRequestId: string): string` → `"L-" + id.slice(0, 8)`

- [ ] **Step 1: Pruebas que fallan** — `planOfflineLine(3, 2)` → `{taken: 2, shortfall: 0}`; `planOfflineLine(1, 2)` → `{1, 1}`; `planOfflineLine(0, 1)` → `{0, 1}`; `planOfflineLine(null, 2)` → `{0, 2}`; `resolveSoldAt` con +6 min → `skewed: true, at = now`; con −8 días → `skewed: true`; con −2 h → `skewed: false, at = soldAt`; `validateOfflineSale` rechaza `soldAt` no ISO ("La hora de la venta no es válida.") y hereda el rechazo del alias con 7 dígitos; `isPriceKnown(199.9, 249, [{oldPrice:199.9,newPrice:249}])` → true, `isPriceKnown(1, 249, [])` → false; `offlineFolio("3f9a2c1b-…")` → `"L-3f9a2c1b"`.
- [ ] **Step 2: Correr** — `npx vitest run lib/domain/__tests__/offline-sale.test.ts` → FAIL.
- [ ] **Step 3: Implementar** en `lib/domain/offline-sale.ts` (sin dependencias de Prisma ni del navegador).
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** — `feat(ventas): reglas puras de la venta sin internet`

### Task 3: `createSale` en modo sin internet y `cancelSale` con faltante

**Files:**
- Modify: `lib/data/sales-source.ts`, `lib/data/prisma-sales-source.ts`, `lib/data/fixture-sales-source.ts`
- Test: `lib/data/__tests__/prisma-offline-sales.db.test.ts` (nuevo), `lib/data/__tests__/fixture-sales.test.ts`

**Interfaces:**
- Consumes: Task 1 y Task 2.
- Produces: `createSale(input: NewSaleInput, userId: string, opts?: { offline?: OfflineMeta; checkPrice?: boolean }): Promise<SaleRecord>` (`checkPrice` sin `offline` se ignora). `cancelSale` reingresa `quantity − returnedQuantity − shortfall` y, si `reviewStatus === "pending"`, deja `rejected` con `reviewedById`/`reviewedAt`.

- [ ] **Step 1: Pruebas que fallan** (`prisma-offline-sales.db.test.ts`):
  - `sin internet con stock suficiente: descuenta, origin offline, sin revisión`
  - `sin internet con stock insuficiente: available 1, pide 2 → available 0, shortfall 1, reviewStatus pending, reasons ["insufficient_stock"], Movement SALE delta -1`
  - `sin internet sin fila InventoryLevel: shortfall = quantity, sin Movement`
  - `dos ventas sin internet concurrentes sobre la última pieza` (`Promise.all`; una con shortfall 0, otra con 1; `available` final 0)
  - `replay sin internet no descuenta dos veces` (mismo id dos veces → mismo `number`, un solo Movement por renglón)
  - `producto inactivo se acepta con inactive_product`
  - `colaborador con precio fuera de PriceChange de 7 días → price_unverified; owner no`
  - `soldAt 8 días atrás → clock_skew y businessDate de hoy`; `soldAt ayer → businessDate de ayer`
  - `en línea sin stock sigue lanzando InsufficientStockError` (regresión)
  - `available nunca < 0` (tras todas las anteriores, `count where available < 0` = 0)
  - `cancelSale con itemsReturned reingresa quantity - shortfall` y `anular una venta en revisión la deja rejected`
- [ ] **Step 2: Correr** — `npm run test:db -- prisma-offline-sales` → FAIL.
- [ ] **Step 3: Implementar** la rama `opts.offline` en `PrismaSalesDataSource.createSale`: mismo replay/conflicto y orden por `variantId`; por renglón `tx.$queryRaw` `SELECT "available" FROM "InventoryLevel" WHERE "variantId" = … AND "locationId" = … FOR UPDATE`, `planOfflineLine`, `update` con `decrement: taken` si `taken > 0`; `SaleLine.shortfall`; Movement solo con `taken > 0`; razones (`price_unverified` solo con `opts.checkPrice`, que la acción pone en `true` para colaborador). Variante inexistente → `SalesRuleError("Un producto de la venta ya no existe.")`. Fixture equivalente.
- [ ] **Step 4: Correr** — `npm run test:db && npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(ventas): registrar ventas sin internet sin stock negativo`

### Task 4: Revisión del dueño en el data source y contador del dashboard

**Files:**
- Modify: `lib/data/sales-source.ts`, `lib/data/prisma-sales-source.ts`, `lib/data/fixture-sales-source.ts`
- Test: `lib/data/__tests__/prisma-offline-review.db.test.ts` (nuevo), `lib/data/__tests__/fixture-sales.test.ts`

**Interfaces:**
- Produces:
  - `interface ReviewItem { saleId: string; number: number; locationId: string; locationName: string; cashierName: string; soldAt: string | null; createdAt: string; total: number; paymentMethod: PaymentMethod; reasons: ReviewReason[]; lines: { variantId: string; productTitle: string; size: string; quantity: number; shortfall: number; unitPrice: number }[] }`
  - `listSalesForReview(): Promise<ReviewItem[]>` (pendientes, `createdAt` asc, máx. 100)
  - `approveReview(saleId: string, userId: string, note?: string): Promise<SaleRecord>`
  - `rejectReview(saleId: string, userId: string, reason: string, itemsReturned: boolean): Promise<SaleRecord>`
  - `DashboardData.pendingReviewCount: number`

- [ ] **Step 1: Pruebas que fallan** — `aprobar deja approved, reviewedBy y no cambia available`; `rechazar con devolución reingresa quantity - shortfall` (available 0, línea qty 2 shortfall 1 → available 1, un Movement RETURN +1); `rechazar sin devolución no toca stock y deja cancelled`; `aprobar una venta no pendiente lanza SalesRuleError("Esta venta ya no está por aprobar.")`; `aprobar y rechazar a la vez: solo una gana`; `nota de más de 200 lanza SalesRuleError`; `pendingReviewCount cuenta solo pending del alcance`; `ventas en revisión cuentan en soldTotal y las rechazadas no`.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar** — aprobar con `updateMany where { id, reviewStatus: "pending" }`; rechazar en una transacción: `updateMany where { id, reviewStatus: "pending", status in [pending_payment, paid] }` a `rejected` + `cancelled` y reingreso como `cancelSale` (Task 3).
- [ ] **Step 4: Correr** — `npm run test:db && npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(ventas): aprobar o rechazar ventas sin internet`

### Task 5: Acciones del servidor para la copia y el envío

**Files:**
- Modify: `lib/data/source.ts`, `lib/data/prisma-source.ts`, `lib/data/fixture-source.ts`
- Create: `lib/sales/offline-actions.ts`
- Test: `lib/sales/__tests__/offline-actions.test.ts`, `lib/data/__tests__/prisma-offline-snapshot.db.test.ts`

**Interfaces:**
- Consumes: Task 2, Task 3.
- Produces:
  - `interface OfflineSnapshotVariant { variantId: string; productId: string; barcode: string | null; sku: string; productTitle: string; variantTitle: string; size: string; price: number; available: number }`
  - `interface OfflineSnapshot { locationId: string; generatedAt: string; variants: OfflineSnapshotVariant[] }`
  - `MAX_SNAPSHOT_VARIANTS = 20_000`
  - `InventoryDataSource.getOfflineSnapshot(locationId: string): Promise<OfflineSnapshot>`
  - `getOfflineSnapshotAction(locationId: string): Promise<{ ok: true; snapshot: OfflineSnapshot } | { ok: false; reason: "session_expired" | "forbidden" | "too_large" | "unavailable" }>`
  - `type OfflineSaleResult = { ok: true; sale: SaleRecord; review: boolean } | Extract<SaleActionResult, { ok: false }>`
  - `submitOfflineSaleAction(input: unknown): Promise<OfflineSaleResult>`

- [ ] **Step 1: Pruebas que fallan** — db: `la copia trae solo la tienda pedida, activos y con 0 piezas`; `la copia excluye fusionados`. Unidad: `las llaves de cada variante son exactamente las de OfflineSnapshotVariant` (`Object.keys` ordenadas); `colaborador no baja la copia de otra tienda → forbidden`; `sin sesión → session_expired`; `más de 20 000 → too_large`; `submitOfflineSaleAction sin sesión → FORBIDDEN session_expired`; `colaborador en otra tienda → FORBIDDEN`; `no evalúa PRICE_CHANGED` (no llama `prisma.variant.findMany` de precios); `pasa checkPrice true solo a colaborador`; `soldAt inválido → INVALID`.
- [ ] **Step 2: Correr** — `npx vitest run lib/sales/__tests__/offline-actions.test.ts` y `npm run test:db -- prisma-offline-snapshot` → FAIL.
- [ ] **Step 3: Implementar** — snapshot con `select` explícito (sin `include`); acciones con `currentUserOrNull` + `assertCanOperate` / mismo `storeBound` que `createSaleAction`, `mapError` reutilizado (exportarlo desde `lib/sales/actions.ts` no es posible en archivo `"use server"`: moverlo a `lib/sales/action-errors.ts` sin `"use server"`), `revalidatePath("/ventas")` tras éxito.
- [ ] **Step 4: Correr** → PASS; `npm test` completo verde.
- [ ] **Step 5: Commit** — `feat(ventas): acciones de copia local y envío de ventas sin internet`

### Task 6: Pantalla `/ventas/revision` y aviso en `/ventas`

**Files:**
- Create: `lib/sales/review-actions.ts`, `app/ventas/revision/page.tsx`, `components/sales/ReviewList.tsx`
- Modify: `app/ventas/page.tsx`, `lib/sales/dashboard-actions.ts` (pasa `pendingReviewCount` solo al owner)
- Test: `lib/sales/__tests__/review-actions.test.ts`, `components/__tests__/ReviewList.test.tsx`

**Interfaces:**
- Consumes: Task 4.
- Produces: `listReviewAction(): Promise<ReviewItem[] | null>`; `approveReviewAction(saleId: string, note?: string): Promise<SaleActionResult>`; `rejectReviewAction(saleId: string, reason: string, itemsReturned: boolean): Promise<SaleActionResult>`.

- [ ] **Step 1: Pruebas que fallan** — acciones: `manager y colaborador reciben FORBIDDEN "Solo el dueño aprueba ventas sin internet."`; `rol releído de la BD (JWT dice owner, BD dice manager → FORBIDDEN)`; `rechazo sin motivo → INVALID`; `itemsReturned no booleano → INVALID`. UI: `muestra razones con REVIEW_REASON_TEXT y "Faltó stock: 1 pieza de <título> <talla>"`; `Rechazar pide motivo y "¿La prenda regresó a la tienda?"`; `/ventas muestra "N ventas sin internet por aprobar" solo al owner con N > 0`.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar** — página de cliente con `StaffLoadState`, botones con el componente `Button`, sin parámetros en la URL.
- [ ] **Step 4: Correr** — `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(ventas): pantalla del dueño para aprobar ventas sin internet`

### Task 7: Almacenamiento local (IndexedDB)

**Files:**
- Modify: `package.json` (`idb` ^8 en dependencies; `fake-indexeddb` ^6 en devDependencies; cada prueba importa `fake-indexeddb/auto`, sin tocar `vitest.setup.ts`)
- Create: `lib/offline/db.ts`, `lib/offline/queue-store.ts`, `lib/offline/snapshot-store.ts`, `lib/offline/identity-store.ts`
- Test: `lib/offline/__tests__/stores.test.ts`

**Interfaces:**
- Consumes: `OfflineSnapshot` (Task 5), `offlineFolio` (Task 2).
- Produces:
  - `openOfflineDb(): Promise<IDBPDatabase<OfflineSchema>>` (nombre `loloshop-offline`, versión 1, almacenes `snapshots`, `queue` con índice `bySoldAt`, `identity`)
  - `type QueueState = "pending" | "sending" | "synced" | "needs_attention"`
  - `interface QueuedSale { clientRequestId; userId; locationId; channel; paymentMethod; customerAlias?; lines: { variantId; quantity; unitPrice; sku; productTitle; variantTitle }[]; total; soldAt; snapshotAt; state: QueueState; attempts: number; lastError?: string; saleNumber?: number; review?: boolean; syncedAt?: string }`
  - `enqueueSale(sale: Omit<QueuedSale, "state" | "attempts">): Promise<void>` (falla si el id ya existe)
  - `listQueue(): Promise<QueuedSale[]>` (por `soldAt`), `updateQueued(id: string, patch: Pick<Partial<QueuedSale>, "state" | "attempts" | "lastError" | "saleNumber" | "review" | "syncedAt">): Promise<void>`, `discardQueued(id: string): Promise<void>`, `purgeSynced(now: Date): Promise<number>` (7 días)
  - `saveSnapshot(s: OfflineSnapshot)`, `getSnapshot(locationId: string): Promise<OfflineSnapshot | null>`, `localAvailable(snapshot: OfflineSnapshot, queue: QueuedSale[], variantId: string): number` (resta solo `pending`/`sending` de esa tienda)
  - `saveIdentity({ userId, role, locationId, confirmedAt })`, `getIdentity()`, `clearOnSignOut(): Promise<void>` (borra `identity` y `snapshots`, conserva `queue`)

- [ ] **Step 1: Pruebas que fallan** (`import "fake-indexeddb/auto"`) — `encolar dos veces el mismo id falla`; `updateQueued no cambia lines, total ni clientRequestId` (el tipo lo impide y la prueba lo comprueba en tiempo de ejecución); `listQueue ordena por soldAt`; `purgeSynced borra synced de más de 7 días y nunca pending ni needs_attention`; `localAvailable resta pending y sending, no synced`; `clearOnSignOut conserva la cola`; `ningún almacén contiene llaves token, password, secret, cookie` (recorre todos los registros guardados en la prueba).
- [ ] **Step 2: Correr** — `npx vitest run lib/offline` → FAIL.
- [ ] **Step 3: Implementar** con `idb`; `navigator.storage?.persist?.()` en el primer `enqueueSale`.
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** — `feat(offline): cola, copia e identidad en IndexedDB`

### Task 8: Motor de sincronización

**Files:**
- Create: `lib/offline/sync.ts`, `lib/offline/use-offline-sync.ts`
- Test: `lib/offline/__tests__/sync.test.ts`, `lib/offline/__tests__/use-offline-sync.test.tsx`

**Interfaces:**
- Consumes: Task 7; `submitOfflineSaleAction` (Task 5).
- Produces:
  - `interface SyncSummary { sent: { folio: string; number: number; review: boolean }[]; failed: { folio: string; message: string }[]; stoppedBy: null | "network" | "session_expired" }`
  - `runSync(deps: { userId: string; submit: (input: unknown) => Promise<OfflineSaleResult>; now: () => Date }): Promise<SyncSummary>`
  - `nextDelayMs(attempt: number): number` → 15 000, 30 000, 60 000, …, tope 300 000
  - `useOfflineSync(userId: string | null): { pendingCount: number; otherUserCount: number; needsAttention: QueuedSale[]; lastSummary: SyncSummary | null; syncing: boolean; syncNow: () => void }`

- [ ] **Step 1: Pruebas que fallan** — `envía en orden de soldAt, una a la vez`; `cada envío lleva el clientRequestId, tienda, canal, método y líneas del registro, más soldAt y snapshotAt`; `sending huérfano se reenvía con el mismo clientRequestId`; `excepción de red detiene la cola, deja pending y attempts+1`; `session_expired detiene la cola y deja pending`; `INVALID deja needs_attention y sigue con la siguiente`; `ok guarda saleNumber y review`; `registros de otro userId no se envían y cuentan en otherUserCount`; `nextDelayMs(0..6)`; hook: `evento online dispara syncNow`; `visibilitychange a visible dispara`; `dos runSync simultáneos no envían el mismo registro dos veces` (con `navigator.locks` simulado y sin él).
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar** — `runSync` marca `sending` antes de llamar, y vuelve a `pending` en red/`UNAVAILABLE`; exclusión con `navigator.locks.request("loloshop-offline-sync", { ifAvailable: true }, …)` o bandera de módulo; el hook usa temporizador con `nextDelayMs` mientras `pendingCount > 0` y llama `purgeSynced` al terminar.
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** — `feat(offline): sincronización automática de la cola`

### Task 9: Copia local en `/pos`, búsqueda sin internet e identidad sin conexión

**Files:**
- Create: `lib/offline/use-offline-pos.ts`, `lib/offline/lookup.ts`
- Modify: `app/pos/page.tsx` (solo la carga de sesión y `runLookup`)
- Test: `lib/offline/__tests__/lookup.test.ts`, `components/__tests__/PosPage-offline.test.tsx` (nuevo)

**Interfaces:**
- Consumes: Task 5, Task 7.
- Produces:
  - `lookupOffline(code: string, snapshot: OfflineSnapshot, queue: QueuedSale[]): { found: true; variant: OfflineSnapshotVariant; available: number } | { found: false }` (por `barcode` o `sku` con `normalizeCode`)
  - `useOfflinePos(args: { online: boolean; sessionUser: { id: string; role: Role; locationId: string | null } | null; locationId: string }): { identity: { userId: string; role: Role; locationId: string | null } | null; snapshot: OfflineSnapshot | null; snapshotAgeMs: number | null; canSellOffline: boolean; blockReason: null | "no_snapshot" | "stale_snapshot" | "identity_expired" }`
  - `toDraftMatch(v: OfflineSnapshotVariant): VariantMatch` (imagen `null`) para `useSaleDraft.add`

- [ ] **Step 1: Pruebas que fallan** — `lookupOffline encuentra por barcode y por sku normalizados`; `available descuenta la cola pending`; POS: `sin red con sesión en caché de 11 h usa la identidad local`; `con 13 h muestra "Conéctate e inicia sesión para seguir vendiendo"`; `copia de 25 h bloquea con "Conéctate para actualizar precios y existencias"`; `lectura sin red agrega desde la copia`; `código ausente muestra "No está en la copia de esta tienda. Si es nueva, se vende cuando vuelva la conexión."`; `con red refresca la copia al abrir y cada 10 min` (timers falsos); `owner sin red no puede cambiar de tienda`.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar** — `online` sale de `navigator.onLine` + eventos; la identidad se guarda cada vez que `useSession` está `authenticated`; `runLookup` usa `lookupOffline` si `!online` o si `lookupCodeAction` lanza por red.
- [ ] **Step 4: Correr** — `npm test` → PASS (incluidas `PosPage.test.tsx` y `PosPage-scan.test.tsx` sin cambios).
- [ ] **Step 5: Commit** — `feat(pos): búsqueda en la copia local sin internet`

### Task 10: Cobro sin internet, bloqueo incierto y avisos al cajero

**Files:**
- Create: `components/sales/OfflineBanner.tsx`, `components/sales/OfflineQueueSheet.tsx`
- Modify: `app/pos/page.tsx` (`charge`, panel de `lock`, cabecera)
- Test: `components/__tests__/PosPage-offline.test.tsx`, `components/__tests__/OfflineQueueSheet.test.tsx`

**Interfaces:**
- Consumes: Tasks 2, 7, 8, 9.
- Produces: `enqueueCurrentSale(): Promise<void>` interno de la página; `OfflineBanner({ snapshotAgeMs, pendingCount })`; `OfflineQueueSheet({ items, canDiscard, onDiscard, onSyncNow })`.

- [ ] **Step 1: Pruebas que fallan**
  - `sin red, Cobrar encola con draft.requestIdFor(requestSignature), limpia el carrito y muestra "Venta guardada sin internet (L-xxxxxxxx). Se enviará sola."`
  - `cobro que lanza por red con navigator.onLine false se encola con el mismo id y no bloquea`
  - `lie-fi: bloqueo incierto ofrece Guardar sin internet con el mismo id` (onLine true + excepción → panel con "Reintentar cobro", "Guardar sin internet", "Ya revisé en Ventas")
  - `con lock conflict no aparece Guardar sin internet`
  - `UNAVAILABLE mantiene el bloqueo actual`
  - `lecturas en espera entran al carrito nuevo tras encolar`
  - `el carrito sin internet no deja pasar del stock local`
  - `banda "Sin internet. Las ventas se guardan en este teléfono y se envían solas al volver la conexión." y edad de la copia`
  - `resumen "3 ventas enviadas (#120, #121, #122). 1 quedó por aprobar del dueño."`
  - `hoja: estados Por enviar / Enviando / Enviada #123 / Enviada, por aprobar / Necesita atención; Descartar solo owner o manager y con confirmación`
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar** — `enqueueCurrentSale` valida con `validateNewSale`, toma `soldAt = new Date().toISOString()` y `snapshotAt = snapshot.generatedAt`, usa `submittingRef` igual que `charge`, y al terminar `setLock(null)`, `clearErrorRows()`, `draft.reset()`, `flushHeld()`. Tras un cobro en línea con éxito, `syncNow()`.
- [ ] **Step 4: Correr** — `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(pos): cobrar sin internet y avisos de sincronización`

### Task 11: Service worker, cierre de sesión y verificación en dispositivo

**Files:**
- Modify: `next.config.mjs` (`runtimeCaching`), `components/layout/NavBar.tsx` (salir)
- Create: `lib/pwa/runtime-caching.mjs` (la regla, exportada para probarla)
- Test: `lib/pwa/__tests__/runtime-caching.test.ts`, `components/__tests__/NavBar.test.tsx`

**Interfaces:**
- Consumes: `clearOnSignOut`, `listQueue` (Task 7).
- Produces: `posRuntimeCaching` (arreglo de reglas de Workbox) concatenado delante de `next-pwa/cache` en `withPWAInit({ runtimeCaching })`.

- [ ] **Step 1: Pruebas que fallan** — `regla /pos: NetworkFirst, networkTimeoutSeconds 4, cacheName pos-page, cacheableResponse statuses [200], maxEntries 1`; `solo coincide con navegaciones a /pos (no /api ni /posx)`; `las reglas por omisión de next-pwa siguen después`; NavBar: `salir con ventas sin enviar advierte "Hay N ventas sin enviar en este teléfono. Se enviarán cuando vuelvas a entrar."`; `salir llama clearOnSignOut antes de signOut`.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar** la regla (`({ request, url }) => request.mode === "navigate" && url.pathname === "/pos"`) y el cambio de NavBar.
- [ ] **Step 4: Verificación completa** — `npm run lint && npm run typecheck && npm test && npm run test:db && npm run build` → todo verde; `grep -c pos-page public/sw.js` ≥ 1.
- [ ] **Step 5: Prueba en dispositivo (preview de Vercel)** — Android Chrome y iPhone con la PWA instalada: (1) abrir `/pos` con red; (2) modo avión; (3) cerrar y reabrir la app: `/pos` abre; (4) escanear y cobrar 2 ventas; (5) cerrar la app; (6) quitar modo avión y abrir `/pos`: en ≤ 30 s "2 ventas enviadas"; (7) `/ventas` las muestra con su día; (8) repetir con dos teléfonos de la misma tienda vendiendo la última pieza: una aparece en `/ventas/revision`; (9) DevTools → Application → IndexedDB: sin token ni cookie. Anotar resultado en la bitácora.
- [ ] **Step 6: Commit** — `feat(pwa): /pos disponible sin conexión`

---

## Salida a producción (después de la demo)

1. Respaldo restaurable de Neon y prueba de restauración (patrón `docs/runbooks/2026-11-salida-ventas.md`).
2. Rama de Neon: `prisma migrate deploy` + `npm run test:db` apuntando a ella.
3. `prisma migrate deploy` en producción desde la terminal del dueño **antes** del merge (la migración es aditiva y compatible con el código actual).
4. Preview, prueba en dispositivo (Task 11 Step 5), merge, deploy. Pestañas PWA viejas deben recargarse.
5. Retroceso: revertir el merge; las columnas nuevas quedan sin uso (sin efecto).

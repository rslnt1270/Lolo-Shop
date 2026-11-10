# Ventas y dashboards P1 (antes del Buen Fin): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** registrar ventas reales (tienda y WhatsApp) que descuentan stock sin quedar en negativo aunque se vendan al mismo tiempo en las dos tiendas, y darle al owner y al colaborador un dashboard de ventas, cobros pendientes y stock bajo; además, alta con marca y departamento, y cierre del bloqueante B1.

**Architecture:**
- **Datos:** el esquema gana `Brand`, `Department`, `Sale`, `SaleLine` y `AppSetting` mediante migraciones de `prisma migrate`, después de un baseline generado por Prisma. La venta vive en un `SalesDataSource` nuevo, separado de `InventoryDataSource`, con una implementación Prisma (transacción con descuento condicional) y otra de fixtures para la UI y los tests.
- **Servidor:** las Server Actions validan el rol releyendo al usuario en la base. El dashboard recorta el rango en el servidor según el rol.
- **UI:** `/pos` deja de ser una maqueta y pasa a ser la pantalla de venta. `/ventas` es el dashboard.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Prisma 5 + PostgreSQL 16, NextAuth, Vitest + RTL, `html5-qrcode`.

**Specs (leer antes de cada tarea; son la fuente de verdad):**
- `docs/superpowers/specs/2026-11-05-modelo-datos-er.md` (§2.2, §2.3, §2.6, §2.7, §3, §4, §5): **campos, reglas e índices exactos**.
- `docs/superpowers/specs/2026-11-05-loloshop-srs.md` (RF-VEN, RF-DASH, RF-CAT, RF-AUT, RF-WEB-01, RNF-DISP-04).
- `docs/superpowers/specs/2026-11-05-arquitectura-flujos.md` (§2.2, §2.3, §4.3).

**Ejecución:** worktree nuevo `../LoloShop-ventas` en la rama `feat/ventas-p1`, creada desde `feat/demo-alta-lote` (ya contiene el alta por lote, commits `2b0f014` y `d4263e4`).

## Global Constraints

- Migraciones **solo** con `prisma migrate`. Nunca SQL escrito a mano ni `db push` contra Neon. El SQL de cada migración lo genera Prisma.
- No tocar la base de producción en ninguna tarea. Todo se prueba contra Postgres local (`loloshop_pg_dev`, puerto `127.0.0.1:55432`). La Tarea 12 es un runbook que ejecuta el dueño.
- El repo es **público**: no commitear `.env*`, cadenas de conexión ni contraseñas. Las cadenas de prueba van en `.env.test.local` (gitignored); `.env.example` lleva solo nombres.
- No tocar `app/catalogo/*`, `lib/virtual-store/` ni `components/virtual-store/` (trabajo de Antigravity). La Tarea 10 indica la única excepción, que requiere permiso del dueño.
- Zona horaria del negocio: `America/Mexico_City`. `businessDate` se calcula en el servidor.
- Roles y quién puede qué:
  - **Venta:** owner, manager y collaborator; el collaborator solo en su `locationId`.
  - **Confirmar pago SPAY:** owner y manager.
  - **Anular:** solo el owner.
  - **Dashboard:** el mismo para todos, con importes. El collaborator ve solo el día de negocio en curso y su tienda; el owner, todo el histórico. El manager ve el histórico de su `locationId`, o de todas si no tiene tienda asignada (decisión del autor; el dueño la puede revisar).
- No se guardan datos de contacto del cliente. `customerAlias`: máximo 40 caracteres y se rechaza si trae 7 o más dígitos seguidos.
- Copy de la UI en español. Métodos de pago visibles: "Transferencia SPAY", "Efectivo", "Tarjeta". Canales visibles: "Tienda", "WhatsApp".
- Commits en Conventional Commits, con el pie de atribución de la sesión.
- Verificación de cada tarea: `npm test`, `npx tsc --noEmit` y `npm run lint` en verde. Las pruebas que tocan la base corren con `npm run test:db`.

## Review Focus

1. **Doble toque o reintento de red al cobrar:** se crea una sola venta (`clientRequestId`). Prueba en la Tarea 4 (paralelo) y en la Tarea 7 (el botón se deshabilita y el reintento reutiliza el mismo id).
2. **Un collaborator que manda en la petición un `locationId` ajeno o un rango histórico:** el servidor lo ignora o lo rechaza. Pruebas en las Tareas 5 y 6.
3. **Cambio de rol después del login (JWT viejo):** las acciones sensibles releen el rol en la base. Prueba en la Tarea 5 (un JWT con rol owner y la base con collaborator no puede anular).
4. **Venta cerca de medianoche:** a las 23:30 de México cuenta para el día correcto, aunque en UTC ya sea el día siguiente. Prueba en la Tarea 3.
5. **Variante sin fila de inventario en esa tienda:** la venta se rechaza con un mensaje claro y nunca crea stock negativo. Prueba en la Tarea 4.

---

### Task 1: Infra de migraciones y pruebas contra Postgres

**Files:**
- Modify: `prisma/schema.prisma` (datasource: `directUrl = env("DIRECT_URL")`, `shadowDatabaseUrl = env("SHADOW_DATABASE_URL")`)
- Create: `prisma/migrations/0_init/migration.sql` (generado), `prisma/migrations/migration_lock.toml`
- Create: `vitest.db.config.ts`, `test/db/setup.ts`, `test/db/reset.ts`
- Modify: `package.json` (scripts `test:db`, `db:migrate:dev`; retirar `db:push`), `.env.example` (nombres `DIRECT_URL`, `SHADOW_DATABASE_URL`, `TEST_DATABASE_URL`), `vitest.config.ts` (excluir `**/*.db.test.ts`)

**Interfaces:**
- Produces:
  - `resetDb(): Promise<void>` en `test/db/reset.ts`: vacía todas las tablas con `TRUNCATE … CASCADE`, generado desde `Prisma.dmmf` (lectura, no migración).
  - `testPrisma: PrismaClient` en `test/db/setup.ts`.
  - Convención: los archivos `*.db.test.ts` solo corren con `npm run test:db` y se saltan si falta `TEST_DATABASE_URL`.

- [ ] **Step 1:** Crear `.env.test.local` (no se versiona) con `TEST_DATABASE_URL`, `DIRECT_URL` y `SHADOW_DATABASE_URL` apuntando a `loloshop_test`, `loloshop_dev` y `loloshop_shadow` del contenedor local. Crear la base `loloshop_test` si no existe.
- [ ] **Step 2:** Generar el baseline: `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql`.
- [ ] **Step 3:** Aplicarlo a la base local vacía: `DATABASE_URL=$DIRECT_URL npx prisma migrate deploy`. Esperado: `1 migration applied`. Luego `npx prisma migrate status` responde "Database schema is up to date".
- [ ] **Step 4:** Escribir la prueba `test/db/smoke.db.test.ts`: `resetDb()` y luego `testPrisma.location.count()` es 0.
- [ ] **Step 5:** `npm run test:db`: PASS. `npm test`: las 182 pruebas existentes siguen en verde y no ejecuta `*.db.test.ts`.
- [ ] **Step 6:** Commit `chore(db): baseline de prisma migrate y pruebas contra Postgres`.

### Task 2: Migraciones `add_brand_department` y `add_sales`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_add_brand_department/`, `prisma/migrations/<ts>_add_sales/` (generadas)
- Create: `prisma/scripts/backfill-brand-department.ts`
- Test: `prisma/scripts/__tests__/backfill.db.test.ts`

**Interfaces:**
- Produces, con los campos exactos de ER §2.2, §2.3 y §2.6:
  - modelos `Brand`, `Department`, `Sale`, `SaleLine`, `AppSetting`;
  - enums `SaleChannel` (`store | whatsapp`), `PaymentMethod` (`spay_transfer | cash | card`), `SaleStatus` (`pending_payment | paid | cancelled | refunded`);
  - `RETURN` agregado a `MovementType`;
  - `Product.brandId?`, `Product.departmentId?`, `Product.publicCode? @unique`, `Movement.saleId?`, `InventoryLevel.minStock Int?`;
  - los índices de ER §4.
- Produces: `backfillBrandDepartment(prisma): Promise<{ brands: number; products: number; departments: number }>`. Es idempotente.
- Fuera de este plan: `SaleLine.returnedQuantity` se crea con default 0, pero las devoluciones parciales no se implementan (ver Fuera de alcance).

- [ ] **Step 1:** Escribir `backfill.db.test.ts`. Con productos con brand `"Guess"`, `"GUESS "` y `"Tommy Hilfiger"`: después del backfill hay 2 `Brand` (slugs `guess` y `tommy-hilfiger`), cada producto tiene `brandId`, existen los 5 departamentos (`dama`, `caballero`, `ninos`, `calzado`, `accesorios`) con `sortOrder` 1 a 5, cada producto tiene un `publicCode` que cumple `^[0-9A-HJKMNP-TV-Z]{5}$`, y existe `AppSetting` `lowStockThreshold` con valor `2`. Correrlo dos veces no cambia los conteos.
- [ ] **Step 2:** `npm run test:db`: FAIL (el modelo no existe).
- [ ] **Step 3:** Editar el esquema y generar las dos migraciones por separado con `npx prisma migrate dev --name add_brand_department` y luego `--name add_sales`. `RETURN` va en `add_sales` y no se usa en la misma migración.
- [ ] **Step 4:** Implementar el backfill. Usa `slugify` de la Tarea 3; si esa tarea no está hecha todavía, se implementan juntas.
- [ ] **Step 5:** `npm run test:db`: PASS. `npx prisma migrate status`: up to date.
- [ ] **Step 6:** Commit `feat(db): marcas, departamentos y ventas (migraciones aditivas)`.

### Task 3: Dominio puro de la venta

**Files:**
- Create: `lib/domain/sale.ts`, `lib/domain/public-code.ts`, `lib/domain/slug.ts`
- Test: `lib/domain/__tests__/sale.test.ts`, `public-code.test.ts`, `slug.test.ts`

**Interfaces:**
- Produces:
  - `type SaleChannel = "store" | "whatsapp"`, `type PaymentMethod = "spay_transfer" | "cash" | "card"`, `type SaleStatus = "pending_payment" | "paid" | "cancelled" | "refunded"`.
  - `interface SaleLineInput { variantId: string; quantity: number; unitPrice: number }`.
  - `interface NewSaleInput { clientRequestId: string; locationId: string; channel: SaleChannel; paymentMethod: PaymentMethod; paymentReference?: string; customerAlias?: string; lines: SaleLineInput[] }`.
  - `validateNewSale(input: unknown): { ok: true; value: NewSaleInput } | { ok: false; message: string }`.
  - `initialStatus(method: PaymentMethod): SaleStatus`.
  - `saleTotal(lines: SaleLineInput[]): number` (centavos enteros internamente, devuelve pesos con 2 decimales).
  - `businessDateMx(at: Date): string` (`YYYY-MM-DD`).
  - `generatePublicCode(random?: () => number): string`.
  - `slugify(text: string): string`.

- [ ] **Step 1:** Escribir las pruebas:
  - `businessDateMx(new Date("2026-11-14T05:30:00Z"))` da `"2026-11-13"` (23:30 en México).
  - `businessDateMx(new Date("2026-11-14T06:30:00Z"))` da `"2026-11-14"`.
  - `initialStatus("spay_transfer")` da `"pending_payment"`; para `cash` y `card` da `"paid"`.
  - `saleTotal([{quantity:2,unitPrice:199.9},{quantity:1,unitPrice:0.1}])` da `399.9`.
  - `validateNewSale` rechaza:
    - una venta sin líneas;
    - `quantity` 0, -1 o 1.5;
    - `unitPrice` negativo;
    - una variante repetida en dos líneas;
    - `customerAlias` de 41 caracteres;
    - el alias `"Ana 5512345678"` (7 o más dígitos seguidos);
    - `clientRequestId` que no sea uuid;
    - `channel` o `paymentMethod` fuera de la lista.
  - `validateNewSale` acepta el alias `"chamarra azul 2"`.
  - `generatePublicCode` cumple `^[0-9A-HJKMNP-TV-Z]{5}$` en 1000 corridas.
  - `slugify("  GUESS  ")` da `"guess"`; `slugify("Niños")` da `"ninos"`; `slugify("Dolce & Gabbana")` da `"dolce-gabbana"`.
- [ ] **Step 2:** `npx vitest run lib/domain/__tests__/sale.test.ts lib/domain/__tests__/public-code.test.ts lib/domain/__tests__/slug.test.ts`: FAIL.
- [ ] **Step 3:** Implementar. Para `businessDateMx`, usar `Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" })`. Para `generatePublicCode`, usar `crypto.getRandomValues` por defecto.
- [ ] **Step 4:** Las mismas pruebas: PASS.
- [ ] **Step 5:** Commit `feat(ventas): dominio de la venta, día de negocio y código público`.

### Task 4: `SalesDataSource` con transacción concurrente

**Files:**
- Create: `lib/data/sales-source.ts` (interfaz), `lib/data/prisma-sales-source.ts`, `lib/data/fixture-sales-source.ts`, `lib/data/get-sales-source.ts`
- Modify: `lib/data/errors.ts` (agregar `InsufficientStockError`)
- Test: `lib/data/__tests__/prisma-sales.db.test.ts`, `lib/data/__tests__/fixture-sales.test.ts`

**Interfaces:**
- Consumes: `NewSaleInput`, `initialStatus`, `saleTotal` y `businessDateMx` (Tarea 3).
- Produces:
  - `class InsufficientStockError extends Error { variantId: string; available: number; requested: number }`.
  - `interface SaleRecord { id: string; number: number; status: SaleStatus; channel: SaleChannel; paymentMethod: PaymentMethod; total: number; businessDate: string; locationId: string; createdById: string; createdAt: string; lines: { variantId: string; quantity: number; unitPrice: number }[] }`.
  - `interface SalesDataSource`:
    - `createSale(input: NewSaleInput, userId: string): Promise<SaleRecord>`
    - `confirmPayment(saleId: string, userId: string, reference?: string): Promise<SaleRecord>`
    - `cancelSale(saleId: string, userId: string, reason: string, itemsReturned: boolean): Promise<SaleRecord>`
    - `getDashboard(q: DashboardQuery): Promise<DashboardData>`
    - `getLowStockThreshold(): Promise<number>`
    - `setLowStockThreshold(n: number, userId: string): Promise<void>`
  - `getSalesSource(): SalesDataSource`.
  - `DashboardQuery` y `DashboardData` se definen en la Tarea 6. En esta tarea `getDashboard` lanza `new Error("not implemented")`.

- [ ] **Step 1:** Escribir `prisma-sales.db.test.ts` con los **5 criterios de concurrencia de ER §3.1, literales**, más:
  - Una variante sin fila de `InventoryLevel` en la tienda lanza `InsufficientStockError` con `available: 0` y no crea ninguna fila.
  - `createSale` con `cash` deja `status: "paid"`, un `Movement` con `type: "SALE"`, `delta: -n` y `saleId`, y `stockCommittedAt` no nulo.
  - `confirmPayment` sobre `pending_payment` pasa a `paid`, con `paymentConfirmedById` y `paymentConfirmedAt`; sobre una venta `paid` lanza error.
  - `cancelSale(..., itemsReturned: true)` reingresa stock con `Movement RETURN +n`. Con `itemsReturned: false` no cambia `available`. En ambos casos queda `status: "cancelled"` con `cancelReason`.
  - Las copias de `SaleLine` (`productId`, `brandId`, `departmentId`, `category`) quedan iguales a las del producto al momento de vender.
- [ ] **Step 2:** `npm run test:db`: FAIL.
- [ ] **Step 3:** Implementar `PrismaSalesDataSource` siguiendo los pasos 1 a 6 de ER §3.1: ordenar por `variantId`, `updateMany` con `available: { gte: quantity }`, `count === 0` lanza `InsufficientStockError`, sin `upsert`. La idempotencia por `clientRequestId` busca antes y además captura el `P2002` de la carrera y devuelve la venta existente.
- [ ] **Step 4:** Implementar `FixtureSalesDataSource` en memoria con las mismas reglas: stock insuficiente, idempotencia y estados. `fixture-sales.test.ts` cubre esas tres.
- [ ] **Step 5:** `npm run test:db` y `npm test`: PASS. Correr la prueba de concurrencia 5 veces seguidas sin fallos intermitentes.
- [ ] **Step 6:** Commit `feat(ventas): registrar, confirmar y anular ventas sin stock negativo`.

### Task 5: Server Actions de venta con autorización por rol

**Files:**
- Create: `lib/actions/sales.ts` (`"use server"`), `lib/auth/current-user.ts`
- Test: `lib/actions/__tests__/sales.test.ts`

**Interfaces:**
- Consumes: `getSalesSource()` y `InsufficientStockError` (Tarea 4); `validateNewSale` (Tarea 3).
- Produces:
  - `getCurrentUser(): Promise<{ id: string; role: Role; locationId: string | null }>` relee al usuario en la base por el `session.user.id`. Lanza error si no hay sesión o si el usuario ya no existe.
  - `type SaleActionResult = { ok: true; sale: SaleRecord } | { ok: false; code: "INVALID" | "FORBIDDEN" | "NO_STOCK" | "NOT_FOUND"; message: string }`.
  - `createSaleAction(input: unknown): Promise<SaleActionResult>`
  - `confirmSalePaymentAction(saleId: string, reference?: string): Promise<SaleActionResult>`
  - `cancelSaleAction(saleId: string, reason: string, itemsReturned: boolean): Promise<SaleActionResult>`
  - Cada acción hace `revalidatePath("/ventas")` cuando tiene éxito.

- [ ] **Step 1:** Escribir las pruebas, con `getCurrentUser` y `getSalesSource` simulados:
  - Un collaborator con `locationId` `"A"` que vende con `locationId` `"B"` recibe `FORBIDDEN`, con el mensaje "Solo puedes vender en tu tienda."
  - Un owner que vende en B obtiene `ok`.
  - Un collaborator que confirma un pago recibe `FORBIDDEN`; un manager obtiene `ok`.
  - Un manager que anula recibe `FORBIDDEN`. Un owner que anula con `reason` vacío recibe `INVALID`.
  - Una sesión cuyo token dice owner pero la base dice collaborator recibe `FORBIDDEN` al anular.
  - Un `InsufficientStockError` se convierte en `NO_STOCK`, con el mensaje "Solo hay {available} de esta prenda en la tienda (pediste {requested})."
  - Con una entrada inválida responde `INVALID` y no llama a la fuente de datos.
- [ ] **Step 2:** `npx vitest run lib/actions/__tests__/sales.test.ts`: FAIL.
- [ ] **Step 3:** Implementar. Los errores esperados nunca se lanzan como 500: se devuelven como `ok: false`.
- [ ] **Step 4:** La misma prueba: PASS.
- [ ] **Step 5:** Commit `feat(ventas): acciones de venta con permisos por rol`.

### Task 6: Dashboard: consultas y recorte por rol

**Files:**
- Modify: `lib/data/sales-source.ts`, `lib/data/prisma-sales-source.ts`, `lib/data/fixture-sales-source.ts`
- Create: `lib/actions/dashboard.ts`, `lib/domain/dashboard-scope.ts`
- Test: `lib/domain/__tests__/dashboard-scope.test.ts`, `lib/data/__tests__/prisma-dashboard.db.test.ts`

**Interfaces:**
- Produces:
  - `interface DashboardQuery { from: string; to: string; locationIds: string[] | "all" }` (fechas `YYYY-MM-DD`, inclusivas).
  - `scopeDashboardQuery(user: { role: Role; locationId: string | null }, requested: Partial<DashboardQuery>, today: string): DashboardQuery`.
  - `interface DashboardData { soldTotal: number; collectedTotal: number; salesCount: number; byDay: { date: string; total: number; count: number }[]; byLocation: { locationId: string; total: number }[]; byChannel: { channel: SaleChannel; total: number }[]; byPaymentMethod: { method: PaymentMethod; total: number }[]; byBrand: { brandId: string | null; name: string; units: number; total: number }[]; byDepartment: { departmentId: string | null; name: string; units: number; total: number }[]; pendingPayments: { saleId: string; number: number; total: number; locationId: string; createdAt: string }[]; lowStock: { variantId: string; locationId: string; productTitle: string; size: string; available: number; threshold: number }[] }`.
  - `getDashboardAction(requested?: Partial<DashboardQuery>): Promise<{ query: DashboardQuery; data: DashboardData }>`.
  - `setLowStockThresholdAction(n: number): Promise<{ ok: boolean; message?: string }>`, solo para el owner, con un entero de 0 a 99.

- [ ] **Step 1:** Pruebas de `scopeDashboardQuery`:
  - collaborator de A que pide 2026-10-01 a 2026-11-05 y `"all"`: recibe `{ from: today, to: today, locationIds: ["A"] }`.
  - owner que no pide nada: recibe los últimos 30 días y `"all"`.
  - manager de A que pide `"all"`: recibe `["A"]`.
  - manager sin tienda: recibe `"all"`.
  - si `from > to`: se intercambian.
- [ ] **Step 2:** Prueba de base `prisma-dashboard.db.test.ts`, con ventas sembradas (2 `paid` en efectivo, 1 `pending_payment` SPAY y 1 `cancelled`):
  - `soldTotal` excluye la `cancelled` e incluye la `pending`; `collectedTotal` solo incluye las `paid`;
  - `pendingPayments` tiene 1 elemento;
  - `byBrand` suma `quantity × unitPrice`;
  - `lowStock` usa el umbral global 2, salvo que `minStock` no sea nulo: con `minStock: 0`, solo aparece cuando está agotado.
- [ ] **Step 3:** Ambas: FAIL.
- [ ] **Step 4:** Implementar las consultas de ER §4 (`groupBy` sobre `businessDate` y copias de `SaleLine`; `$queryRaw` parametrizado solo para el importe por marca y departamento).
- [ ] **Step 5:** Ambas: PASS.
- [ ] **Step 6:** Commit `feat(dashboard): ventas, cobros pendientes y stock bajo por rol`.

### Task 7: Pantalla de venta en `/pos`

**Files:**
- Modify: `app/pos/page.tsx` (reemplazar la maqueta y quitar la imagen remota de Google)
- Create: `components/sales/SaleCart.tsx`, `components/sales/PaymentPicker.tsx`, `lib/sales/use-sale-draft.ts`
- Test: `components/__tests__/SaleCart.test.tsx`, `components/__tests__/PosPage.test.tsx`

**Interfaces:**
- Consumes: `Scanner` y `ManualCodeEntry` (existentes), `lookupCodeAction` (existente), `createSaleAction` (Tarea 5), `fetchLocationsAction`.
- Produces: `useSaleDraft()`, que devuelve `{ lines, add(match: VariantMatch), setQty(variantId: string, qty: number), setPrice(variantId: string, price: number), remove(variantId: string), clientRequestId, reset() }`. El `clientRequestId` se genera con `crypto.randomUUID()` al iniciar el borrador y **no cambia en un reintento**, solo con `reset()` tras una venta exitosa.

- [ ] **Step 1:** Escribir las pruebas:
  - Escanear el mismo código dos veces deja una línea con cantidad 2.
  - El precio se prellena con `Variant.price` y es editable.
  - El total se muestra como `$399.90`.
  - Sin líneas, "Cobrar" está deshabilitado.
  - Al pulsar "Cobrar", el botón se deshabilita hasta que llega la respuesta; si `createSaleAction` responde un error de red, un segundo "Cobrar" manda el **mismo** `clientRequestId`.
  - Un `NO_STOCK` muestra el mensaje junto a la línea afectada.
  - Para owner y manager hay un selector de tienda; el collaborator no lo ve y vende en su tienda.
  - Elegir "WhatsApp" con "Transferencia SPAY" muestra el campo opcional "Alias del pedido", con la ayuda "Sin teléfono ni nombre completo".
  - Al tener éxito aparece "Venta #{number} registrada" y el carrito se vacía.
- [ ] **Step 2:** `npx vitest run components/__tests__/SaleCart.test.tsx components/__tests__/PosPage.test.tsx`: FAIL.
- [ ] **Step 3:** Implementar con la misma estructura visual del resto de la PWA (Tailwind y los tokens actuales).
- [ ] **Step 4:** Las mismas pruebas: PASS.
- [ ] **Step 5:** Commit `feat(pos): pantalla de venta con escáner, carrito y método de pago`.

### Task 8: Dashboard `/ventas`

**Files:**
- Create: `app/ventas/page.tsx`, `components/sales/DashboardCards.tsx`, `components/sales/PendingPayments.tsx`, `components/sales/LowStockTable.tsx`, `components/sales/RangePicker.tsx`
- Modify: navegación de la PWA (el enlace "Ventas" junto a los existentes) y `app/page.tsx` (el umbral fijo `1` pasa a leerse del `AppSetting`)
- Test: `components/__tests__/VentasPage.test.tsx`

**Interfaces:**
- Consumes: `getDashboardAction`, `setLowStockThresholdAction` (Tarea 6), `confirmSalePaymentAction` y `cancelSaleAction` (Tarea 5).

- [ ] **Step 1:** Escribir las pruebas:
  - El collaborator ve "Hoy" sin selector de rango.
  - El owner ve el selector con "Hoy", "7 días", "30 días" y "Personalizado".
  - Las tarjetas "Vendido", "Cobrado" y "Ventas" muestran los valores de `DashboardData`.
  - "Cobros pendientes" lista las ventas con antigüedad ("hace 3 h"). El botón "Confirmar pago" aparece para owner y manager y pide la referencia SPAY opcional.
  - "Anular" aparece solo para el owner y exige un motivo y responder "¿La prenda regresó a la tienda?" (Sí/No), sin opción por omisión.
  - La tabla de stock bajo muestra el umbral, y el owner lo puede editar.
- [ ] **Step 2:** `npx vitest run components/__tests__/VentasPage.test.tsx`: FAIL.
- [ ] **Step 3:** Implementar. Las gráficas son barras simples con CSS o SVG por día, sin librería nueva.
- [ ] **Step 4:** La misma prueba: PASS.
- [ ] **Step 5:** Commit `feat(dashboard): página de ventas con cobros pendientes y stock bajo`.

### Task 9: Alta con marca y departamento

**Files:**
- Modify: `lib/data/source.ts` (`CreateProductData` gana `brandId: string` y `departmentId: string`), `lib/data/prisma-source.ts`, `lib/data/fixture-source.ts`, `lib/domain/new-product.ts`, `lib/actions.ts` (`createProductAction`), `components/products/NewProductForm.tsx`
- Create: `lib/actions/catalog.ts` (`listBrandsAction`, `createBrandAction`, `listDepartmentsAction`, `mergeBrandsAction`)
- Test: las pruebas existentes de alta, más `lib/actions/__tests__/catalog.test.ts`

**Interfaces:**
- Produces:
  - `createBrandAction(name: string): Promise<{ ok: true; brand: { id: string; name: string; slug: string } } | { ok: false; message: string }>`: cualquier rol; reutiliza una marca existente con el mismo `slug`.
  - `mergeBrandsAction(fromId: string, intoId: string)`: solo el owner, en una transacción; aplica la regla de ER §2.3.
  - `listDepartmentsAction()`: devuelve las activas, ordenadas por `sortOrder`.
  - Al crear un producto se asigna `publicCode` con `generatePublicCode`, reintentando hasta 5 veces ante un `P2002`.

- [ ] **Step 1:** Actualizar o agregar las pruebas:
  - Un alta sin departamento da `INVALID`, con el mensaje "Elige el departamento."
  - Un collaborator que crea la marca "Psycho Bunny" obtiene `ok`; crear "psycho bunny " devuelve la misma `id`.
  - Un manager que fusiona marcas recibe `FORBIDDEN`.
  - El producto creado tiene un `publicCode` con el formato correcto.
  - El formulario muestra el combo de marca con la opción "Crear «…»" y el select de departamento obligatorio.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar. `Product.brand` (texto) se sigue llenando con el nombre canónico durante la transición (ER §2.3).
- [ ] **Step 4:** `npm test`: todo en verde, incluidas las pruebas del alta por lote.
- [ ] **Step 5:** Commit `feat(alta): marca con creación rápida, departamento obligatorio y código público`.

### Task 10: Cierre de B1 en el servidor y en el bot

**Files:**
- Create: `lib/data/public-projection.ts`
- Modify: `lib/actions.ts` (`fetchPublicProductsAction` devuelve `PublicProduct[]`), `app/api/bot/products/route.ts`, `app/api/whatsapp/webhook/route.ts` (aparta por `publicCode`, ya no por `SKU:`, y quita la promesa "te lo aparté 24 h")
- Test: `lib/data/__tests__/public-projection.test.ts`, las pruebas del webhook y del endpoint del bot

**Interfaces:**
- Produces:
  - `interface PublicProduct { id: string; publicCode: string | null; title: string; brand: string; category: string; imageUrl: string | null; sizes: { size: string; available: boolean }[]; price: number | null }`.
  - `toPublicProduct(p: Product & { publicCode: string | null }): PublicProduct`: sin `sku`, `barcode`, conteos ni `locationId`; `available` es `true` si hay `> 0` en alguna tienda de tipo `store`.

- [ ] **Step 1:** Escribir las pruebas:
  - El JSON de `toPublicProduct` no contiene las claves `sku`, `barcode`, `inventory` ni `locationId`, ni ningún número de stock.
  - El endpoint del bot responde con la misma proyección.
  - Un mensaje del webhook con "Código K7Q2M talla M" encuentra el producto. El código malformado `K7Q2` no consulta la base.
  - La respuesta del bot ya no dice "aparté".
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar. **Antes de cambiar el tipo de retorno**, revisar cómo `app/catalogo/*` consume `fetchPublicProductsAction`. Si hace falta modificar esa carpeta, **detener la tarea y pedir permiso al dueño**, porque es zona de Antigravity. La alternativa sin tocarla es exportar una acción nueva `fetchPublicCatalogAction` y dejar la vieja marcada `@deprecated` hasta que Antigravity la migre; esa opción solo cierra B1 cuando la vieja se elimine.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `fix(seguridad): catálogo público y bot sin SKU ni stock exacto (B1)`.

### Task 11: Revisión de la rama completa

- [ ] **Step 1:** `npm test`, `npm run test:db`, `npx tsc --noEmit`, `npm run lint` y `npm run build`: todos en verde.
- [ ] **Step 2:** Prueba manual en local con `npm run dev` contra `loloshop_dev` sembrada. Abrir dos navegadores (owner en la tienda B y collaborator en la tienda A) y vender la última pieza de la misma variante desde los dos al mismo tiempo: una venta se registra y la otra muestra "Solo hay 0…".
- [ ] **Step 3:** Revisión de seguridad: `/security-review` sobre el diff de la rama.
- [ ] **Step 4:** Reportar al dueño. **No hacer push sin su aprobación.**

### Task 12: Runbook de salida a producción (lo ejecuta el dueño, con acompañamiento)

**Files:**
- Create: `docs/runbooks/2026-11-salida-ventas.md`

Pasos, tomados de ER §5.1 y ajustados a esta rama:
1. Respaldo con `pg_dump` y prueba de restauración.
2. Rama de Neon.
3. `DIRECT_URL` y `SHADOW_DATABASE_URL` en el `.env` local del dueño.
4. `migrate diff --exit-code` contra la rama para detectar drift.
5. `migrate resolve --applied 0_init` en la rama, luego `migrate deploy` y el backfill.
6. Preview de Vercel contra la rama.
7. Visto bueno del dueño, y repetir los pasos 5 y 6 en producción **en horario sin ventas**.
8. Plan de retroceso: restaurar el respaldo y volver al deploy anterior.

- [ ] **Step 1:** Escribir el runbook con los comandos exactos, la salida esperada de cada uno y el criterio para continuar.
- [ ] **Step 2:** Commit `docs: runbook de salida a producción de ventas`.

---

## Fuera de alcance de este plan

- **Devoluciones parciales** (`returnedQuantity`): la columna existe, pero sin acción ni UI. Antes del Buen Fin, una venta equivocada la anula el owner. La política de devoluciones sigue abierta (SRS D-VEN-3).
- **Imágenes del §14** (posproceso, `ProductImageJob`): plan aparte.
- **Sitio público P3:** plan aparte, después del Buen Fin.
- **Recorrido:** plan aparte.
- **Retirar `Product.brand`** (texto): migración no aditiva, plan aparte.

---

## Ampliación 2026-11-09 (petición del dueño y residuo de la revisión final)

**Decisión del dueño [D] 2026-11-09:** el alta tiene dos modos.
- **Solo stock:** el artículo se registra sin foto, con su etiqueta (código), descripción, talla y precio. Entra al inventario y se puede vender, pero **no aparece en el catálogo público**.
- **Para catálogo:** además lleva **dos fotos obligatorias, frente y atrás**. Solo los artículos con las dos fotos se muestran en el catálogo público.

Esto resuelve D-10 del spec maestro: frente y espalda, ahora obligatorias para el catálogo.

### Task 13: Alta en dos modos (solo stock / para catálogo)

**Files:**
- Modify: `prisma/schema.prisma` (agregar `Product.description String?` y `Product.backImageUrl String?`) y una migración nueva `add_product_description_back_image`, generada según la Ruling R6.
- Modify: `lib/domain/new-product.ts`, `lib/data/source.ts` (`CreateProductData` gana `description?: string | null` y `backImageUrl?: string | null`), `lib/data/prisma-source.ts`, `lib/data/fixture-source.ts`, `lib/actions.ts` (`createProductAction`, y una acción para fijar la foto trasera), `components/products/NewProductForm.tsx`, `components/products/ProductPhotoButton.tsx` (o un componente hermano para la foto trasera), `lib/data/public-projection.ts`.
- Test: las pruebas de alta existentes, más las nuevas pruebas de proyección y de formulario.

**Interfaces:**
- `type EntryMode = "stock" | "catalog"`.
- `validateNewProduct` acepta `mode` y `description`:
  - `description` es opcional, con un máximo de 500 caracteres, se recorta y se guarda como texto plano.
  - En modo `catalog`, el servidor exige `imageUrl` y `backImageUrl`, las dos validadas con `isProductBlobUrl`. Si falta alguna responde con el mensaje "Para el catálogo se necesitan las dos fotos: frente y atrás."
  - En modo `stock`, las dos fotos son opcionales y se ignoran.
- `setProductBackImageAction(productId: string, url: string)`: la misma autorización y validación que la acción actual de la foto frontal, con `revalidatePath` de `/productos` y `/catalogo`.
- `PublicProduct` gana `backImageUrl: string | null`. `getPublicCatalog` solo devuelve productos activos que tengan `imageUrl` **y** `backImageUrl`.

- [ ] **Step 1: escribir las pruebas que fallan.**
  - Modo `catalog` sin foto trasera → INVALID, con el mensaje exacto.
  - Modo `stock` sin fotos → ok, y el producto no aparece en `getPublicCatalog`.
  - Un producto con las dos fotos sí aparece, con `backImageUrl`.
  - Una descripción de 501 caracteres → INVALID.
  - En el formulario:
    - hay un selector "Solo stock" / "Para catálogo";
    - en "Para catálogo" aparecen dos capturas, "Foto de frente" y "Foto de atrás", y el botón de alta se deshabilita hasta tener las dos;
    - en "Solo stock" no hay capturas y el texto dice "Se registra en inventario; no aparece en el catálogo hasta agregar las dos fotos.";
    - el campo "Descripción" está en los dos modos.
  - En `/productos`, un producto de solo stock muestra "Agregar foto de frente" y "Agregar foto de atrás".
- [ ] **Step 2:** correr las pruebas y ver que FALLAN.
- [ ] **Step 3: implementar.**
  - Las dos fotos usan el mismo procesamiento y la misma subida de hoy (`ProductPhotoCapture`, `uploadProductImageAction`).
  - El alta por lote recuerda el modo elegido entre un artículo y otro.
- [ ] **Step 4:** correr `npm test`, `npm run test:db` y `npx tsc --noEmit`, y que todo PASE.
- [ ] **Step 5:** commit `feat(alta): modo solo stock y modo catálogo con fotos de frente y atrás`.

### Task 14: Residuo de la revisión final

- Modify: `app/pos/page.tsx`, `lib/sales/use-sale-draft.ts`, `lib/sales/actions.ts`, `lib/sales/dashboard-actions.ts`, `lib/catalog/actions.ts`.

1. **Bandera "incierto" en el id de la venta.**
   - Se activa después de un error de red o de una respuesta `UNAVAILABLE`, y solo se limpia en `renewRequestId`.
   - Mientras está activa, `markRejected` y `requestIdFor` nunca renuevan el id: decide la comparación del servidor.
   - Prueba en `/pos`: error de red, luego INVALID antes del lookup, luego editar el carrito y reenviar → se manda **el mismo** id.
2. **`UNAVAILABLE` con el verbo correcto según la acción.**
   - Cobrar: "Intenta cobrar de nuevo."
   - Confirmar el pago: "Intenta confirmar de nuevo."
   - Anular: "Intenta anular de nuevo."
3. **Sesión vencida en las acciones del dashboard y del catálogo.** Esas acciones atrapan `UnauthenticatedError` y responden con su forma de error, sin lanzar una excepción. `getDashboardAction` responde `{ error: "session_expired" }` y `/ventas` muestra el enlace "Iniciar sesión".
   - Además, en `/pos` y `/ventas`: si la acción devuelve `undefined` (cuando el middleware redirige), mostrar "Tu sesión terminó. Vuelve a iniciar sesión." con el enlace, en lugar del mensaje de conexión.
- Commit `fix(ventas): id incierto tras error de red, mensajes por acción y sesión vencida`.

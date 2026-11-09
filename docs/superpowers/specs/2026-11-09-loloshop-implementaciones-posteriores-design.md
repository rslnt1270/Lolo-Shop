# LoloShop: implementaciones posteriores a ventas P1 (versión 2)

**Fecha:** 2026-11-09 · **Versión:** 2, re-priorizada con las decisiones del dueño del 2026-11-09 y la auditoría consolidada · **Estado:** diseño para planificar; las propuestas de §5 se construyen sin esperar respuesta
**Base:** SRS (`2026-11-05-loloshop-srs.md`), modelo de datos (`2026-11-05-modelo-datos-er.md`, **fuente de verdad**), auditoría (`2026-11-09-auditoria-consolidada.md`, hallazgos H1–H25), UX del sitio público (`2026-11-05-sitio-publico-ux-design.md`), guía de salida (`docs/runbooks/2026-11-salida-ventas.md`). La versión 1 está en git (`ca22425`); sus tareas se conservan en §4 con su número anterior entre paréntesis.

Qué sigue después del módulo de ventas, en qué orden y cómo se acepta. Cada tarea trae comportamiento, contrato, criterios de aceptación, riesgos y dependencias. (T) = prueba automática; (M) = verificación manual; [C] = dato de proveedor sin verificar; "h" = horas de agente.

---

## 1. Estado al 2026-11-09

### 1.1 Código

Rama **`feat/demo-alta-lote`** (worktree `../LoloShop-alta`). `main` (producción) todavía no la tiene.

| Área | Estado | Dónde |
|---|---|---|
| Alta por lote con escaneo; dos modos (solo stock / catálogo con frente y atrás) | Hecho, pero **una talla = un producto** (H9) | `app/escanear`, `lib/domain/new-product.ts`, `lib/actions.ts` |
| Marcas, departamentos, código público de 5 caracteres | Hecho | `lib/catalog/`, `lib/domain/public-code.ts` |
| Venta en `/pos`, dashboard `/ventas`, anulación solo owner | Hecho y sólido (descuento condicional, idempotencia) | `lib/sales/*`, `lib/data/prisma-sales-source.ts` |
| Ajuste de stock de `/escanear` ("Entrada"/"Salida") | **Inseguro** (H3): `delta` libre, puede dejar negativo, todo queda `ADJUSTMENT`, "Salida" es una venta invisible | `lib/actions.ts` `adjustInventoryAction`, `lib/data/prisma-source.ts` |
| Permisos de `lib/actions.ts` | **Rol y tienda del JWT** (30 días) y manager con tienda sin acotar (H4) | `requireSession` en `lib/actions.ts` |
| Edición de precio, título, departamento; desactivar | No existe (H10) | — |
| Traspasos e historial de movimientos | No existe (H22) | — |
| Catálogo público | `PublicProduct` sin SKU ni conteos; **con datos inventados** (número falso, repisas y textos de ejemplo, "apartar") y sin mínimos de accesibilidad (H6, H7) | `lib/data/public-projection.ts`, `components/virtual-store/` |
| Pruebas | 446 unitarias + 47 contra Postgres (cifras de la rama, no re-ejecutadas); CI no corre `test:db` ni lint (H16) | `npm test`, `npm run test:db` |

### 1.2 Base de datos de producción (Neon, `us-east-2`)

- Respaldo verificado del 2026-11-09 (rama `respaldo-2026-11-09` y volcado local fuera del repo). Ensayo de migraciones en `ventas-prueba` sin drift.
- **Tiendas aplicadas** (2026-11-09, producción y `ventas-prueba`, transacción SQL de datos): `LoloShop_Lomas` (antes "Tienda Principal", mismo id) y `LoloShop_ClubAlva` (nueva); `colab1` → Lomas, `colab2` → ClubAlva. 4 usuarios con contraseña propia.
- Producción **no** tiene las tablas de ventas: la salida (fases E–G) ocurre cuando el dueño apruebe la demo (§4.4).

### 1.3 Decisiones del dueño del 2026-11-09 (vinculantes)

1. **Las tallas son variantes del mismo producto**, cada una con su código, SKU, precio y stock.
2. **El precio se edita** después del alta (owner y manager; el colaborador nunca), por talla y con historial; también desactivar, editar título/marca/departamento y asignar departamento en lote.
3. **Vercel sigue en Hobby** hasta un estado sólido: pruebas → demo al dueño → más pruebas. La salida a producción se hace al aprobar la demo, no por el Buen Fin.
4. **El Buen Fin es tentativo. Meta: todo el stock registrado en noviembre**, demo estable y LoloShop controlando el inventario de las dos tiendas. Prioridad: (1) registro de stock y control de inventario, (2) catálogo, (3) portal web (recorrido 3D, SEO, panorámicas, derivados) como complemento posterior.
5. Sin delegación a Antigravity; Claude hace todo. El número de WhatsApp solo en variable de entorno; migrar a WhatsApp Business después.

---

## 2. Reglas vigentes

Cambiarlas requiere decisión explícita del dueño.

1. **Roles.** Owner: todo, histórico, anula ventas, fusiona marcas, une productos. Manager: ve todo; edita precios y productos; si tiene tienda asignada, vende, ajusta, da de alta y confirma pagos **solo en esa tienda**. Colaborador: solo su tienda, solo el día, da de alta y registra entradas, crea marcas; **no** cambia precios ni registra salidas.
2. **Privacidad.** No se guardan contactos de clientes; solo un alias opcional sin teléfonos. Los motivos de ajuste y de precio rechazan secuencias de 7 o más dígitos.
3. **Público vs interno.** Todo lo que ve un cliente usa **solo** `PublicProduct`: sin SKU, código de barras ni conteos; disponibilidad **sí/no por talla**; solo tiendas. Público solo con foto de frente y de atrás.
4. **Nada inventado ante el cliente.** Ni productos, precios, existencias o ubicaciones de ejemplo, ni promesas ("apartado", "envío").
5. **El cliente pide con el código público** por WhatsApp.
6. **Móvil primero.** Objetivos de 44 px o más, 375 px, `prefers-reduced-motion`, español de México.
7. **Seguridad.** Repo público: ningún secreto, cadena de conexión ni número de teléfono real en commits, documentos, pruebas ni capturas.
8. **Migraciones** solo con `prisma migrate`, aditivas, probadas en una rama de Neon y con el cambio de contrato (`InventoryDataSource`, Prisma, Fixture y pruebas) en el mismo PR. El ER se actualiza en el mismo PR.
9. **Congelamientos.** Si el Buen Fin se confirma, no hay salidas a producción esos días; diciembre (12-01 a 01-06) igual. Se congela la salida, no el desarrollo.
10. **El stock nunca queda negativo, tampoco por ajustes, mermas o traspasos.** Toda salida es un `UPDATE … WHERE available >= n`; sin fila de inventario no hay salida. Todo cambio de stock escribe un `Movement` con tipo explícito y usuario. **Las ventas solo se registran en `/pos`.**
11. **Rol y tienda se releen de la base en cada acción** (`getCurrentUser()`), nunca del JWT. El JWT solo decide qué botones se muestran.

---

## 3. Trabajo con Antigravity y contratos

> Decisión del dueño (2026-11-09): **no se delega a Antigravity.** Claude hace todo, incluida la zona visual. Si Antigravity vuelve, recupera su zona (`components/virtual-store/`, `lib/virtual-store/`, aspecto de `/catalogo`) con las reglas de v1 §3 (git `ca22425`): rama `feat/3d-<tema>`, sin tocar la zona de datos, contrato `PublicProduct` definido por Claude, revisión de Claude antes de integrar.

### 3.1 Contrato público (la fuente es el código)

```ts
// lib/data/public-projection.ts — versión objetivo de v2
export interface PublicProduct {
  id: string;
  publicCode: string | null;
  title: string;
  brand: string;
  category: string;
  department: { slug: string; name: string; sortOrder: number } | null; // 2.3 (nuevo)
  imageUrl: string | null;      // frente
  backImageUrl: string | null;  // atrás
  sizes: { size: string; available: boolean; price: number }[];       // 2.2: ordenadas; price nuevo
  price: number | null;         // MXN, el menor de las tallas activas
}
```

Hoy no existen `department` ni `sizes[].price`. Ningún componente público importa `Product` de `lib/domain/types`.

### 3.2 Flujo de Git y "terminado"

- Una rama por tarea `feat/<tema>` desde `feat/demo-alta-lote` (hasta que llegue a `main`). Sin commits en `main`, sin `push` ni `--force` sin visto bueno del dueño. Conventional Commits. Nunca `.env*`, volcados ni capturas con datos.
- Terminado = evidencia pegada de `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run test:db` (si toca `lib/data`, `lib/sales` o `prisma/`) y `npm run lint` (desde 1.12). Pruebas nuevas para el comportamiento nuevo; en UI pública, una prueba de que no aparecen SKU, código de barras ni conteos.

---

## 4. Backlog por fases

Orden = prioridad del dueño. "Demo" = necesaria para la demo al dueño. Entre paréntesis, el número de v1.

| # | Tarea | Hallazgo | h | Demo |
|---|---|---|---|---|
| **Fase 1** | **Registro de stock y control de inventario** | | | |
| 1.1 | Migración aditiva `inventory_controls` | H3, H9, H10 | 2 | Sí |
| 1.2 | Movimientos de stock tipados y seguros; sin "Salida" | H3 | 5 | Sí |
| 1.3 | Rol y tienda de la base en todas las acciones | H4 | 4 | Sí |
| 1.4 | Guarda del seed | H5 | 1 | Sí |
| 1.5 | Alta con varias tallas y "agregar talla" | H9 | 8 | Sí |
| 1.6 | Unir productos duplicados por talla | H9 | 6 | Sí |
| 1.7 | Editar precio y producto, desactivar, departamento en lote | H10 | 7 | Sí |
| 1.8 | Traspasos entre tiendas | H22 | 4 | Sí |
| 1.9 | Historial de movimientos | H22 | 4 | Sí |
| 1.10 | Pantallas de staff con sesión vencida y login (parte de v1 1.9) | H8 | 3 | Sí |
| 1.11 | Pooler de Neon | H12 | 1.5 | Sí |
| 1.12 | CI con `test:db`, ESLint y Node (v1 1.12) | H16, H23 | 3 | Sí |
| 1.13 | Conteo físico (condicional) | RF-INV-10 | 6 | No |
| **Fase 2** | **Catálogo** | | | |
| 2.1 | Catálogo sin datos inventados; WhatsApp por variable (v1 0.4, 0.8) | H6 | 3 | Sí |
| 2.2 | Una tarjeta por producto con tallas | Decisión 1 | 4 | Sí |
| 2.3 | Filtro por departamento y "Ver más" (v1 1.1) | — | 3 | Sí |
| 2.4 | Mínimo móvil y accesibilidad | H7 | 4 | Sí |
| **Hito** | **Demo al dueño** (§4.3; incluye v1 0.2) | | 3 | — |
| **Fase 3** | **Prerrequisitos de salida** | | | |
| 3.1 | Webhook endurecido (v1 0.7, 1.6) | H2 | 3 | No |
| 3.2 | Plan de contingencia | H14 | 1 | No |
| 3.3 | Reglas de caché de la PWA y recarga | H18 | 3 | No |
| 3.4 | Variables y Fase G ampliada | H19 | 1.5 | No |
| 3.5 | Evaluación de parches de seguridad (parte de v1 1.10) | H13 | 3 | No |
| 3.6 | Endurecimiento menor de subida y login | — | 1.5 | No |
| 3.7 | Salida a producción y carga de mercancía (v1 0.3, 0.5, 0.6) | H1, H15 | 3 | — |
| **Fase 4** | **Portal y complemento** (enero salvo indicación) | | | |
| 4.1–4.8 | Puntos del recorrido, giro, panorámicas, derivados, blobs huérfanos, SEO y privacidad, WhatsApp Business, tokens (v1 1.2–1.5, 1.11, 1.13) | H17, H20, H21, H25 | ≈ 35 | No |
| **§4.6** | **Después de la demo: operación** (v1 1.7, 1.8, resto de 1.9, PR #17) | | ≈ 20 | No |

Antes de la demo (Fases 1 y 2 sin 1.13, más el hito): ≈ 66 h. Con la Fase 3: ≈ 82 h.

### 4.1 Fase 1: registro de stock y control de inventario

**1.1 Migración aditiva `inventory_controls`.**
- *Comportamiento:* ninguno visible; habilita 1.2, 1.5–1.8.
- *Contrato (Prisma):*
  ```prisma
  model PriceChange {
    id          String   @id @default(uuid())
    variantId   String
    variant     Variant  @relation(fields: [variantId], references: [id], onDelete: Restrict)
    oldPrice    Decimal  @db.Decimal(10, 2)
    newPrice    Decimal  @db.Decimal(10, 2)
    changedById String
    changedBy   User     @relation(fields: [changedById], references: [id], onDelete: Restrict)
    reason      String?  @db.VarChar(120)
    createdAt   DateTime @default(now())
    @@index([variantId, createdAt(sort: Desc)])
  }
  // Movement: requestId String? @unique   (idempotencia de ajustes, traspasos y conteos; null en ventas y datos viejos)
  // Product:  mergedIntoId String? (FK a Product, Restrict, indexado), mergedAt DateTime?, mergedById String? (FK a User, Restrict)
  ```
  Se agrega al ER como §2.8 "Control de inventario" en el mismo PR. Va a producción junto con las migraciones de ventas en la salida (3.7), no antes.
- *Acepta:* (T) el SQL generado solo contiene `CREATE TABLE`, `ADD COLUMN` nulables, índices y FK sobre columnas nuevas (prueba sobre el texto: sin `DROP`, sin `ALTER COLUMN`, sin `SET NOT NULL`). (M) en `ventas-prueba`: `migrate deploy` aplica y `migrate status` dice "up to date"; `migrate diff --exit-code` sin drift.
- *Riesgos / no hacer:* no meter `CHECK` a mano (choca con la regla 8; la protección queda en la capa de datos y en pruebas). No reutilizar `Movement` para precios: rompería el significado del libro de stock.
- *Depende:* nada.

**1.2 Movimientos de stock tipados y seguros (H3).**
- *Comportamiento:* en `/escanear`, con un producto existente, el botón principal es **"Entrada"** (todos, en su tienda). Owner y manager ven además **"Merma o corrección"**: tipo (Merma, que solo resta; Corrección, que suma o resta), cantidad y motivo obligatorio. **No existe "Salida".** Debajo: "¿Vendiste la prenda? Regístrala en Vender." con enlace a `/pos`. Si no alcanza: "Solo hay N en esta tienda." Un doble toque o un reintento de red no duplica.
- *Contrato:*
  - `recordStockMovementAction(input: { variantId; locationId; kind: "restock" | "damage" | "adjustment"; quantity: number; direction?: "in" | "out"; reason?: string; requestId: string }): Promise<StockMovementResult>`.
  - `StockMovementResult = { ok: true; available: number; replayed: boolean } | { ok: false; code: "SESSION" | "FORBIDDEN" | "INVALID" | "INSUFFICIENT" | "NOT_FOUND" | "ERROR"; message: string; available?: number }`.
  - Reglas: `quantity` entero 1–200; `reason` obligatorio en `damage` y `adjustment` (3–120 caracteres, sin 7+ dígitos); `damage` y `adjustment` solo owner o manager; `restock` cualquiera en su tienda (regla de 1.3).
  - `InventoryDataSource.recordStockMovement(data): Promise<{ available: number; replayed: boolean }>` **reemplaza** `adjustInventory` (Prisma y Fixture en el mismo PR; el Fixture deja de enmascarar con `Math.max`). En una transacción: si `requestId` ya existe, devuelve `replayed: true`; entrada = `upsert` con `increment`; salida = `updateMany({ where: { variantId, locationId, available: { gte: n } } })` y `count === 0` → `InsufficientStockError`; `Movement` con `type` `RESTOCK`/`DAMAGE`/`ADJUSTMENT`, `delta`, `notes`, `requestId` y `userId` obligatorio. P2002 sobre `requestId` → `replayed: true`.
- *Acepta (`test:db`):* (T) stock 1, merma de 2 → INSUFFICIENT, stock 1, sin `Movement`. (T) dos mermas de 1 en paralelo sobre stock 1 → una sola pasa. (T) merma sobre una variante sin fila de inventario → INSUFFICIENT y no se crea fila. (T) mismo `requestId` dos veces en paralelo → un `Movement`, la segunda `replayed: true`. (T) cada tipo queda con su `MovementType` y la nota. (T) al final, `available` = inicial + Σ `delta`. *Acción:* (T) colaborador con `damage` o `adjustment` → FORBIDDEN; `restock` en otra tienda → FORBIDDEN; cantidad 0, 201, 1.5 o 2^31 → INVALID; motivo con un teléfono → INVALID. *UI:* (T) `/escanear` no tiene ningún botón "Salida"; "Entrada" es el primero.
- *Riesgos / no hacer:* mientras no salga, instrucción operativa del dueño al personal: "toda venta por `/pos`, no uses Salida". Buscar todos los llamadores de `adjustInventory` antes de quitarlo.
- *Depende:* 1.1, 1.3.

**1.3 Rol y tienda de la base en todas las acciones (H4).**
- *Comportamiento:* un usuario degradado o cambiado de tienda pierde el permiso al instante; uno borrado no opera. El encargado de Lomas no da de alta ni mueve stock en ClubAlva.
- *Contrato:* `lib/auth/permissions.ts` con `isStoreBound(user)` (colaborador, o manager con tienda), `assertCanOperate(user, locationId)` y `requireRole(user, roles)`, que lanzan `ForbiddenError`. Todo `lib/actions.ts` usa `getCurrentUser()`; `requireSession` desaparece. Alcance: `createLocationAction` (owner), alta, entradas y salidas, búsquedas, `changePasswordAction`, fotos: el producto existe y está activo; **reemplazar** una foto existente solo lo hacen owner y manager; agregar la primera, cualquiera. `fetchProductsAction` y `fetchLocationsAction` devuelven `null` con sesión vencida. Variable nueva `BLOB_PUBLIC_HOST` (solo el nombre en `.env.example`): si existe, `isProductBlobUrl` exige ese host exacto. `session.maxAge` de 12 h (jornada en tablet compartida).
- *Acepta:* (T) por cada acción de `lib/actions.ts`: JWT de owner con colaborador en la base → FORBIDDEN donde aplique; usuario borrado → sesión vencida; manager con tienda Lomas operando en ClubAlva → FORBIDDEN. (T) `lib/actions.ts` no contiene `getServerSession` ni `session.user.role`. (T) foto sobre un `productId` inexistente → NOT_FOUND, no 500; con `BLOB_PUBLIC_HOST` definido, una URL de otro store → INVALID.
- *Riesgos / no hacer:* no reescribir `lib/sales` ni `lib/catalog` (ya releen la base). Una sesión de 12 h obliga a entrar cada jornada: avisar al personal.
- *Depende:* nada.

**1.4 Guarda del seed (H5).**
- *Comportamiento:* `npm run db:seed` contra una base que no es local aborta antes de escribir.
- *Contrato:* `prisma/seed.ts` reutiliza la lógica de hosts de `test/db/guard.ts`: aborta con `NODE_ENV=production` o con un host no local; exige `SEED_PASSWORD_*` sin valores por omisión; usuarios con `update: {}`; el producto demo solo con `--demo`.
- *Acepta:* (T) host de Neon → error y el cliente Prisma simulado no recibe ninguna escritura; `localhost` → sigue; faltan contraseñas → error antes de escribir.
- *Depende:* nada.

**1.5 Alta con varias tallas y "agregar talla" (H9, decisión 1).**
- *Comportamiento:*
  - *Código nuevo:* antes del formulario, la pregunta **"¿Es otra talla de un producto ya registrado?"** con búsqueda por título, marca o código público (resultados con foto de frente y tallas existentes). Si elige uno, un mini formulario (talla, precio, piezas) agrega la talla con el código escaneado. Si es nuevo, el formulario de siempre gana la sección **Tallas**: una fila por talla (talla, código escaneado o "sin código", precio, piezas); "Agregar otra talla" reabre el escáner y copia el precio de la fila anterior. Las fotos son del producto, no de la talla. Guardar crea un producto con todas sus tallas.
  - *Código existente:* la tarjeta del producto muestra sus tallas con las piezas de **tu** tienda, "Entrada" y "Agregar talla". Si el código es de otra tienda, ofrece "Sumar piezas en tu tienda" (crea la fila de inventario en la tuya).
- *Contrato:*
  - Dominio: `CreateProductInput.sizes: { size: string; barcode: string | null; price: number; initialStock: number }[]` (1 a 12); talla normalizada (recortada, letras en mayúsculas); sin códigos repetidos ni tallas repetidas sin código dentro del mismo envío.
  - `CreateProductData.variants: { sku; barcode; size; price; initialStock }[]` sustituye los campos sueltos. `createProduct` crea producto, N variantes (`Variant.title` = talla), N filas de inventario en `locationId` y un `RESTOCK` por talla con piezas, todo atómico. P2002 en `barcode` → `DUPLICATE` indicando el código.
  - `addVariantAction({ productId; size; barcode: string | null; price; initialStock; locationId }): Promise<CreateProductResult>` y `InventoryDataSource.addVariant(data): Promise<VariantMatch>`. Producto activo y sin `mergedIntoId`. Si ya hay una variante activa de esa talla: sin código → INVALID "Esa talla ya existe: suma piezas con Entrada"; con código distinto → se permite (otra etiqueta de la misma talla) y la UI lo avisa.
  - `searchProductsAction(query): Promise<ProductSearchHit[] | null>` con `{ productId; title; brand; publicCode; imageUrl; sizes: string[] }`: código público exacto (normalizado) o título/marca que contiene; activos y no unidos; máximo 8. Solo staff.
  - Códigos de barras normalizados a mayúsculas al escribir y al buscar (cierra el Bajo B6 del backend).
- *Acepta:* (T, `test:db`) alta con 3 tallas → 1 `Product`, 3 `Variant`, 3 filas de inventario en la tienda, `RESTOCK` solo de las tallas con piezas, 1 `publicCode`. (T, `test:db`) una de las 3 con código ya registrado → no se crea nada y el resultado dice cuál. (T, `test:db`) dos altas en paralelo con el mismo código → una crea, la otra DUPLICATE (cierra Pruebas A3). (T) agregar L a un producto con M → 2 variantes y `PublicProduct.sizes` con 2. (T) misma talla sin código → INVALID. (T) colaborador en otra tienda → FORBIDDEN; producto inactivo o unido → INVALID; 13 tallas → INVALID. (T) "Agregar otra talla" copia el precio. (M) en un celular, un producto con 4 tallas y 2 fotos en menos de 3 minutos.
- *Riesgos / no hacer:* el colaborador fija el precio de una talla **nueva** (igual que en el alta); lo que no puede es cambiarlo después. Colores siguen como productos aparte (fuera de alcance).
- *Depende:* 1.3.

**1.6 Unir productos duplicados por talla (H9).**
- *Comportamiento:* el owner abre `/productos/unir` y ve grupos de posibles duplicados ("Polo Nautica" en M, L y XL como 3 productos), con foto, talla, piezas por tienda y ventas. Elige el producto que se queda (por omisión el que tiene las dos fotos y, si empatan, el más antiguo) y confirma. Resultado: un producto con todas las tallas; el historial de ventas y movimientos sigue igual. El código público de un producto unido sigue funcionando por WhatsApp: el bot contesta con el producto que se quedó.
- *Contrato:*
  - Puro: `findSizeDuplicateGroups(products): DuplicateGroup[]` en `lib/domain/size-duplicates.ts`. Clave: `brandId` + título normalizado (minúsculas, sin acentos, espacios colapsados, sin la talla al final: " - M", " talla M") + `departmentId`.
  - `mergeProductsAction({ targetId; sourceIds: string[] }): Promise<MergeResult>`, solo owner releído de la base. `InventoryDataSource.mergeProducts(targetId, sourceIds, userId): Promise<{ movedVariants; movedSaleLines; alreadyMerged }>`.
  - Transacción: bloquea todas las filas de `Product` en orden de `id` (`SELECT … FOR UPDATE` parametrizado); destino activo y sin `mergedIntoId`; misma `brandId` para todos; un origen ya unido a este destino cuenta como `alreadyMerged` (idempotente); unido a otro → INVALID. Mueve `Variant.productId` y la copia `SaleLine.productId` al destino (como la fusión de marcas); `SaleLine.departmentId` **no** cambia (es histórica). Si al destino le falta una foto y un origen tiene las dos, se copian sus URL. Orígenes: `isActive = false`, `mergedIntoId`, `mergedAt`, `mergedById`. Los productos que apuntaban a un origen pasan a apuntar al destino (sin cadenas).
- *Acepta (`test:db`):* (T) A (M, con 1 venta) + B (L, con 2 movimientos) en A → A con 2 variantes; B inactivo con `mergedIntoId = A`; las `SaleLine` de B tienen `productId = A`; mismo número de `Movement`; Σ `available` por tienda igual; vendido de hoy y por marca iguales antes y después. (T) repetir la unión → `alreadyMerged: 1`, sin cambios. (T) A←B y B←C en paralelo → ninguna cadena (ningún `mergedIntoId` apunta a un producto unido) y ninguna se queda colgada. (T) marcas distintas → INVALID. (T) manager, colaborador o JWT de owner degradado → FORBIDDEN. (T) el webhook, con el código de B, responde como A. (T) puro: "Polo Nautica M" y "Polo Nautica L" forman grupo; distinto departamento, no.
- *Riesgos / no hacer:* no hay "separar" automático: la confirmación lista lo que se mueve. Se ensaya primero en `ventas-prueba` (copia de producción) durante la demo. No unir entre marcas: primero se corrige la marca con 1.7. Un carrito abierto en `/pos` no se afecta (las variantes conservan su id).
- *Depende:* 1.1, 1.3, 1.5.

**1.7 Editar precio y producto, desactivar, departamento en lote (H10, decisión 2).**
- *Comportamiento:* en `/productos`, owner y manager abren la ficha interna: precio por talla con "Guardar precio" y motivo opcional, y las últimas 5 entradas del historial ("$899 → $799 · Lolo · 10 nov 18:20"); editar título, marca, departamento y categoría; "Desactivar producto" o "Desactivar talla" con confirmación (deja de verse en el catálogo y no se vende; el historial queda; se puede reactivar). Selección múltiple → "Asignar departamento". El colaborador no ve los controles y el servidor lo rechaza.
- *Contrato:*
  - `updateVariantPriceAction({ variantId; newPrice; expectedPrice; reason? })` → `{ ok: true; price } | { ok: false; code: "SESSION" | "FORBIDDEN" | "INVALID" | "CONFLICT" | "NOT_FOUND"; message; currentPrice? }`. Transacción: `variant.updateMany({ where: { id, price: expectedPrice }, data: { price: newPrice } })`; `count === 0` → CONFLICT con el precio vigente; luego `PriceChange`. Precio > 0, ≤ `MAX_PRICE`, máximo 2 decimales; igual al vigente → INVALID.
  - `updateProductAction({ productId; title?; brandId?; departmentId?; category? })`, `setProductActiveAction(productId, active)`, `setVariantActiveAction(variantId, active)`, `assignDepartmentAction(productIds, departmentId)` (1–100), con sus métodos en `InventoryDataSource`. Owner o manager releídos de la base. Marca o departamento inactivos → INVALID. Editar el título no cambia `publicCode`.
  - `/pos`: con un colaborador, `createSaleAction` pasa de `INVALID` a `PRICE_CHANGED` con `{ lines: { variantId; price }[] }`. El carrito actualiza los precios, muestra "El precio de {prenda} cambió a $X. Revisa el total y cobra de nuevo." y pide otro toque (con otro `clientRequestId`, porque el carrito cambió).
- *Acepta:* (T, `test:db`) dos ediciones en paralelo con el mismo `expectedPrice` → una pasa, la otra CONFLICT; queda un `PriceChange` con viejo, nuevo y usuario. (T) colaborador o JWT de owner degradado → FORBIDDEN; `10.005` → INVALID. (T) carrito de colaborador con el precio viejo → PRICE_CHANGED con el nuevo; tras actualizar, la venta pasa al precio nuevo. (T) producto desactivado: fuera de `getPublicCatalog`, `createSale` con su variante → INVALID, sus ventas siguen en el dashboard. (T) departamento en lote: 101 → INVALID; 10 → 10 actualizados. (T) título vacío o de más de 120 → INVALID.
- *Riesgos / no hacer:* el precio es único para las dos tiendas. Sin edición masiva de precios ni promociones programadas: los descuentos puntuales los aplica owner o manager en `/pos`. No borrar productos (regla del ER: baja = `isActive = false`).
- *Depende:* 1.1, 1.3.

**1.8 Traspasos entre tiendas (H22, RF-INV-08).**
- *Comportamiento:* owner y manager, desde la tarjeta del producto: "Traspasar" → origen, destino, cantidad, nota opcional → "Se movieron 2 de Lomas a ClubAlva." El manager con tienda solo traspasa desde o hacia la suya. El colaborador no traspasa.
- *Contrato:* `transferStockAction({ variantId; fromLocationId; toLocationId; quantity; requestId; note? }): Promise<StockMovementResult>` y `InventoryDataSource.transferStock(...)`. Transacción: si existe `requestId:out` → `replayed`; actualiza las dos filas **en orden de `locationId`** (evita interbloqueo entre traspasos opuestos): el origen con `updateMany … gte` (si `count === 0`, INSUFFICIENT y rollback), el destino con `upsert` `increment`. Dos `Movement` `TRANSFER` (−n con `requestId:out`, +n con `requestId:in`) y la misma nota.
- *Acepta (`test:db`):* (T) stock 1 en Lomas: traspaso de 1 en paralelo con una venta de 1 en Lomas → exactamente una pasa; nada negativo. (T) Σ del stock de las dos tiendas no cambia con un traspaso. (T) dos traspasos opuestos en paralelo → los dos terminan, sin interbloqueo. (T) mismo `requestId` dos veces → un par de movimientos. (T) origen = destino → INVALID; manager de Lomas traspasando de ClubAlva al almacén → FORBIDDEN; colaborador → FORBIDDEN.
- *Depende:* 1.1, 1.2, 1.3.

**1.9 Historial de movimientos (RF-INV-09).**
- *Comportamiento:* `/movimientos` con filtros de tienda, tipo, usuario, fechas (hoy por omisión) y prenda (escanear o buscar). Cada renglón: fecha y hora de México, prenda y talla, tienda, tipo en español (Entrada, Venta, Merma, Corrección, Traspaso, Devolución), cantidad con signo, quién, motivo y folio de venta. 50 por página con "Ver más". El colaborador ve solo su tienda y el día.
- *Contrato:* `listMovementsAction(filter: { locationId?; type?; userId?; variantId?; from?; to?; cursor? }): Promise<MovementPage | null>`, `MovementPage = { rows: MovementRow[]; nextCursor: string | null }`. Rango máximo 93 días; `orderBy [timestamp desc, id desc]`, `take 50`; el servidor recorta el alcance del colaborador como `dashboard-scope.ts`. Usa los índices existentes de `Movement`.
- *Acepta:* (T) colaborador pidiendo otra tienda u otro día → recibe su tienda y hoy. (T) paginación por cursor sin repetidos ni huecos. (T) 94 días → INVALID. (T) ningún renglón trae `customerAlias`. (M) el owner encuentra quién hizo una merma en una fecha.
- *Depende:* 1.2.

**1.10 Pantallas de staff con sesión vencida y login (H8).**
- *Comportamiento:* `/`, `/productos` y `/etiquetas` muestran "Cargando…" mientras cargan (nunca ceros falsos), "Tu sesión terminó. Vuelve a iniciar sesión." con enlace si la sesión venció, y "No hay conexión. Reintentar." si falla la red. Existen `app/error.tsx`, `app/global-error.tsx` y `app/not-found.tsx`. En el login, la primera letra no sale en mayúscula, el usuario se recorta, y un fallo de red reactiva el botón con un aviso.
- *Contrato:* consumen `fetchProductsAction(): Promise<Product[] | null>` (1.3). Login: `label htmlFor`/`id`, `name`, `autoComplete="username"`/`"current-password"`, `autoCapitalize="none"`, `autoCorrect="off"`, `spellCheck={false}`, `try/catch` en `signIn`, error con `role="alert"`.
- *Acepta:* (T) con la acción devolviendo `null`, cada página muestra el mensaje de sesión y el enlace; con la promesa rechazada, el de reintento; durante la carga, ningún "0 productos". (T) el login envía `"lolo"` cuando se teclea `" lolo "`; si `signIn` lanza, el botón vuelve a estar activo y hay un `role="alert"`. (M) en Android: sesión vencida en las tres pantallas.
- *Depende:* 1.3.

**1.11 Pooler de Neon (H12).**
- *Comportamiento:* un pico de uso no agota las conexiones; la primera venta tras un rato sin uso termina o se reintenta sin duplicar.
- *Contrato:* el dueño confirma en Neon que `DATABASE_URL` de Vercel (Preview y Production) es la del *pooler* (host `-pooler`) con los parámetros que Prisma 5.22 pide para PgBouncer [C: `pgbouncer=true&connection_limit=1`, confirmar en la documentación vigente]. `DIRECT_URL` solo en el `.env` local para migrar. Sin cambios de código.
- *Acepta:* (M) en el Preview contra `ventas-prueba` con la URL del pooler: dos ventas en paralelo desde dos celulares, un alta con 3 tallas y un traspaso, sin P2028 ni "prepared statement" en Runtime Logs. Registro con fecha, sin valores.
- *Depende:* nada. Bloquea la demo.

**1.12 CI con `test:db`, ESLint y Node (H16, H23; v1 1.12).**
- *Contrato:* en `.github/workflows/ci.yml`, un job con `services: postgres:16`, `TEST_DATABASE_URL` local, `npx prisma migrate deploy` y `npm run test:db`, en `pull_request` y en `push` a `main` y `feat/demo-alta-lote`. ESLint con el contrato de v1 1.12 (`next/core-web-vitals` y `no-restricted-imports` de Prisma y `Product` en `components/virtual-store/**`, `lib/virtual-store/**` y `app/catalogo/**`) y un paso `npm run lint`. `engines.node` `">=22"` y `setup-node` 24 (la de Vercel) en los dos workflows.
- *Acepta:* (M) un PR muestra el job de base en verde con el número de pruebas; una rama de prueba que quita el `gte` de la venta lo hace fallar (se hace una vez y se anota). `npm run lint` sale con 0. (T) un archivo que importa Prisma bajo `components/virtual-store/` hace fallar el lint.
- *Riesgos / no hacer:* no reformatear en masa; una regla que falle en código viejo queda en `warn` con aviso.
- *Depende:* nada.

**1.13 Conteo físico (condicional, RF-INV-10).** Se hace solo si la muestra de 3.7 encuentra más de 5 % de diferencias o el dueño lo pide.
- *Comportamiento:* owner o manager elige tienda y departamento, escanea cada pieza (cada lectura suma 1) y al terminar ve "Sistema 7 · Contado 5" por prenda escaneada; al confirmar se crean las correcciones.
- *Contrato:* el conteo vive en el cliente hasta confirmar. `applyCountAction({ locationId; lines: { variantId; counted; expectedAvailable }[]; requestId })`: por renglón, comparar-y-escribir (`updateMany where available = expectedAvailable`) y `ADJUSTMENT` con nota "conteo AAAA-MM-DD" y `requestId:<variantId>`; un renglón que cambió por una venta vuelve como `CHANGED` para recontarlo.
- *Acepta (`test:db`):* (T) contado 5 sobre 7 → un `ADJUSTMENT` −2 con la nota. (T) un renglón vendido entretanto → `CHANGED` y sin ajuste; los demás se aplican.
- *Depende:* 1.2, 3.7.

### 4.2 Fase 2: catálogo

**2.1 Catálogo sin datos inventados; WhatsApp por variable (H6; v1 0.4 y 0.8).**
- *Comportamiento:* `/catalogo` abre en cuadrícula con **todos** los productos públicos. Sin sala virtual, repisas, siluetas con texto ("Ghost Puffer", "Aparta aquí"), contador de puntos ni la palabra "apartar". El recorrido solo aparece con una zona real aprobada (4.3) o en un preview con `NEXT_PUBLIC_SALA_VIRTUAL=1`. "Consultar por WhatsApp" abre `wa.me/<número>` con `Hola, me interesa {marca} {nombre} en talla {talla}. ¿Sigue disponible? Código {codigo}`; sin número válido, el texto "Consulta disponibilidad en tienda.".
- *Contrato:* `lib/public/whatsapp.ts` con `getWhatsAppNumber(): string | null` (lee `NEXT_PUBLIC_WHATSAPP_NUMBER`, acepta solo `^52\d{10}$`), `productInquiryMessage(p, size?)` (≤ 300 caracteres, nombre a 80) y `whatsAppLink(number, text)`. `NEXT_PUBLIC_SALA_VIRTUAL` (solo el nombre en `.env.example`). La cuadrícula itera `products`, no `hotspots`. Se reemplaza el número de ejemplo de `.env.example` por un marcador sin forma de teléfono.
- *Acepta:* (T) sin variable o con un valor inválido (espacios, letras, sin `52`): sin `a[href^="https://wa.me"]` y con el texto alterno. (T) con un número ficticio evidente: el `href` empieza con `https://wa.me/<número>?text=`, el texto trae `Código <publicCode>` y la talla, y no trae SKU, código de barras ni `id`. (T) con 12 productos se ven 12 tarjetas, sin `shelfLabel` ni textos de `DEFAULT_HOTSPOTS_CONFIG`. (T) sin productos: "Pronto verás aquí las prendas de la tienda.". (T) ningún archivo de `app/`, `components/` o `lib/` (fuera de pruebas) contiene `5211234567890`, "Ghost Puffer", "LoloTech" ni "apart" (sin distinguir mayúsculas), con o sin la bandera.
- *Riesgos / no hacer:* cambiar el número exige redeploy (`NEXT_PUBLIC_` se incrusta al compilar). No cambiar `force-dynamic` por caché.
- *Depende:* nada.

**2.2 Una tarjeta por producto con tallas (decisión 1).**
- *Comportamiento:* cada tarjeta: foto de frente, marca, nombre, precio ("Desde $X" si las tallas tienen precios distintos) y chips de talla ordenados (hasta 6, luego "+N"). Una talla sin existencias se ve tachada y su nombre accesible dice "agotada" (no solo color). Si todas están agotadas, la tarjeta dice "Agotado". En el modal, al elegir talla se ve su precio y el mensaje de WhatsApp lleva esa talla.
- *Contrato:* `PublicProduct.sizes[].price` (§3.1; si dos variantes comparten talla, el menor y disponible si alguna lo está). `sortSizes` puro en `lib/domain/sizes.ts`: XXS…XXXL, CH/M/G/XG, numéricas ascendentes, "U" al final. `getPublicCatalog` filtra en SQL (`isActive`, `mergedIntoId` nulo, las dos fotos) con orden estable `[createdAt desc, id asc]`. El bot busca por `publicCode` con `findUnique` y sigue un salto de `mergedIntoId`.
- *Acepta:* (T) un producto con S agotada y M disponible a precios distintos → "Desde", S tachada con "agotada" en el nombre accesible. (T) orden: `["L","S","XL","M"]` → `S, M, L, XL`; `["28","30","U"]` → `28, 30, U`. (T, `test:db`) contrato Prisma = Fixture: mismas claves exactas, sin `sku`, `barcode`, `available` ni `inventory` (cierra Pruebas A4). (T) un producto unido no aparece y su código responde con el destino.
- *Depende:* 1.1, 1.5.

**2.3 Filtro por departamento y "Ver más" (v1 1.1).**
- *Comportamiento:* chips `Todo · Dama · Caballero · …` (solo departamentos con prendas públicas, en `sortOrder`); la URL queda `?depto=<slug>` y abre filtrada; 24 tarjetas y "Ver más" suma 24. Sin departamento, solo en "Todo".
- *Contrato:* `PublicProduct.department` (§3.1), incluido en `PrismaDataSource.getProducts` y en el Fixture; departamento inactivo → `null`. Se filtra en el cliente.
- *Acepta:* (T) con 30 productos se ven 24 y "Ver más" lleva a 30 y desaparece. (T) `?depto=calzado` llega filtrado con `aria-pressed="true"`. (T) departamento sin productos, sin chip. (T) chips ≥ 44 px; sin conteos.
- *Riesgos / no hacer:* el filtro sirve solo si los productos tienen departamento: el owner lo asigna en lote (1.7) antes de la demo.
- *Depende:* 1.7, 2.2.

**2.4 Mínimo móvil y accesibilidad (H7).**
- *Comportamiento:* el modal y el cajón son diálogos: se cierran con Esc, atrapan y devuelven el foco y bloquean el scroll. Todo control visible de la cuadrícula mide ≥ 44 px y los iconos tienen nombre. Ninguna página queda en blanco antes de hidratar. Con movimiento reducido no hay animaciones. Al cambiar de producto, la talla elegida se reinicia.
- *Contrato:* `role="dialog"`, `aria-modal`, `aria-labelledby`; `PageTransition` solo con `opacity` e `initial={false}`, sin `filter` (o se quita); `MotionConfig reducedMotion="user"` en el layout; `<img>` con `width`, `height` y `loading="lazy"`; el modal con `key` = id del producto.
- *Acepta:* (T) el modal tiene `role="dialog"` y su título; Esc lo cierra y el foco vuelve al disparador. (T) el HTML de servidor de `/catalogo` y `/login` no trae `opacity:0` ni `filter`. (T) con `matchMedia` de movimiento reducido no hay transformaciones animadas. (T) abrir el producto A en talla M y luego B muestra la primera talla de B. (M) a 375 px en un celular real, sin desbordes horizontales.
- *Depende:* 2.1.

### 4.3 Hito: demo al dueño (incluye v1 0.2)

**Entorno:** Preview de Vercel con variables **acotadas a la rama `feat/demo-alta-lote`**, contra `ventas-prueba` (copia de producción con la migración 1.1 aplicada) por el pooler (1.11). Nunca la conexión de producción en Preview. `ventas-prueba` trae duplicados reales de producción, que sirven para ensayar 1.6.

**Lo que el dueño hace de principio a fin** (dos celulares; cuentas owner, manager, `colab1` en Lomas y `colab2` en ClubAlva):

1. `colab1`: da de alta un producto **con 3 tallas** en modo catálogo con fotos de frente y atrás, y otro en modo solo stock.
2. `colab1`: agrega la talla L a un producto existente buscando su código público, y otra escaneando.
3. `colab2`: escanea un código ya registrado en Lomas y suma 2 piezas en ClubAlva.
4. Owner: une dos productos duplicados de una talla; `/ventas` muestra las mismas cifras antes y después.
5. Owner: cambia el precio de una talla con motivo y ve el historial. Manager: asigna departamento a 10 productos.
6. Manager: registra una merma de 1 con motivo; una merma de 3 sobre stock 1 se rechaza con el mensaje.
7. Owner: traspasa 1 pieza de Lomas a ClubAlva.
8. `colab1` vende en `/pos` en Lomas (efectivo); `colab2` vende en ClubAlva (SPAY, queda pendiente); el manager confirma el pago; el owner ve vendido, cobrado y pendientes en `/ventas`.
9. Con un carrito abierto de `colab1`, el owner cambia el precio de esa talla: `colab1` ve el aviso de precio cambiado y cobra al nuevo.
10. `/movimientos` muestra todo lo anterior con quién y por qué.
11. En un celular sin sesión, `/catalogo`: una tarjeta por producto con tallas, filtro por departamento, WhatsApp con código y talla, nada inventado; el producto de solo stock no aparece.
12. Con la sesión vencida, `/productos` muestra el mensaje y no una pantalla en blanco.

**Antes de la demo (Claude, con evidencia pegada):** `tsc`, `test`, `test:db`, `lint` y `build` en verde, también en CI; `migrate status` "up to date" en `ventas-prueba`; variables de Preview acotadas; ensayo completo del guion en el Preview a 375 px en navegador y el resto de 1.11; lista de hallazgos abiertos.

**Después de la demo:** las observaciones del dueño se clasifican en "bloquea la salida" o "después"; se corrigen las primeras; se hace la Fase 3; se repite el guion completo y la Fase G en el Preview. **Demo aprobada** = el dueño firma la lista con fecha en la guía de salida.

### 4.4 Fase 3: prerrequisitos de salida

**3.1 Webhook endurecido (H2; v1 0.7 y 1.6).**
- *Comportamiento:* un mensaje sin firma válida de Meta se rechaza; solo se contesta al número de negocio configurado; el bot no dice "Tienda Principal" ni promete apartados; por un código de solo stock contesta "La tienda te confirma por aquí si lo tenemos." sin revelar que existe; por un código unido, contesta por el producto destino.
- *Contrato:* `app/api/whatsapp/webhook/route.ts`: en producción sin `WHATSAPP_APP_SECRET`, `POST` → 503 sin procesar; firma ausente, de otra longitud o inválida → 401. Variable nueva `WHATSAPP_PHONE_NUMBER_ID` (solo nombre): un `phone_number_id` distinto se ignora con 200. `from` debe cumplir `^\d{10,15}$`. Cuerpo incompleto → 200 sin procesar (no 500, que provoca reintentos de Meta). Deduplicación de `message.id` en memoria (por instancia, mejor esfuerzo). Se revisa la respuesta del `fetch` a Graph. Las bitácoras no incluyen el cuerpo. Textos con la constante `CATALOG_URL`.
- *Acepta:* (T) producción sin secreto: 503 y `sendWhatsAppMessage` no se llama. (T) con secreto: sin firma, longitud distinta o firma inválida → 401; válida → 200. (T) otro `phone_number_id` → 200 sin enviar. (T) cuerpo sin `metadata` → 200 sin excepción. (T) ninguna respuesta contiene "Tienda Principal" ni "apart". (T) el mismo `message.id` dos veces → una respuesta.
- *Riesgos / no hacer:* sin las variables en Vercel antes del deploy, el bot deja de contestar (lo revisa 3.4).
- *Depende:* 1.6 (salto de unión).

**3.2 Plan de contingencia (H14).** Sección nueva en la guía de salida: quién vigila (el dueño) y cómo; si Vercel o Neon caen, hoja en papel por tienda (hora, código, talla, precio, método) y registro en `/pos` al volver, por owner o manager (anotando que la fecha del ticket será la del registro); sin internet en una tienda, datos del celular; retroceso promoviendo el deploy anterior (id anotado antes de salir). *Acepta:* (M) la sección existe y se ensayó una vez sin red durante la demo. *Depende:* nada.

**3.3 Reglas de caché de la PWA y recarga (H18).**
- *Contrato:* `runtimeCaching` propio en `next.config.mjs`: `NetworkOnly` para `/api/*`, para las navegaciones y los payloads RSC de páginas (incluido `/catalogo`); `CacheFirst` para `/_next/static`; imágenes de producto `StaleWhileRevalidate` 7 días. `public/__tests__/` sale de `public/`; las tres `.jpeg` sin uso salen del precaché. Si una acción responde "Failed to find Server Action", la app muestra "Hay una versión nueva. Recarga la página.". La guía agrega el paso "cerrar y abrir la app" después de cada deploy.
- *Acepta:* (T) una prueba que lee la configuración: `/api/*` y las navegaciones son `NetworkOnly`. (T) `public/` no contiene `__tests__`. (M) tras un deploy, un celular con la PWA vieja toma la versión nueva con una recarga; sin red, `/catalogo` no muestra disponibilidad vieja.
- *Riesgos / no hacer:* no migrar a Serwist ahora (va con PR #17, §4.6).
- *Depende:* nada.

**3.4 Variables y Fase G ampliada (H19).** Lista de nombres que deben existir en Production **antes del build**: `DATABASE_URL` (pooler), `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (si hay dominio propio), `BLOB_READ_WRITE_TOKEN`, `BLOB_PUBLIC_HOST`, `BOT_API_KEY`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `NEXT_PUBLIC_WHATSAPP_NUMBER`. Nunca `DIRECT_URL` ni `SHADOW_DATABASE_URL`. La Fase G suma: webhook firmado → 200 y sin firma → 401; `/catalogo` con productos reales y sin textos inventados; enlace de WhatsApp con el número configurado; una entrada, una merma y un traspaso sobre un producto "PRUEBA" que se desactiva al terminar. *Acepta:* (M) lista marcada en la guía con fecha e id del deploy, sin valores. *Depende:* 3.1.

**3.5 Evaluación de parches de seguridad (H13; parte de v1 1.10).**
- *Contrato:* PR con tabla de triage (paquete, severidad, ¿corre en producción?, acción). Next 14.2.35 es la última 14.x: no hay parche menor; el CVE crítico de DoS queda **aceptado y documentado** hasta PR #17 (que debe quedar en una versión mayor a 15.5.27). Se aplican solo menores sin `--force` (`@vercel/blob` 2.9.x, `undici`, `postcss`, `fast-uri`); se cierran las ramas de Dependabot obsoletas.
- *Acepta:* (M) la tabla en el PR; `npm audit --omit=dev` sin críticas fuera de la excepción explicada; `tsc`, `test`, `test:db` y `build` en verde.
- *Depende:* 1.12.

**3.6 Endurecimiento menor de subida y login.** `lib/image/upload.ts` revisa los bytes iniciales (JPEG, PNG, WebP) y baja el tope a 3.5 MB (el límite de Vercel es 4.5 MB por petición); el login compara contra un hash ficticio cuando el usuario no existe (sin diferencia de tiempo). *Acepta:* (T) un archivo de texto con `image/jpeg` → rechazado; 3.6 MB → mensaje claro; (T) usuario inexistente → se llama a `bcrypt.compare`. *Depende:* nada.

**3.7 Salida a producción y carga de mercancía (v1 0.3, 0.5, 0.6; H1, H15).**
- *Comportamiento:* producción recibe ventas, control de inventario y catálogo nuevo; luego las dos tiendas cargan todo su stock en noviembre.
- *Contrato:* fases A y E–G de la guía, con la migración 1.1 incluida; ventana nocturna sin ventas, respaldo restaurable del mismo día, id del deploy anterior y responsable del retroceso anotados. **No correr `reset-users.ts`.** Cierra H1 (la acción pública de `main` deja de existir).
- *Carga:* por tienda y por departamento, empezando por lo de más venta; el producto con varias tallas se da de alta una vez (1.5). Si ClubAlva no alcanza, plan B (H15): ClubAlva carga solo stock y las fotos de catálogo se toman en Lomas.
- *Acepta:* (M) Fase G en verde y 10 minutos sin errores en Runtime Logs. (M) al cierre de cada semana, una muestra de 20 prendas por tienda coincide con `/productos`; con más de 5 % de diferencias se activa 1.13. (M) el 2026-11-30, cada departamento de cada tienda marcado como "cargado" por el dueño.
- *Riesgos / no hacer:* fotos sin caras ni personas, y con la etiqueta del retailer fuera del cuadro (su precio revela el costo). Autosuspend de Neon (v1 0.5): solo si el Buen Fin se confirma y el plan lo permite; si no, se acepta el arranque en frío. Vigilar en Vercel el uso de Hobby (almacenamiento y transferencia de Blob) cada semana.
- *Depende:* demo aprobada, 3.1–3.6.

### 4.5 Fase 4: portal y complemento (enero, salvo indicación del dueño)

El detalle completo de 4.1–4.4, 4.5 y 4.7 está en v1 (git `ca22425`, §4.2–§4.3); aquí queda el resumen y los ajustes de v2.

- **4.1 Producto elegido por punto y zonas fuera de `zones.ts` (v1 1.2).** `store-config.json` sin título, marca, precio ni imagen; asignación en `AppSetting` `recorrido.puntos` (`hotspotId` → `publicCode`) desde `/recorrido/puntos`, solo owner. *Ajuste v2:* un código unido se resuelve a su destino; un punto con código no público no se pinta. Depende de 2.1.
- **4.2 Giro frente/atrás (v1 1.3).** Con movimiento reducido, botones Frente/Atrás; la foto trasera se pide al abrir el modal. Depende de 2.4.
- **4.3 Panorámicas reales (v1 1.4).** WebP sin EXIF ni XMP, ≤ 600 KB; revisión de privacidad firmada por el dueño (sin personas, pantallas ni precios legibles). Depende de 4.1.
- **4.4 Derivados de imagen (v1 1.5).** JPEG de 200–800 px pregenerados en el cliente con nombre deducible (`productos/v2/<base>-w<ancho>.jpg`) y `publicImageAttrs`. *Ajuste v2:* adelantarlo si el uso de Blob en Hobby se acerca al límite.
- **4.5 Blobs huérfanos con salvaguardas (v1 1.11 + H17).** Además de v1: el barrido aborta si la base no es la de producción o si el store no coincide con `BLOB_PUBLIC_HOST`; Preview sube con prefijo `preview/` y el barrido de producción lo ignora; los URL de productos inactivos o unidos cuentan como referenciados.
- **4.6 SEO, Open Graph y aviso de privacidad (H21).** `generateMetadata` y Open Graph en `/catalogo` con textos reales; aviso de privacidad (LFPDPPP) breve enlazado desde el catálogo y el bot, antes de 4.7.
- **4.7 WhatsApp Business (H20; v1 1.13).** El dueño da de alta el perfil en Meta; Claude cambia la variable y prueba el webhook. Decidir número dedicado para el bot o coexistencia con la app, para que el botón `wa.me` y el bot lleguen al mismo número.
- **4.8 Tokens de color y contraste (H25).** Un solo turquesa de texto (`#0C7C7C` de UX §3.2); ningún texto blanco sobre `#2DD4BF`; prueba de contraste ≥ 4.5:1 en los tokens.

### 4.6 Después de la demo: operación (diciembre fuera de congelamiento, o enero)

Se conservan de v1 con su contrato (git `ca22425`):
- **Carrito de `/pos` que sobrevive a una recarga (v1 1.7).** `localStorage` por usuario y día de negocio, sin alias ni referencia; cerrar sesión lo borra. Hoy el reintento en memoria ya evita duplicar.
- **Devoluciones parciales (v1 1.8).** Comparar-y-escribir sobre `returnedQuantity`, solo owner, sin migración. *Ajuste v2:* pruebas `test:db` de devoluciones parciales en paralelo; `refunded` también en `recentSales`.
- **Menores del ledger (resto de v1 1.9).** `mergeBrandsAction` con `FOR UPDATE` dentro de la transacción. (La parte de sesión vencida pasó a 1.10.)
- **PR #17** (Next 15+, React 19, Serwist): rebase, versión > 15.5.27, prueba manual y merge en enero.
- **Pendientes de auditoría sin fecha:** límite de intentos de login por usuario e IP (vía `lib/platform/`), cabeceras de seguridad y `Permissions-Policy: camera=(self)`, pérdida por impago visible en el dashboard (ER §3.3), set mínimo de Playwright (Pruebas M4), `/etiquetas` con selección y estilos de impresión, carga diferida de `html5-qrcode`.

---

## 5. Preguntas abiertas para el dueño

Cada una trae la propuesta sobre la que se construye.

1. **Fechas.** *Propuesta:* demo el **2026-11-19**; salida la noche del 11-19 o del 11-20 si se aprueba; carga del 11-20 al 11-30. Si el Buen Fin se confirma [C: fechas oficiales], esos días no hay salida. Si la demo se corre más allá del 11-23, la carga de noviembre no alcanza: ver la pregunta 3.
2. **H1 en producción.** La acción pública de `main` puede devolver SKU y existencias sin sesión, y la salida ya no tiene fecha fija. *Propuesta:* hotfix en `main` ya (≈ 1 h, un archivo, la misma proyección `PublicProduct`), con tu visto bueno para el commit y el deploy.
3. **Carga antes de la salida.** *Propuesta:* no cargar en la producción vieja (crea un producto por talla con el alta anterior); el personal practica en el Preview. Si la demo se atrasa, se sale con la Fase 1 y 2.1 (lo mínimo del catálogo) y el resto del catálogo después.
4. **Mermas del colaborador.** *Propuesta:* no; owner y manager registran mermas y correcciones (ER §3.2). El colaborador avisa y la pieza se aparta físicamente.
5. **El manager edita precios que valen para las dos tiendas.** *Propuesta:* sí, como dijiste, con historial; no hay precio por tienda.
6. **El colaborador ve el stock de la otra tienda** (C-20 del SRS). *Propuesta:* se mantiene visible en las pantallas internas (sirve para decirle al cliente "hay en la otra tienda"); el colaborador solo **escribe** en la suya.
7. **Traspasos por el colaborador.** *Propuesta:* no; owner o manager.
8. **Bot y artículos de solo stock (R18).** *Propuesta:* respuesta neutral (3.1), sin revelar el artículo.
9. **Hosting.** Decidido: Hobby hasta la demo y más pruebas. *Propuesta:* revisar el uso medido (Blob y transferencia) una semana después de la salida y antes de promover el catálogo o WhatsApp Business.
10. **Promociones del Buen Fin, si se hace.** *Propuesta:* descuentos puntuales en `/pos` por owner o manager (ya existe); sin precios masivos ni temporales.

---

## 6. Decisiones de diseño

Formato: decisión — por qué — costo si resulta equivocada.

1. Talla = variante; el alta crea un producto con N variantes — decisión del dueño y el modelo ya lo soporta — ninguno técnico; el costo fue la carga previa a unir.
2. Una migración aditiva (`PriceChange`, `Movement.requestId`, `Product.mergedIntoId/mergedAt/mergedById`) — el historial de precios no cabe en `Movement` sin romper el libro de stock, y la idempotencia de ajustes la necesita — una migración más en la salida (aditiva y ensayada).
3. La migración sale con las de ventas, no antes — producción aún no tiene ventas y se migra una sola vez — si la salida se atrasa, todo se atrasa junto.
4. Precio con comparar-y-escribir (`expectedPrice`) — evita que dos ediciones se pisen sin bloqueos — un CONFLICT que obliga a recargar.
5. `PRICE_CHANGED` en `/pos` en vez de `INVALID` — el colaborador puede seguir sin llamar al dueño — un toque más.
6. Sin "Salida" en `/escanear`; salidas tipadas solo owner/manager — una "Salida" era una venta invisible (H3) y el ER §3.2 lo pide — el colaborador depende del encargado para mermas.
7. `requestId` en `Movement` para idempotencia — un doble toque o un reintento no descuenta dos veces — una columna nullable con índice único.
8. Traspaso con dos `TRANSFER` y las filas actualizadas en orden de `locationId` — atómico y sin interbloqueos — ninguno.
9. Unir productos mueve `Variant.productId` y la copia `SaleLine.productId`, no `departmentId` — igual que la fusión de marcas; el departamento histórico no se reescribe — reportes por departamento mezclan el de antes y el de ahora.
10. Productos unidos quedan inactivos con `mergedIntoId`, no se borran — auditoría y códigos ya enviados por WhatsApp — filas muertas en la tabla.
11. Unión solo dentro de la misma marca — evita uniones por error — corregir la marca antes (1.7).
12. Candidatos a duplicado por función pura en la pantalla del owner, sin script de aplicación — un solo camino probado — el owner revisa grupo por grupo.
13. Misma talla con código distinto se permite; sin código se rechaza — hay etiquetas distintas de la misma talla, pero sin código sería un duplicado — dos variantes "M" en un producto, unidas en lo público.
14. Precio por talla en `PublicProduct.sizes` y "Desde $X" — cada variante tiene su precio (decisión 1) — un campo más en el contrato público (no revela nada interno).
15. Número de WhatsApp `^52\d{10}$` — negocio en México; evita números sin lada — cambiar la regex si hubiera número extranjero.
16. Sesión de 12 h — tablets compartidas (M5 de seguridad) — entrar una vez por jornada.
17. Recorrido, derivados, panorámicas, SEO y tokens en enero — prioridad 3 del dueño — el catálogo sale sencillo (cuadrícula).
18. Vercel Hobby hasta después de la demo — decisión del dueño — riesgo aceptado: términos de uso comercial y límites de Blob y transferencia [C]; mitigado con revisión semanal del uso.
19. Next 14 con el DoS crítico aceptado hasta PR #17 — no hay parche en 14.x y no se cambia de framework antes de la carga — una caída por DoS mientras tanto.
20. Conteo físico condicional — la muestra semanal dice si hace falta — 6 h si hay descuadres.

---

## 7. Review Focus

Los cinco modos de falla más probables en el uso real de noviembre, con el comportamiento esperado y su prueba:

1. **Dos colaboradores registran el mismo código** (la misma prenda llega a las dos tiendas, o dos personas escanean a la vez). Esperado: el `@unique` de `barcode` deja crear a uno; el otro recibe DUPLICATE y la pantalla ofrece "Sumar piezas en tu tienda", no un error. Si el código lo tiene otro producto en una alta de varias tallas, no se crea nada y se dice cuál. Prueba: 1.5 (`test:db` en paralelo).
2. **Unir duplicados con historial de ventas.** Esperado: las cifras de `/ventas` (vendido, cobrado, por marca) son idénticas antes y después; los movimientos no cambian; repetir no hace nada; el código viejo sigue contestando en WhatsApp. Prueba: 1.6 (`test:db`), y se ensaya primero en `ventas-prueba` durante la demo.
3. **El precio cambia con un carrito abierto en `/pos`.** Esperado: el colaborador recibe PRICE_CHANGED con el precio nuevo, el carrito se actualiza y cobra al nuevo con otro toque; owner o manager cobran el precio que tienen en pantalla (pueden fijarlo por diseño). Dos ediciones simultáneas: una gana, la otra ve CONFLICT con el precio vigente. Prueba: 1.7.
4. **Traspaso mientras se vende la última pieza.** Esperado: exactamente una de las dos operaciones pasa; la otra recibe "Solo hay 0 en esta tienda."; nada queda negativo y Σ del stock de las dos tiendas solo baja por la venta. Prueba: 1.8 (`test:db` en paralelo).
5. **Red lenta en la tienda** (alta con fotos, entrada, cobro). Esperado: un reintento de entrada o traspaso devuelve `replayed` y no duplica; el cobro reintenta con el mismo `clientRequestId`; si la subida de fotos falla, el alta no se crea y el mensaje lo dice; la primera operación tras un rato sin uso espera a Neon sin errores; nunca se ve una pantalla en blanco ni ceros falsos. Prueba: 1.2, 1.10, 1.11 y el ensayo sin red de 3.2.

---

## 8. Fuera de alcance

- Ficha pública `/catalogo/p/[slug]`, `publishedAt`, datos públicos de tienda y disponibilidad por tienda (P3, ER §2.7).
- Cobro en línea, carrito del cliente, apartados, envíos.
- Precio por tienda, precio de etiqueta del retailer (D-INV-1), promociones programadas, edición masiva de precios.
- Variantes por color, tallas por departamento (CH–XG como lista controlada), separar productos unidos.
- Política de devoluciones (D-VEN-3), método de reembolso, folio de devolución.
- Recorte de fondo, riel 2.5D, probador virtual, imágenes con IA.
- Vercel Pro, cambio de hosting o dominio, Raspberry Pi; purga de la historia de Git.

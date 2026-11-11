# LoloShop: implementaciones posteriores a ventas P1. Plan de implementación (versión 2)

> **Reemplaza al plan v1** (T1–T20, en git `ca22425`). Se basa en el **spec v2 aprobado por el dueño** (commit `f656116`) y corrige los defectos de orden de la auditoría (H24).
>
> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

> **Estado de cierre (2026-11-10): plan v2 CERRADO y en producción.** El dueño adelantó la salida y lo pidió en producción ese mismo día para registrar stock en las tiendas.
> - **Hechas y en `main`** (PR #29, mezclado en `edb8f5e`): 1.1 a 1.10, 1.12, 2.1 a 2.4, la ola final de corrección (I1–I8), los residuales y la auditoría de UI de `/pos` y `/ventas`. Verificación previa al merge: 893/893 pruebas, 111/111 `test:db` y build limpio.
> - **1.11 (pooler):** aplicado en Production el 2026-11-10 (host `-pooler` con `pgbouncer=true`, `connection_limit=1` y `connect_timeout=15`). Login de los 4 usuarios verificado después del redeploy.
> - **3.7 (salida):** adelantada al 2026-11-10 siguiendo el runbook (fases A, C, F y G). Hubo respaldo verificado, drift 0, 4 migraciones aditivas, relleno y usuarios reiniciados. La carga de mercancía la hace el dueño desde ese día.
> - **El hito de la demo (19 de noviembre)** se sustituye por el uso real en tienda.
> - **Pasan al backlog**, cada una con su propio spec o plan cuando se retome:
>   - 3.1, webhook: el bot todavía dice "envíos a todo México" y "Tienda Principal";
>   - 3.2, 3.3, 3.4 y 3.6;
>   - 3.5, Next 14 con avisos de `npm audit`, incluido uno crítico (PR #17 y Dependabot #28);
>   - 3.8, taxonomía (spec `2026-11-10-taxonomia-productos-design.md`);
>   - 1.13, conteo físico.
> - **Riesgo conocido:** si alguien insiste en Cobrar después de `request_conflict`, se puede registrar una segunda venta.
> - **Siguiente spec:** el flujo de alta en tienda (escaneo de etiqueta, fotos en el mismo paso e instrucciones en pantalla).

**Goal:** que LoloShop controle el inventario de las dos tiendas (tallas como variantes, movimientos tipados y seguros, precios editables, traspasos e historial), con un catálogo público sin datos inventados, listo para la demo al dueño del 2026-11-19 y después para la salida a producción.

**Architecture:** Next.js 14 App Router con server actions; Prisma 5.22 sobre Postgres (Neon). Toda escritura de stock pasa por `InventoryDataSource` (Prisma y Fixture cambian juntos) dentro de una transacción con `UPDATE … WHERE available >= n`. Los permisos se deciden en el servidor con el usuario releído de la base (`getCurrentUser()`) mediante los helpers de `lib/auth/permissions.ts`. Lo público pasa solo por `PublicProduct` (`lib/data/public-projection.ts`).

**Tech Stack:** Next.js 14.2.35, React 18.3, TypeScript 5.5, Prisma 5.22, PostgreSQL 16, next-auth 4, `@vercel/blob` 2.8, framer-motion, Tailwind, Vitest 1.6 + Testing Library (jsdom), `npm run test:db` (`vitest.db.config.ts`, `*.db.test.ts`).

**Spec:** `docs/superpowers/specs/2026-11-09-loloshop-implementaciones-posteriores-design.md` (v2, autoridad). Datos: `docs/superpowers/specs/2026-11-05-modelo-datos-er.md` (fuente de verdad). Auditoría: `docs/superpowers/specs/2026-11-09-auditoria-consolidada.md`. Salida: `docs/runbooks/2026-11-salida-ventas.md`.

## Global Constraints

- Lo público usa **solo** `PublicProduct`: sin SKU, código de barras ni conteos; disponibilidad sí/no por talla; solo tiendas. Público solo con foto de frente **y** de atrás.
- Nada inventado ante el cliente: ni productos, precios, existencias o ubicaciones de ejemplo, ni promesas ("apartado", "envío").
- Rol y tienda se releen de la base en cada acción (`getCurrentUser()`), nunca del JWT. El JWT solo decide qué botones se muestran.
- El stock nunca queda negativo. Toda salida es `updateMany({ where: { …, available: { gte: n } } })`; sin fila de inventario no hay salida. Todo cambio de stock escribe un `Movement` con tipo explícito y `userId`. Las ventas solo se registran en `/pos`.
- Motivos de ajuste, de traspaso y de precio: 3–120 caracteres y sin secuencias de 7 o más dígitos (`/\d{7,}/`).
- No se guardan contactos de clientes; ningún renglón nuevo devuelve `customerAlias`.
- Migraciones solo con `prisma migrate`, aditivas, con el cambio de contrato (`InventoryDataSource`, Prisma, Fixture y pruebas) y el ER en el mismo PR. No meter `CHECK` a mano. El SQL se genera contra Postgres **local**, nunca contra Neon.
- Repo público: ningún secreto, cadena de conexión, host de Neon ni número de teléfono real en commits, documentos, pruebas o capturas. Número de prueba: `"52" + "0".repeat(10)` (12 dígitos, cumple `^52\d{10}$` y es evidentemente ficticio); en documentos, `<número ficticio 52XXXXXXXXXX>`. Hosts de prueba: `*.invalid`.
- Móvil primero: objetivos ≥ 44 px, uso a 375 px, `prefers-reduced-motion`, español de México.
- Git: una rama por tarea `feat/<tema>` (o `fix/`, `docs/`, `chore/`) desde `feat/demo-alta-lote`; Conventional Commits; sin commits en `main`; sin `push`, `--force`, merge a `feat/demo-alta-lote`, deploy ni escrituras en producción sin visto bueno del dueño. Nunca `.env*`, volcados ni capturas con datos.
- **VE (verificación estándar)** = evidencia pegada de `npx tsc --noEmit`, `npm test`, `npm run build`; además `npm run test:db` si la tarea toca `lib/data`, `lib/sales` o `prisma/` (la salida debe mostrar las pruebas **ejecutadas**: sin `TEST_DATABASE_URL` local se saltan en silencio con `describe.skipIf`), y `npm run lint` desde la tarea 1.12 (orden 2).
- **Diseños:** los de Stitch no existen todavía (`docs/design/2026-11-09-stitch/` está vacío). Cada tarea de UI tiene un paso **Diseño** con el texto fijo: "Si existe `docs/design/2026-11-09-stitch/<pantalla>`, seguirlo; si no, seguir el comportamiento del spec v2 y las reglas: paleta #007272 (presionado #005F5F, texto blanco), 375 px, objetivos ≥ 44 px, español de México, prefers-reduced-motion". Pantallas: `alta-tallas`, `agregar-talla`, `ficha-interna`, `merma-traspaso`, `movimientos`, `catalogo-cuadricula`, `modal-publico`. No se inventan diseños.
- **DUEÑO** marca un paso que solo hace el dueño (Neon, Vercel, producción, `push`, merge, deploy). Claude prepara y verifica; nunca lo ejecuta.

## Review Focus

Los cinco de spec §7. Cada uno tiene su prueba en la tarea dueña (marcada "RF-n").

1. **RF-1. Dos personas registran el mismo código** (dos tiendas o dos escaneos a la vez): uno crea, el otro recibe DUPLICATE con "Sumar piezas en tu tienda"; en un alta de varias tallas con un código ya usado no se crea nada y se dice cuál. Tarea 1.5.
2. **RF-2. Unir duplicados con historial de ventas:** cifras de `/ventas` idénticas, movimientos sin cambio, repetir no hace nada, el código viejo responde por WhatsApp con el destino. Tarea 1.6.
3. **RF-3. El precio cambia con un carrito abierto en `/pos`:** el colaborador recibe PRICE_CHANGED, el carrito se actualiza y cobra con otro toque; dos ediciones simultáneas → una CONFLICT. Tarea 1.7.
4. **RF-4. Traspaso mientras se vende la última pieza:** exactamente una pasa; nada negativo; Σ de las dos tiendas solo baja por la venta. Tarea 1.8.
5. **RF-5. Red lenta en la tienda:** reintento de entrada o traspaso → `replayed`, sin duplicar; nunca pantalla en blanco ni ceros falsos. Tareas 1.2, 1.8, 1.10, 1.11.

## Correcciones H24 (defectos de orden del plan v1)

| Defecto de v1 | Causa | Cómo lo evita v2 |
|---|---|---|
| **T8 rompía una prueba de T3** | T3 escribía pruebas sobre `DEFAULT_HOTSPOTS_CONFIG` y las props del modal; T8 cambiaba ese contrato después. | El recorrido (v1 T8) pasa a la Fase 4 (4.1), fuera de este plan detallado. Cada tarea lista en **"Pruebas existentes que cambia"** las pruebas previas que modifica y por qué; una prueba escrita por una tarea **anterior de este plan** solo se toca para ampliar su fixture o su lista de claves, nunca para relajar una aserción. Las pruebas de UI de 2.1 consultan por rol y texto (no por estructura interna), así que 2.2–2.4 las conservan intactas. |
| **T9 dependía de T18** | Una tarea medía un resultado que solo existía tras otra posterior. | Derivados de imagen (v1 T9/T18) pasan a Fase 4. En v2, la columna "Depende de" de la tabla final solo cita tareas con número de orden menor. Donde el plan reutiliza código de otra tarea (1.5 usa la "Entrada" de 1.2; 1.9 la búsqueda de 1.5; 2.2 el salto de unión de 1.6), la tarea proveedora va antes. |
| **Faltaban mocks en T3 y T15** | Las pruebas dependían de módulos de servidor sin simular (`next/navigation`, `getServerSession`). | Cada tarea trae la línea **Mocks y fixtures** con los módulos a simular. Cuando cambia `InventoryDataSource`, la misma tarea actualiza `PrismaDataSource`, `FixtureDataSource` y todas las pruebas que llaman al método (lista explícita). Desde 1.3 las acciones se prueban con `vi.mock("@/lib/auth/current-user")`, no con `next-auth`. |
| Riesgos del mismo tipo hallados al leer el código | `fetchProductsAction` pasa a devolver `null` (1.3) y rompería los tipos de 6 llamadores; quitar `adjustInventory` (1.2) rompe 2 pruebas; `CreateProductData.variants` (1.5) rompe 10 archivos de prueba; `PRICE_CHANGED` (1.7) cambia una aserción de `lib/sales`. | Cada caso está en la tarea que hace el cambio, con la lista de archivos, para que `tsc` y `npm test` queden en verde al cerrar **esa** tarea. |

## Mapa de archivos nuevos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `prisma/local-db.ts` | `isLocalDatabaseUrl(url)`; lo usan el seed y `test/db/guard.ts` | 1.4 |
| `.eslintrc.json`, `lib/__tests__/eslint-boundaries.test.ts` | lint con fronteras de lo público | 1.12 |
| `lib/auth/permissions.ts` | `isStoreBound`, `assertCanOperate`, `requireRole`, `currentUserOrNull` | 1.3 |
| `prisma/migrations/20261110120000_inventory_controls/` | `PriceChange`, `Movement.requestId`, `Product.merged*` | 1.1 |
| `lib/domain/stock-movement.ts` | validación pura de movimientos y motivos | 1.2 |
| `components/inventory/StockMovementPanel.tsx` | Entrada / Merma o corrección / Traspasar | 1.2, 1.8 |
| `lib/domain/sizes.ts` | `normalizeSize`, `sortSizes` | 1.5 |
| `components/products/SizeRows.tsx`, `AddSizeForm.tsx`, `ExistingProductSearch.tsx` | alta con tallas y "agregar talla" | 1.5 |
| `lib/products/actions.ts` | precio, edición, activar/desactivar, departamento en lote, unión | 1.7, 1.6 |
| `components/products/ProductAdminSheet.tsx` | ficha interna | 1.7 |
| `lib/domain/size-duplicates.ts`, `app/productos/unir/` | candidatos y pantalla de unión | 1.6 |
| `lib/domain/movement-scope.ts`, `lib/inventory/movement-actions.ts`, `app/movimientos/` | historial | 1.9 |
| `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `components/layout/StaffLoadState.tsx` | sesión vencida y errores | 1.10 |
| `lib/public/whatsapp.ts`, `lib/public/tour-flag.ts`, `components/virtual-store/CatalogGrid.tsx` | catálogo sin datos inventados | 2.1 |
| `components/virtual-store/DepartmentChips.tsx` | filtro por departamento | 2.3 |
| `lib/public/urls.ts` | `CATALOG_URL` (hoy constante interna de `route.ts`) | 3.1 |
| `prisma/migrations/<timestamp>_add_product_types/`, `prisma/scripts/backfill-product-types.ts` | `ProductType`, `DepartmentProductType`, `Product.productTypeId/style/audience`, `SaleLine.productTypeId`; relleno idempotente | 3.8 |
| `lib/domain/product-types-catalog.ts`, `lib/domain/product-taxonomy.ts` | lista de tipos, pares y estilos; validación de clasificación y "Por revisar" | 3.8 |
| `lib/catalog/type-rule.ts`, `components/products/ClassificationFields.tsx` | regla del tipo leída de la base; campos Tipo, Estilo y Para | 3.8 |

---

# Fase 1. Registro de stock y control de inventario

### Tarea 1.4 (orden 1): guarda del seed (H5) · 1 h · demo sí · backend-data

**Rama:** `feat/seed-guard`

**Files:**
- Create: `prisma/local-db.ts`, `prisma/__tests__/seed-guard.test.ts`
- Modify: `prisma/seed.ts`, `test/db/guard.ts` (usa `isLocalDatabaseUrl`)

**Interfaces:**
- Produces: `isLocalDatabaseUrl(url: string): boolean` (hosts `127.0.0.1`, `localhost`, `::1`, `[::1]`); `assertSeedAllowed(env: NodeJS.ProcessEnv, argv: string[]): { demo: boolean }` exportada desde `prisma/seed.ts` (lanza `Error` en español). `main()` solo corre cuando el archivo es el punto de entrada, para que la prueba lo importe sin ejecutar.

**Mocks y fixtures:** `vi.mock("@prisma/client")` con un `PrismaClient` falso cuyos `upsert`/`create` son espías.

**Pruebas existentes que cambia:** ninguna.

- [ ] **Step 1: Pruebas** (`// @vitest-environment node`):
  - `NODE_ENV: "production"` con `DATABASE_URL` local → lanza `/producción/`.
  - `DATABASE_URL` con host `db.ejemplo.invalid` → lanza `/no es local/` y el `PrismaClient` falso no recibe ninguna llamada.
  - `localhost` con las cuatro `SEED_PASSWORD_*` → `{ demo: false }`; con `["--demo"]` → `{ demo: true }`.
  - falta `SEED_PASSWORD_COLAB2` → lanza `/SEED_PASSWORD_COLAB2/` antes de escribir.
  - `isLocalDatabaseUrl("postgresql://u:p@[::1]:5432/x")` → `true`.
- [ ] **Step 2:** `npx vitest run prisma/__tests__/seed-guard.test.ts` → FAIL (nada exportado).
- [ ] **Step 3:** Implementar. Seed: sin contraseñas por omisión; usuarios con `update: {}`; producto demo solo con `{ demo: true }`; `guard.ts` reutiliza `isLocalDatabaseUrl`.
- [ ] **Step 4:** Mismo comando → PASS; `npm run test:db` sigue en verde (guard reutilizado).
- [ ] **Step 5:** VE con `test:db`.
- [ ] **Step 6: Commit** `fix(seed): abortar fuera de una base local y sin contraseñas por omisión`.

### Tarea 1.12 (orden 2): CI con `test:db`, ESLint y Node (H16, H23) · 3 h · demo sí · qa-testing

Va al principio para que todas las tareas siguientes pasen por `npm run lint` y por la base en CI.

**Rama:** `feat/ci-db-lint`

**Files:**
- Create: `.eslintrc.json`, `lib/__tests__/eslint-boundaries.test.ts`
- Modify: `.github/workflows/ci.yml`, `.github/workflows/security.yml` (Node 24), `package.json` (`engines.node: ">=22"`; devDependencies `eslint@8`, `eslint-config-next@14.2.35`), `package-lock.json`

**Interfaces:**
- Produces: `npm run lint` (ya es `next lint`) sin preguntas y con salida 0. `.eslintrc.json`: `extends: "next/core-web-vitals"`; `overrides` para `components/virtual-store/**`, `lib/virtual-store/**`, `app/catalogo/**` con `no-restricted-imports` en error: `paths` `@prisma/client`, `@/lib/prisma`, `{ name: "@/lib/domain/types", importNames: ["Product"] }`; `patterns` `@/lib/generated/prisma*`, `@/lib/data/prisma*`; mensaje "Lo público usa solo PublicProduct".
- Job nuevo `db` en `ci.yml`: `services: postgres:16` (usuario y clave de CI evidentes), `TEST_DATABASE_URL` hacia `localhost`, `npx prisma migrate deploy` con `DATABASE_URL`, `DIRECT_URL` y `SHADOW_DATABASE_URL` locales, `npm run test:db`. Disparadores: `pull_request` y `push` a `main` y `feat/demo-alta-lote`. Paso `npm run lint` en `verify`. `setup-node` con `node-version: 24` en los dos workflows.

**Mocks y fixtures:** ninguno (API `ESLint` real, `// @vitest-environment node`).

**Pruebas existentes que cambia:** ninguna.

- [ ] **Step 1: Prueba** con `new ESLint({ cwd: process.cwd() }).lintText(code + "\nexport {};\n", { filePath })`:
  - en `components/virtual-store/X.tsx`, `import { PrismaClient } from "@prisma/client";`, `import prisma from "@/lib/prisma";` e `import type { Product } from "@/lib/domain/types";` producen cada uno un mensaje `ruleId === "no-restricted-imports"` con `severity === 2`;
  - el mismo `@prisma/client` en `lib/data/X.ts` → 0 mensajes de esa regla;
  - `import type { PublicProduct } from "@/lib/data/public-projection";` en la zona pública → 0.
- [ ] **Step 2:** `npx vitest run lib/__tests__/eslint-boundaries.test.ts` → FAIL (ESLint no instalado).
- [ ] **Step 3:** Instalar, crear `.eslintrc.json`, editar workflows y `engines`.
- [ ] **Step 4:** Prueba → PASS. `npm run lint` → 0. Errores en código viejo: arreglar los puntuales; si una regla falla en masa en la zona visual, dejarla en `warn` para esa carpeta y anotarlo en el PR (spec 1.12: sin reformateo en masa). Cada `eslint-disable-next-line` lleva `-- <motivo>`.
- [ ] **Step 5:** VE.
- [ ] **Step 6: Commit** `ci: pruebas de base, ESLint con fronteras de lo público y Node 24`.
- [ ] **Step 7 (DUEÑO):** autorizar el `push` de la rama y el PR. **(M)** el job `db` en verde con el número de pruebas. Una vez, en una rama desechable, quitar `available: { gte: … }` de `PrismaSalesDataSource.createSale` y comprobar que el job falla; anotarlo en el PR y borrar la rama.

### Tarea 1.3 (orden 3): rol y tienda de la base en todas las acciones (H4) · 4 h · demo sí · backend-data

**Rama:** `feat/permisos-base`

**Files:**
- Create: `lib/auth/permissions.ts`, `lib/auth/__tests__/permissions.test.ts`, `lib/__tests__/actions-permissions.test.ts`
- Modify: `lib/actions.ts` (todas las acciones; `requireSession` desaparece), `lib/auth/errors.ts` (`ForbiddenError`), `lib/auth/options.ts` (`session: { strategy: "jwt", maxAge: 12 * 60 * 60 }`), `lib/image/blob-url.ts` (`BLOB_PUBLIC_HOST`), `.env.example` (solo `BLOB_PUBLIC_HOST=""` con comentario), `components/products/ProductPhotoButton.tsx` (resultado tipado), llamadores de `fetchProductsAction`/`fetchLocationsAction`: `app/page.tsx`, `app/productos/page.tsx`, `app/etiquetas/page.tsx`, `app/pos/page.tsx`, `app/ventas/page.tsx`, `app/escanear/page.tsx` (solo `.then((r) => set(r ?? []))`; la UI de sesión vencida es la tarea 1.10)

**Interfaces:**
- Produces:
  - `class ForbiddenError extends Error` (mensaje para el operador).
  - `isStoreBound(user: CurrentUser): boolean` — colaborador, o manager con `locationId`.
  - `assertCanOperate(user: CurrentUser, locationId: string): void` — lanza `ForbiddenError` si es colaborador sin tienda o si `isStoreBound(user) && user.locationId !== locationId`.
  - `requireRole(user: CurrentUser, roles: readonly Role[]): void` — lanza `ForbiddenError`.
  - `currentUserOrNull(): Promise<CurrentUser | null>` — `null` ante `UnauthenticatedError`; relanza lo demás.
  - `fetchProductsAction(): Promise<Product[] | null>`, `fetchLocationsAction(): Promise<Location[] | null>` (`null` con sesión vencida).
  - `PhotoActionResult = { ok: true } | { ok: false; code: "SESSION" | "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "ERROR"; message: string }`, devuelto por `setProductBackImageAction(productId, url)` y `updateProductImageAction(productId, formData)`. Reglas: el producto existe y está activo (si no, NOT_FOUND); **reemplazar** una foto existente solo owner o manager (FORBIDDEN); poner la primera, cualquiera con sesión.
  - `createLocationAction` → lanza `ForbiddenError("Solo el dueño puede crear tiendas.")` salvo owner. `createProductAction`, `lookupCodeAction`, `uploadProductImageAction`, `changePasswordAction`, `getProductByBarcodeAction`, `getProductByVariantIdAction` usan `currentUserOrNull()`; el alta usa `assertCanOperate(user, input.locationId)`.
  - `isProductBlobUrl(value)`: si `process.env.BLOB_PUBLIC_HOST` existe (leído en cada llamada), exige `url.hostname === BLOB_PUBLIC_HOST`; si no, la regla de sufijo actual.
- Consumes: `getCurrentUser()` (`lib/auth/current-user.ts`), `UnauthenticatedError`.

**Mocks y fixtures:** `vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }))`, `vi.mock("next/cache")`, `vi.mock("@/lib/prisma")` (`brand`, `department`, `product.findUnique`), `vi.mock("@/lib/data/get-source")`, `vi.mock("@/lib/image/upload")`, `vi.mock("@/lib/auth/password")`. Ya **no** se simula `next-auth`.

**Pruebas existentes que cambia:** `lib/__tests__/actions-create-product.test.ts` (pasa de `getServerSession` a `getCurrentUser`; mismas aserciones), `components/__tests__/ProductosPhotos.test.tsx` (las acciones de foto devuelven `PhotoActionResult`).

- [ ] **Step 1: Pruebas puras** (`permissions.test.ts`): colaborador de `L` en `L` pasa y en `C` lanza `ForbiddenError`; colaborador sin tienda lanza; manager con `L` en `C` lanza; manager sin tienda y owner pasan en cualquiera; `requireRole(colab, ["owner", "manager"])` lanza; `currentUserOrNull` devuelve `null` si `getCurrentUser` rechaza con `UnauthenticatedError` y relanza otro `Error`.
- [ ] **Step 2: Pruebas de acciones** (`actions-permissions.test.ts`):
  - la base dice colaborador aunque el JWT diga owner → `createLocationAction` rechaza con `ForbiddenError`; `createProductAction` en otra tienda → `{ code: "FORBIDDEN" }`.
  - `getCurrentUser` rechaza con `UnauthenticatedError` (usuario borrado) → `fetchProductsAction()` y `fetchLocationsAction()` resuelven `null`; `createProductAction` → FORBIDDEN con `/inicia sesión/`.
  - manager con tienda `loc-lomas` y alta en `loc-clubalva` → FORBIDDEN.
  - `setProductBackImageAction("no-existe", url)` con `product.findUnique → null` → `{ ok: false, code: "NOT_FOUND" }` sin lanzar.
  - colaborador reemplazando una foto existente → FORBIDDEN; poniendo la primera → `{ ok: true }`.
  - con `vi.stubEnv("BLOB_PUBLIC_HOST", "abc.public.blob.vercel-storage.com")`, una URL de `otro.public.blob.vercel-storage.com/productos/x.jpg` → INVALID.
  - `fs.readFileSync("lib/actions.ts", "utf8")` no contiene `getServerSession` ni `session.user.role`.
- [ ] **Step 3:** `npx vitest run lib/auth lib/__tests__` → FAIL.
- [ ] **Step 4:** Implementar `permissions.ts`, `ForbiddenError`, las acciones, `maxAge`, `BLOB_PUBLIC_HOST`, `ProductPhotoButton` (muestra `result.message` si `ok: false`) y los seis llamadores con `?? []`. No tocar `lib/sales` ni `lib/catalog` (ya releen la base).
- [ ] **Step 5:** Mismo comando → PASS; las dos pruebas existentes listadas, actualizadas, en verde.
- [ ] **Step 6:** VE.
- [ ] **Step 7: Commit** `fix(auth): rol y tienda releídos de la base en todas las acciones y sesión de 12 h`.
- [ ] **Step 8 (DUEÑO):** avisar al personal que la sesión dura 12 h (se entra cada jornada).

### Tarea 1.1 (orden 4): migración aditiva `inventory_controls` · 2 h · demo sí · backend-data

**Rama:** `feat/inventory-controls-migration`

**Files:**
- Modify: `prisma/schema.prisma`, `lib/domain/types.ts` (`Product`), `lib/data/prisma-source.ts` (`getProducts` mapea los campos nuevos), `lib/data/fixture-source.ts` y `lib/data/fixtures.ts` (mismos campos), `docs/superpowers/specs/2026-11-05-modelo-datos-er.md` (nueva §2.8 "Control de inventario")
- Create: `prisma/migrations/20261110120000_inventory_controls/migration.sql` (generado), `prisma/__tests__/migrations-additive.test.ts`, `lib/data/__tests__/prisma-products.db.test.ts`

**Interfaces:**
- Produces (Prisma, del spec 1.1): `model PriceChange { id; variantId → Variant (Restrict); oldPrice Decimal(10,2); newPrice Decimal(10,2); changedById → User (Restrict); reason String? @db.VarChar(120); createdAt; @@index([variantId, createdAt(sort: Desc)]) }`; `Movement.requestId String? @unique`; `Product.mergedIntoId String?` (autorrelación `"ProductMerge"`, `onDelete: Restrict`, `@@index([mergedIntoId])`), `Product.mergedAt DateTime?`, `Product.mergedById String?` (FK a `User`, `Restrict`). Inversas: `Variant.priceChanges`, `User.priceChanges`, `User.productsMerged`, `Product.mergedFrom`.
- Produces (dominio): `Product` gana `brandId?: string | null`, `departmentId?: string | null`, `mergedIntoId?: string | null`, `createdAt?: string` (ISO; los usan 1.6 y 1.7). `InventoryDataSource` no cambia todavía.

**Mocks y fixtures:** `fixtures.ts`: los productos traen `brandId`, `departmentId`, `mergedIntoId: null` y `createdAt`.

**Pruebas existentes que cambia:** ninguna (campos opcionales).

- [ ] **Step 1: Prueba del SQL** (`// @vitest-environment node`): lee el `migration.sql` de la carpeta `*_inventory_controls`; contiene `CREATE TABLE "PriceChange"` y `ADD COLUMN "requestId"`; **no** contiene `DROP`, `ALTER COLUMN`, `SET NOT NULL` ni `CHECK`; ningún `ADD COLUMN` lleva `NOT NULL`.
- [ ] **Step 2: Prueba de base** `prisma-products.db.test.ts` (`describe.skipIf(!hasTestDb)`, `resetDb()` en `beforeEach`, `vi.mock("@/lib/prisma", async () => ({ default: (await import("../../../test/db/setup")).testPrisma }))`): un producto con `mergedIntoId` hacia otro → `new PrismaDataSource().getProducts()` devuelve `brandId`, `departmentId`, `mergedIntoId` y `createdAt`.
- [ ] **Step 3:** `npx vitest run prisma/__tests__` → FAIL (no hay migración).
- [ ] **Step 4:** Editar el esquema y generar el SQL contra Postgres local: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --script > prisma/migrations/20261110120000_inventory_controls/migration.sql` (`migrate dev` pide TTY; `SHADOW_DATABASE_URL` local). No editar el SQL. Mapear los campos en Prisma y Fixture. Escribir el ER §2.8 (tabla, columnas, propósito, "sale con las migraciones de ventas en 3.7").
- [ ] **Step 5:** `npx vitest run prisma/__tests__` → PASS; `npm run test:db` aplica la migración en la base local y pasa la prueba nueva.
- [ ] **Step 6:** VE con `test:db`.
- [ ] **Step 7: Commit** `feat(db): migración aditiva inventory_controls (historial de precios, idempotencia y unión)`.
- [ ] **Step 8 (DUEÑO):** en la rama de Neon `ventas-prueba`: `npx prisma migrate deploy` aplica; `npx prisma migrate status` → "Database schema is up to date!"; `npx prisma migrate diff --from-migrations prisma/migrations --to-url <URL de ventas-prueba> --shadow-database-url <local> --exit-code` → sin drift. Producción **no** (va en 3.7). Claude anota la fecha en la guía, sin valores.

### Tarea 1.2 (orden 5): movimientos de stock tipados y seguros; sin "Salida" (H3) · 5 h · demo sí · backend-data + frontend-pwa

**Rama:** `feat/stock-movements`

**Files:**
- Create: `lib/domain/stock-movement.ts`, `lib/domain/__tests__/stock-movement.test.ts`, `lib/data/__tests__/prisma-stock.db.test.ts`, `lib/__tests__/actions-stock.test.ts`, `components/inventory/StockMovementPanel.tsx`
- Modify: `lib/data/source.ts` (quita `adjustInventory`, agrega `recordStockMovement`), `lib/data/prisma-source.ts` (constructor `constructor(private readonly db: PrismaClient = prisma)`, como `PrismaSalesDataSource`; todos los métodos usan `this.db`), `lib/data/fixture-source.ts` (sin `Math.max`; registro `movements` en memoria), `lib/actions.ts` (quita `adjustInventoryAction`, agrega `recordStockMovementAction`), `app/escanear/page.tsx`

**Interfaces:**
- Produces:
  - `type StockMovementKind = "restock" | "damage" | "adjustment"`.
  - `validateStockMovement(input: unknown): { ok: true; value: { variantId: string; locationId: string; kind: StockMovementKind; delta: number; reason: string | null; requestId: string } } | { ok: false; message: string }` — `quantity` entero 1–200; `restock` suma; `damage` resta; `adjustment` exige `direction` `"in" | "out"`; `reason` obligatorio en `damage`/`adjustment` con las reglas de motivo; `requestId` UUID. También exporta `validateReason(raw: unknown, required: boolean): string | null` (lanza con el mensaje) para 1.7 y 1.8.
  - `InventoryDataSource.recordStockMovement(data: { variantId: string; locationId: string; type: "RESTOCK" | "DAMAGE" | "ADJUSTMENT"; delta: number; notes: string | null; requestId: string; userId: string }): Promise<{ available: number; replayed: boolean }>` — algoritmo del spec 1.2: transacción; `requestId` existente → `replayed: true`; entrada `upsert` con `increment`; salida `updateMany … gte` y `count === 0` → `InsufficientStockError(variantId, available ?? 0, n)` sin crear fila; `Movement` con tipo, `delta`, `notes`, `requestId`, `userId`; P2002 sobre `requestId` → `replayed: true` con el `available` actual.
  - `recordStockMovementAction(input: { variantId; locationId; kind; quantity; direction?; reason?; requestId }): Promise<StockMovementResult>` con `StockMovementResult` exactamente como spec 1.2. Permisos: `damage`/`adjustment` → `requireRole(user, ["owner", "manager"])`; todos → `assertCanOperate(user, locationId)`. INSUFFICIENT con `message: \`Solo hay ${available} en esta tienda.\`` y `available`. `revalidatePath("/catalogo")` y `("/productos")`.
- Consumes: `assertCanOperate`, `requireRole`, `currentUserOrNull` (1.3); `Movement.requestId` (1.1); `InsufficientStockError` (`lib/data/errors.ts`).

**Mocks y fixtures:** acción: `@/lib/auth/current-user`, `@/lib/data/get-source` (devuelve un `FixtureDataSource`), `next/cache`. Base: `new PrismaDataSource(testPrisma)` y dos clientes `new PrismaClient({ datasources: { db: { url } } })` como en `prisma-sales.db.test.ts`. Página: en el mock de `@/lib/actions` de `app/escanear/__tests__/page.test.tsx`, `adjustInventoryAction` → `recordStockMovementAction`.

**Pruebas existentes que cambia:** `lib/data/__tests__/fixture-duplicate.test.ts:51` (`adjustInventory` → `recordStockMovement` tipo `RESTOCK`), `app/escanear/__tests__/page.test.tsx` (mock y el caso "código existente … permite registrar movimiento" pasa a "Entrada").

- [ ] **Step 1: Pruebas puras:** cantidad `0`, `201`, `1.5`, `2 ** 31` → `ok: false`; `damage` sin motivo → `ok: false`; motivo `"ref 1234567"` (7 dígitos) → `ok: false`; `damage` 2 → `delta: -2`; `adjustment` `in` 3 → `delta: 3`; `restock` sin motivo → `ok: true`, `reason: null`.
- [ ] **Step 2: Pruebas de base** (criterios de spec 1.2): stock 1 y merma de 2 → `InsufficientStockError`, stock 1, 0 `Movement`; dos mermas de 1 en paralelo (dos clientes) sobre stock 1 → exactamente una resuelve; merma sobre variante sin fila → error y `inventoryLevel.count()` sin cambio; mismo `requestId` dos veces en paralelo → 1 `Movement` y una respuesta `replayed: true`; cada tipo con su `MovementType` y `notes`; tras una secuencia mixta, `available === inicial + Σ delta`.
- [ ] **Step 3: Pruebas de acción** (RF-5): colaborador con `damage` o `adjustment` → FORBIDDEN; `restock` del colaborador de `L` en `C` → FORBIDDEN; sesión vencida → SESSION; mismo `requestId` dos veces con el Fixture → la segunda `replayed: true` y `available` sin duplicar; `InsufficientStockError` → `{ code: "INSUFFICIENT", available: 1, message: "Solo hay 1 en esta tienda." }`.
- [ ] **Step 4: Pruebas de UI** en `page.test.tsx`: con producto existente no hay botón con nombre `/salida/i`; el primer botón del panel es "Entrada"; el texto "¿Vendiste la prenda? Regístrala en Vender." enlaza a `/pos`; con `role = "collaborator"` no aparece "Merma o corrección"; con `"manager"` sí, y enviar sin motivo muestra el error sin llamar a la acción; doble clic en "Entrada" → las dos llamadas llevan el **mismo** `requestId`.
- [ ] **Step 5:** `npx vitest run lib/domain lib/__tests__ app/escanear` y `npm run test:db` → FAIL.
- [ ] **Step 6: Diseño:** Si existe `docs/design/2026-11-09-stitch/merma-traspaso`, seguirlo; si no, seguir el comportamiento del spec v2 y las reglas: paleta #007272 (presionado #005F5F, texto blanco), 375 px, objetivos ≥ 44 px, español de México, prefers-reduced-motion.
- [ ] **Step 7:** Implementar dominio, data sources, acción y `StockMovementPanel` (props `{ variantId: string; locationId: string; role: Role; onDone(available: number): void }`; el `requestId` nace con `crypto.randomUUID` al abrir el formulario y se conserva en reintentos hasta un resultado definitivo). Antes de borrar `adjustInventory`, `grep -rn adjustInventory app lib components` → solo las líneas de este cambio.
- [ ] **Step 8:** Todas las pruebas → PASS.
- [ ] **Step 9:** VE con `test:db`.
- [ ] **Step 10: Commit** `feat(inventario): entradas, mermas y correcciones tipadas sin stock negativo; sin "Salida"`.

### Tarea 1.5 (orden 6): alta con varias tallas y "agregar talla" (H9) · 8 h · demo sí · backend-data + frontend-pwa

**Rama:** `feat/alta-tallas`

**Files:**
- Create: `lib/domain/sizes.ts`, `lib/domain/__tests__/sizes.test.ts`, `lib/data/__tests__/prisma-create-product.db.test.ts`, `lib/__tests__/actions-sizes.test.ts`, `components/products/SizeRows.tsx`, `components/products/AddSizeForm.tsx`, `components/products/ExistingProductSearch.tsx`, `components/__tests__/NewProductForm-sizes.test.tsx`
- Modify: `lib/domain/new-product.ts` (`sizes[]`), `lib/data/source.ts` (`CreateProductData.variants`, `addVariant`, `searchProducts`), `lib/data/errors.ts` (`InventoryRuleError`), `lib/data/prisma-source.ts`, `lib/data/fixture-source.ts`, `lib/actions.ts` (`createProductAction`, `addVariantAction`, `searchProductsAction`), `components/products/NewProductForm.tsx`, `app/escanear/page.tsx`

**Interfaces:**
- Produces:
  - `normalizeSize(raw: string): string` (recorta, colapsa espacios, letras en mayúsculas; vacío → `"U"`); `sortSizes(sizes: string[]): string[]`: XXS, XS, S, M, L, XL, XXL, XXXL; CH, M, G, XG; numéricas ascendentes; otras alfabéticas; `U` al final. Lo usa 2.2.
  - `NewProductInput.sizes: { size: string; barcode: string | null; price: number; initialStock: number }[]` (1–12) reemplaza `price`, `size` e `initialStock` sueltos; `validateNewProduct` rechaza 0 o 13 tallas, códigos repetidos y tallas repetidas sin código dentro del envío.
  - `CreateProductData.variants: { sku: string; barcode: string | null; size: string; price: number; initialStock: number }[]` reemplaza `barcode`, `sku`, `price`, `size`, `initialStock`. `createProduct(data): Promise<CreatedProduct>`, `CreatedProduct = { product: Product; variants: Variant[] }`; `Variant.title` = talla; un `RESTOCK` "alta" por talla con piezas; todo atómico.
  - `class InventoryRuleError extends Error` (regla de inventario incumplida; mensaje para el operador). Lo usan 1.6 y 1.8.
  - `InventoryDataSource.addVariant(data: { productId; sku; size; barcode: string | null; price; initialStock; locationId; userId }): Promise<VariantMatch>` — `InventoryRuleError` si el producto no está activo o tiene `mergedIntoId`, o si ya hay una variante activa de esa talla y `barcode === null` ("Esa talla ya existe: suma piezas con Entrada").
  - `InventoryDataSource.searchProducts(query: string): Promise<ProductSearchHit[]>` y `searchProductsAction(query: string): Promise<ProductSearchHit[] | null>`, `ProductSearchHit = { productId; title; brand; publicCode: string | null; imageUrl: string | null; sizes: string[] }`: código público exacto (`normalizePublicCode`) o `contains` insensible en título y marca; activos y sin unir; máximo 8; solo staff.
  - `CreateProductInput.sizes` (mismo shape); `CreateProductResult` en DUPLICATE gana `duplicateBarcode?: string`. `addVariantAction(input: { productId; size; barcode: string | null; price; initialStock; locationId }): Promise<CreateProductResult>`.
  - Códigos de barras a mayúsculas al escribir y al buscar (`canonicalCode`).
- Consumes: `assertCanOperate` (1.3); `Product.mergedIntoId` (1.1); `recordStockMovementAction` (1.2) para "Sumar piezas en tu tienda" (un `restock` en la tienda del usuario crea la fila).

**Mocks y fixtures:** acción: `@/lib/auth/current-user`, `@/lib/prisma` (`brand`, `department`), `@/lib/data/get-source`, `next/cache`. UI: el mock de `@/lib/actions` suma `searchProductsAction`, `addVariantAction` y `recordStockMovementAction`; `@/components/inventory/Scanner` simulado como en `page.test.tsx`. Base: `new PrismaDataSource(testPrisma)` y dos clientes para la carrera.

**Pruebas existentes que cambia** (llaman a `createProduct` o al formulario con campos sueltos; se migran al shape `sizes`/`variants` sin relajar aserciones): `lib/data/__tests__/fixture-source.test.ts`, `fixture-duplicate.test.ts`, `prisma-create-product.test.ts`, `public-projection.test.ts`, `lib/__tests__/actions-create-product.test.ts`, `app/api/whatsapp/webhook/__tests__/route.test.ts`, `app/api/bot/products/__tests__/route.test.ts`, `components/__tests__/NewProductForm.test.tsx`, `NewProductForm-errors.test.tsx`, `NewProductForm-modes.test.tsx`, `app/escanear/__tests__/page.test.tsx`.

- [ ] **Step 1: Pruebas puras:** `sortSizes(["L","S","XL","M"])` → `["S","M","L","XL"]`; `sortSizes(["28","30","U"])` → `["28","30","U"]`; `sortSizes(["G","CH","M"])` → `["CH","M","G"]`; `normalizeSize(" xl ")` → `"XL"`; `validateNewProduct` con 13 tallas, dos `M` sin código o dos filas con el mismo código → lanza.
- [ ] **Step 2: Pruebas de base** (RF-1): alta con 3 tallas (piezas 2, 0, 1) → 1 `Product`, 3 `Variant` con `title` = talla, 3 `InventoryLevel` en la tienda, 2 `Movement` `RESTOCK`, 1 `publicCode`; una de las 3 con código ya registrado → P2002 y `product.count()` sin cambio; dos altas en paralelo (dos clientes) con el mismo código → una crea, la otra P2002 en `barcode`; el código queda en mayúsculas.
- [ ] **Step 3: Pruebas de acción:** DUPLICATE trae `duplicateBarcode` y el título del producto que lo tiene; agregar `L` a un producto con `M` → 2 variantes y `toPublicProduct(...).sizes` con 2; misma talla sin código → INVALID "Esa talla ya existe: suma piezas con Entrada"; misma talla con código distinto → `ok: true`; colaborador en otra tienda → FORBIDDEN; producto inactivo o con `mergedIntoId` → INVALID; 13 tallas → INVALID; `searchProductsAction("k7q2m")` encuentra por código exacto y no devuelve productos unidos; sesión vencida → `null`.
- [ ] **Step 4: Pruebas de UI:** con código nuevo aparece primero "¿Es otra talla de un producto ya registrado?"; elegir un resultado (con foto de frente y tallas) muestra el mini formulario (talla, precio, piezas) y llama a `addVariantAction` con el código escaneado; "Es nuevo" muestra la sección **Tallas**; "Agregar otra talla" agrega una fila con el precio de la anterior; con DUPLICATE aparece "Sumar piezas en tu tienda" y llama a `recordStockMovementAction` con `kind: "restock"` en la tienda del usuario; con código existente la tarjeta muestra tallas con piezas de la tienda del usuario y los botones "Entrada" y "Agregar talla".
- [ ] **Step 5:** `npx vitest run lib/domain lib/__tests__ lib/data components/__tests__ app/escanear app/api` y `npm run test:db` → FAIL.
- [ ] **Step 6: Diseño:** Si existe `docs/design/2026-11-09-stitch/alta-tallas` (y `docs/design/2026-11-09-stitch/agregar-talla` para el mini formulario), seguirlo; si no, seguir el comportamiento del spec v2 y las reglas: paleta #007272 (presionado #005F5F, texto blanco), 375 px, objetivos ≥ 44 px, español de México, prefers-reduced-motion.
- [ ] **Step 7:** Implementar en este orden: dominio → `source.ts` → Prisma (`variants: { create: [...] }` y `movement.createMany`) → Fixture (mismas reglas de unicidad) → acciones → UI. Las fotos son del producto.
- [ ] **Step 8:** Todas las pruebas → PASS, incluidas las existentes migradas.
- [ ] **Step 9:** VE con `test:db`.
- [ ] **Step 10: Commit** `feat(alta): un producto con varias tallas y agregar talla a uno existente`.
- [ ] **Step 11 (M):** en un celular, un producto con 4 tallas y 2 fotos en menos de 3 minutos; anotar el tiempo en el PR.

### Tarea 1.7 (orden 7): editar precio y producto, desactivar, departamento en lote (H10) · 7 h · demo sí · backend-data + frontend-pwa

**Rama:** `feat/editar-producto`

**Files:**
- Create: `lib/products/actions.ts`, `lib/products/__tests__/actions.test.ts`, `lib/data/__tests__/prisma-price.db.test.ts`, `components/products/ProductAdminSheet.tsx`, `components/__tests__/ProductAdminSheet.test.tsx`
- Modify: `lib/data/source.ts`, `lib/data/prisma-source.ts`, `lib/data/fixture-source.ts` (métodos nuevos), `lib/sales/actions.ts` (`PRICE_CHANGED`), `app/pos/page.tsx` (aviso y actualización del carrito con `draft.setPrice` y `draft.renewRequestId`), `app/productos/page.tsx` (abre la ficha; selección múltiple)

**Interfaces:**
- Produces (en `lib/products/actions.ts`, `"use server"`, owner o manager con `requireRole`):
  - `updateVariantPriceAction(input: { variantId: string; newPrice: number; expectedPrice: number; reason?: string }): Promise<{ ok: true; price: number } | { ok: false; code: "SESSION" | "FORBIDDEN" | "INVALID" | "CONFLICT" | "NOT_FOUND"; message: string; currentPrice?: number }>` — precio > 0, ≤ `MAX_PRICE`, máximo 2 decimales (`roundToCents(x) !== x` → INVALID); igual al vigente → INVALID; motivo opcional con `validateReason` (1.2).
  - `listPriceChangesAction(variantId: string): Promise<PriceChangeRow[] | null>` — últimas 5, `PriceChangeRow = { oldPrice: number; newPrice: number; userName: string; createdAt: string }`.
  - `updateProductAction({ productId; title?; brandId?; departmentId?; category? })`, `setProductActiveAction(productId: string, active: boolean)`, `setVariantActiveAction(variantId: string, active: boolean)`, `assignDepartmentAction(productIds: string[], departmentId: string)` (1–100). Resultado común `ProductAdminResult = { ok: true; updated?: number } | { ok: false; code: "SESSION" | "FORBIDDEN" | "INVALID" | "NOT_FOUND"; message: string }`. Título 1–120; marca o departamento inactivos → INVALID; `publicCode` no cambia.
  - `InventoryDataSource`: `updateVariantPrice(variantId, expectedPrice, newPrice, userId, reason): Promise<{ ok: true; price: number } | { ok: false; currentPrice: number }>` (transacción: `variant.updateMany({ where: { id, price: expectedPrice }, data: { price: newPrice } })`; `count === 0` → `{ ok: false, currentPrice }`; si no, `PriceChange`), `listPriceChanges(variantId, limit)`, `updateProduct(id, patch)`, `setProductActive(id, active)`, `setVariantActive(id, active)`, `assignDepartment(ids, departmentId): Promise<number>`.
  - `SaleActionResult` (`lib/sales/actions.ts`) gana el código `"PRICE_CHANGED"` y `lines?: { variantId: string; price: number }[]`; `createSaleAction` lo devuelve al colaborador cuando algún `unitPrice` difiere del vigente.
- Consumes: `requireRole`, `currentUserOrNull` (1.3); `PriceChange`, `Product.brandId/departmentId` (1.1); `validateReason` (1.2).

**Mocks y fixtures:** acciones: `@/lib/auth/current-user`, `@/lib/data/get-source` (Fixture), `@/lib/prisma` (`brand`, `department`), `next/cache`. `/pos`: el mock de `@/lib/sales/actions` en `components/__tests__/PosPage.test.tsx`. Base: dos clientes para la carrera de precio; `PrismaSalesDataSource(testPrisma)` para venta y dashboard.

**Pruebas existentes que cambia:** `lib/sales/__tests__/actions.test.ts` (el caso del colaborador con precio distinto pasa de `INVALID` "Solo el dueño o el encargado pueden cambiar el precio." a `PRICE_CHANGED` con `lines`), `components/__tests__/PosPage.test.tsx` (caso nuevo; los existentes no cambian).

- [ ] **Step 1: Pruebas de base** (RF-3): dos `updateVariantPrice` en paralelo con el mismo `expectedPrice` → uno `ok: true`, otro `{ ok: false, currentPrice }`; 1 `PriceChange` con viejo, nuevo y `changedById`; producto desactivado → fuera de `getPublicCatalog(new PrismaDataSource(testPrisma))`, `createSale` con su variante lanza `SalesRuleError`, y `getDashboard` conserva sus ventas previas.
- [ ] **Step 2: Pruebas de acción:** colaborador o "JWT owner con colaborador en la base" → FORBIDDEN en las seis acciones; `newPrice: 10.005` → INVALID; igual al vigente → INVALID; `assignDepartmentAction` con 101 ids → INVALID; con 10 → `{ ok: true, updated: 10 }`; título `""` o de 121 → INVALID; marca inactiva → INVALID.
- [ ] **Step 3: Pruebas de `/pos`:** `createSaleAction` de colaborador con precio viejo → `{ ok: false, code: "PRICE_CHANGED", lines: [{ variantId: "v1", price: 120 }] }`; en `PosPage`, ese resultado actualiza el renglón, muestra "El precio de {prenda} cambió a $120. Revisa el total y cobra de nuevo." y el siguiente "Cobrar" usa **otro** `clientRequestId`.
- [ ] **Step 4: Pruebas de UI** `ProductAdminSheet.test.tsx`: owner ve "Guardar precio" por talla y las 5 entradas con el formato "$899 → $799 · Lolo · 10 nov 18:20" (hora de México); CONFLICT muestra el precio vigente; "Desactivar producto" pide confirmación; colaborador no ve controles de edición; el stock por tienda se muestra en lectura.
- [ ] **Step 5:** `npx vitest run lib/products lib/sales components/__tests__` y `npm run test:db` → FAIL.
- [ ] **Step 6: Diseño:** Si existe `docs/design/2026-11-09-stitch/ficha-interna`, seguirlo; si no, seguir el comportamiento del spec v2 y las reglas: paleta #007272 (presionado #005F5F, texto blanco), 375 px, objetivos ≥ 44 px, español de México, prefers-reduced-motion.
- [ ] **Step 7:** Implementar. `app/productos/page.tsx`: tocar un producto abre la ficha (owner/manager); casillas y botón "Asignar departamento" (owner/manager).
- [ ] **Step 8:** Todas las pruebas → PASS.
- [ ] **Step 9:** VE con `test:db`.
- [ ] **Step 10: Commit** `feat(productos): precio por talla con historial, edición, desactivar y departamento en lote`.

### Tarea 1.6 (orden 8): unir productos duplicados por talla (H9) · 6 h · demo sí · backend-data + frontend-pwa

**Rama:** `feat/unir-productos`

**Files:**
- Create: `lib/domain/size-duplicates.ts`, `lib/domain/__tests__/size-duplicates.test.ts`, `lib/data/__tests__/prisma-merge.db.test.ts`, `app/productos/unir/page.tsx`, `app/productos/unir/MergeGroups.tsx`, `components/__tests__/MergeGroups.test.tsx`
- Modify: `lib/products/actions.ts` (`mergeProductsAction`), `lib/data/source.ts`, `lib/data/prisma-source.ts`, `lib/data/fixture-source.ts` (`mergeProducts`, `getProductByPublicCode`), `lib/data/public-projection.ts` (`findPublicByCode`), `app/api/whatsapp/webhook/route.ts` (usa `findPublicByCode`), `app/productos/page.tsx` (enlace a `/productos/unir` solo para owner)

**Interfaces:**
- Produces:
  - `findSizeDuplicateGroups(products: Product[]): DuplicateGroup[]`, `DuplicateGroup = { key: string; products: Product[]; suggestedTargetId: string }`. Clave: `brandId` + título normalizado (minúsculas, sin acentos con `normalize("NFD")`, espacios colapsados, sin la talla final `" - M"` / `" talla M"`) + `departmentId`. Solo grupos de 2+ activos y sin unir. Sugerido: el de las dos fotos; empate → `createdAt` menor.
  - `mergeProductsAction({ targetId: string; sourceIds: string[] }): Promise<MergeResult>`, `MergeResult = { ok: true; movedVariants: number; movedSaleLines: number; alreadyMerged: number } | { ok: false; code: "SESSION" | "FORBIDDEN" | "INVALID"; message: string }`. Solo owner (`requireRole(user, ["owner"])`).
  - `InventoryDataSource.mergeProducts(targetId: string, sourceIds: string[], userId: string): Promise<{ movedVariants: number; movedSaleLines: number; alreadyMerged: number }>` — algoritmo del spec 1.6: `SELECT … FOR UPDATE` con `$queryRaw` parametrizado sobre todos los ids **ordenados**; misma `brandId`; destino activo y sin unir; origen ya unido a este destino → `alreadyMerged`; unido a otro → `InventoryRuleError`; mueve `Variant.productId` y `SaleLine.productId`, nunca `SaleLine.departmentId`; copia las URL de fotos si al destino le falta una y el origen tiene las dos; orígenes `isActive: false`, `mergedIntoId`, `mergedAt`, `mergedById`; `product.updateMany({ where: { mergedIntoId: { in: sourceIds } }, data: { mergedIntoId: targetId } })` para no dejar cadenas.
  - `InventoryDataSource.getProductByPublicCode(code: string): Promise<Product | null>` — `findUnique` por `publicCode` y, si tiene `mergedIntoId`, un salto al destino.
  - `findPublicByCode(ds: InventoryDataSource, code: string): Promise<PublicProduct | null>` — resuelve con `getProductByPublicCode` y proyecta solo si es público (activo, dos fotos, alguna talla activa). Lo usan el webhook (aquí), 2.2 y 3.1.
- Consumes: `Product.brandId/departmentId/mergedIntoId/createdAt` (1.1), `requireRole` (1.3), `InventoryRuleError` y productos con varias tallas (1.5).

**Mocks y fixtures:** acción: `@/lib/auth/current-user`, `@/lib/data/get-source` (Fixture), `next/cache`. Webhook: el `state.ds` Fixture de `route.test.ts`, con dos productos y `mergeProducts`. Base: `new PrismaDataSource(testPrisma)` + `PrismaSalesDataSource(testPrisma)` para ventas y dashboard; dos clientes para la carrera. UI: mock de `@/lib/products/actions`.

**Pruebas existentes que cambia:** `app/api/whatsapp/webhook/__tests__/route.test.ts` (casos nuevos; los existentes siguen igual porque `findPublicByCode` devuelve el mismo producto público).

- [ ] **Step 1: Pruebas puras:** "Polo Nautica - M" y "Polo Nautica talla L" (misma marca y departamento) forman grupo; con distinto departamento, no; acentos y mayúsculas no separan; sugerido = el de dos fotos; empate → `createdAt` menor.
- [ ] **Step 2: Pruebas de base** (RF-2): A (M, con 1 venta) + B (L, con 2 movimientos) en A → A con 2 variantes; B `isActive: false`, `mergedIntoId: A`; `SaleLine` de B con `productId: A` y `departmentId` intacto; mismo número de `Movement`; Σ `available` por tienda igual; `getDashboard` (vendido de hoy y `byBrand`) idéntico antes y después; repetir → `alreadyMerged: 1` sin cambios; A←B y B←C en paralelo → ambas terminan y ningún `mergedIntoId` apunta a un producto unido; marcas distintas → `InventoryRuleError`; `getProductByPublicCode(<código de B>)` → A.
- [ ] **Step 3: Pruebas de acción:** manager, colaborador o JWT de owner degradado → FORBIDDEN; `sourceIds` vacío o que incluye `targetId` → INVALID.
- [ ] **Step 4: Prueba del webhook:** tras unir B en A, `send("Código <código de B> talla M")` responde con el título de A.
- [ ] **Step 5: Pruebas de UI:** grupos con foto, talla y piezas por tienda; el sugerido marcado; la confirmación lista lo que se mueve ("Se moverán 1 talla y 2 ventas a «Polo Nautica»") antes de llamar a la acción; no-owner ve "Solo el dueño puede unir productos.".
- [ ] **Step 6:** `npx vitest run lib/domain lib/products components/__tests__/MergeGroups.test.tsx app/api` y `npm run test:db` → FAIL.
- [ ] **Step 7: Diseño:** pantalla fuera de la lista de Stitch: seguir el comportamiento del spec v2 y las reglas: paleta #007272 (presionado #005F5F, texto blanco), 375 px, objetivos ≥ 44 px, español de México, prefers-reduced-motion.
- [ ] **Step 8:** Implementar; `/productos/unir` es server component con `getCurrentUser()`.
- [ ] **Step 9:** Todas las pruebas → PASS.
- [ ] **Step 10:** VE con `test:db`.
- [ ] **Step 11: Commit** `feat(productos): unir productos duplicados por talla conservando ventas y código público`.
- [ ] **Step 12 (DUEÑO, en el ensayo de la demo):** primera unión real en el Preview contra `ventas-prueba`; nunca en producción antes de 3.7.

### Tarea 1.8 (orden 9): traspasos entre tiendas (H22) · 4 h · demo sí · backend-data + frontend-pwa

**Rama:** `feat/traspasos`

**Files:**
- Create: `lib/data/__tests__/prisma-transfer.db.test.ts`, `lib/__tests__/actions-transfer.test.ts`
- Modify: `lib/data/source.ts`, `lib/data/prisma-source.ts`, `lib/data/fixture-source.ts` (`transferStock`), `lib/actions.ts` (`transferStockAction`), `components/inventory/StockMovementPanel.tsx` ("Traspasar")

**Interfaces:**
- Produces:
  - `InventoryDataSource.transferStock(data: { variantId; fromLocationId; toLocationId; quantity; requestId; note: string | null; userId }): Promise<{ available: number; replayed: boolean }>` (`available` del origen). Algoritmo del spec 1.8: existe `"<requestId>:out"` → `replayed`; filas en orden de `locationId`; origen `updateMany … gte` (si `count === 0`, `InsufficientStockError` y rollback); destino `upsert` con `increment`; dos `Movement` `TRANSFER` (−n con `"<requestId>:out"`, +n con `"<requestId>:in"`) y la misma `notes`.
  - `transferStockAction(input: { variantId; fromLocationId; toLocationId; quantity; requestId; note? }): Promise<StockMovementResult>` — owner o manager; manager con tienda solo si origen **o** destino es la suya; origen = destino → INVALID; cantidad 1–200; nota con `validateReason(note, false)`. Éxito con mensaje "Se movieron N de {origen} a {destino}." (nombres de `getLocations()`); el tipo `StockMovementResult` gana `message?: string` en `ok: true`.
- Consumes: `StockMovementResult`, `validateReason` (1.2); `requireRole` (1.3); `Movement.requestId` (1.1).

**Mocks y fixtures:** como 1.2; base con `PrismaSalesDataSource(testPrisma)` para la carrera con una venta; UI: mock de `@/lib/actions` de `page.test.tsx` con `transferStockAction`.

**Pruebas existentes que cambia:** ninguna (casos nuevos en `app/escanear/__tests__/page.test.tsx`; los de 1.2 no cambian).

- [ ] **Step 1: Pruebas de base** (RF-4): stock 1 en Lomas, traspaso de 1 en paralelo con `createSale` de 1 en Lomas → exactamente una resuelve y nada queda negativo; Σ de las dos tiendas no cambia con un traspaso; dos traspasos opuestos en paralelo terminan los dos (sin interbloqueo); mismo `requestId` dos veces → 2 `Movement` en total y la segunda `replayed: true`.
- [ ] **Step 2: Pruebas de acción:** origen = destino → INVALID; manager de Lomas de ClubAlva al almacén → FORBIDDEN; colaborador → FORBIDDEN; sesión vencida → SESSION.
- [ ] **Step 3: Prueba de UI:** con manager, "Traspasar" pide origen, destino, cantidad y nota y muestra "Se movieron 2 de Lomas a ClubAlva."; con colaborador el botón no aparece.
- [ ] **Step 4:** `npx vitest run lib/__tests__ app/escanear` y `npm run test:db` → FAIL.
- [ ] **Step 5: Diseño:** Si existe `docs/design/2026-11-09-stitch/merma-traspaso`, seguirlo; si no, seguir el comportamiento del spec v2 y las reglas: paleta #007272 (presionado #005F5F, texto blanco), 375 px, objetivos ≥ 44 px, español de México, prefers-reduced-motion.
- [ ] **Step 6:** Implementar.
- [ ] **Step 7:** Pruebas → PASS.
- [ ] **Step 8:** VE con `test:db`.
- [ ] **Step 9: Commit** `feat(inventario): traspasos entre tiendas atómicos e idempotentes`.

### Tarea 1.9 (orden 10): historial de movimientos (RF-INV-09) · 4 h · demo sí · backend-data + frontend-pwa

**Rama:** `feat/movimientos`

**Files:**
- Create: `lib/domain/movement-scope.ts`, `lib/domain/__tests__/movement-scope.test.ts`, `lib/inventory/movement-actions.ts`, `lib/inventory/__tests__/movement-actions.test.ts`, `lib/data/__tests__/prisma-movements.db.test.ts`, `app/movimientos/page.tsx`, `app/movimientos/MovementList.tsx`, `components/__tests__/MovementList.test.tsx`
- Modify: `lib/data/source.ts`, `lib/data/prisma-source.ts`, `lib/data/fixture-source.ts` (`listMovements` sobre el registro en memoria de 1.2), `components/layout/NavBar.tsx` (enlace "Movimientos" para staff)

**Interfaces:**
- Produces:
  - `MovementQuery = { locationIds: string[] | "all"; type?: MovementType; userId?: string; variantId?: string; from: string; to: string; cursor?: string }` (fechas `YYYY-MM-DD` de México, inclusivas; `MovementType` como el enum de Prisma, exportado desde `lib/domain/types.ts`).
  - `scopeMovementQuery(user: { role: Role; locationId: string | null }, requested: MovementFilter, today: string): { ok: true; query: MovementQuery } | { ok: false; message: string }` — colaborador → su tienda y `from = to = today`; manager con tienda → su tienda; rango > 93 días → `ok: false`; por omisión hoy. Mismo estilo que `scopeDashboardQuery`.
  - `MovementRow = { id: string; timestamp: string; productTitle: string; size: string; locationName: string; type: MovementType; typeLabel: string; delta: number; userName: string; notes: string | null; saleNumber: number | null }` (sin `customerAlias`). Etiquetas: `SALE` Venta, `RESTOCK` Entrada, `DAMAGE` Merma, `ADJUSTMENT` Corrección, `TRANSFER` Traspaso, `RETURN` Devolución.
  - `InventoryDataSource.listMovements(q: MovementQuery): Promise<MovementPage>`, `MovementPage = { rows: MovementRow[]; nextCursor: string | null }` — `orderBy: [{ timestamp: "desc" }, { id: "desc" }]`, `take: 51` para saber si hay más; cursor = `id` del último renglón (Prisma `cursor` + `skip: 1`).
  - `listMovementsAction(filter: MovementFilter): Promise<MovementPage | { error: string } | null>`, `MovementFilter = { locationId?; type?; userId?; variantId?; from?; to?; cursor? }` (`null` con sesión vencida; `{ error }` para el rango inválido, en vez del INVALID del spec, porque la acción nunca lanza).
- Consumes: `currentUserOrNull` (1.3); movimientos tipados de 1.2 y 1.8; `ExistingProductSearch` (1.5); `businessTodayMx` (`lib/sales/format.ts`).

**Mocks y fixtures:** acción: `@/lib/auth/current-user`, `@/lib/data/get-source` (Fixture con movimientos). UI: mock de `@/lib/inventory/movement-actions` y de `next/navigation`. Base: `new PrismaDataSource(testPrisma)`.

**Pruebas existentes que cambia:** `components/__tests__/NavBar.test.tsx` (se agrega el enlace; los casos existentes no cambian).

- [ ] **Step 1: Pruebas puras:** colaborador pidiendo otra tienda y otro día → su tienda y hoy; 94 días → `ok: false`; 93 → `ok: true`; owner sin filtros → `"all"` y hoy.
- [ ] **Step 2: Pruebas de base:** 120 movimientos con `timestamp` repetidos → tres páginas por cursor sin repetidos ni huecos (unión de ids = 120); `saleNumber` presente en los `SALE`; ningún renglón tiene la clave `customerAlias`.
- [ ] **Step 3: Pruebas de acción y UI:** sesión vencida → `null`; 94 días → `{ error }` mostrado en `role="alert"`; renglón con fecha y hora de México, "Merma", `−1`, quién y motivo; "Ver más" pide la siguiente página con `nextCursor` y desaparece con `null`.
- [ ] **Step 4:** `npx vitest run lib/domain lib/inventory components/__tests__` y `npm run test:db` → FAIL.
- [ ] **Step 5: Diseño:** Si existe `docs/design/2026-11-09-stitch/movimientos`, seguirlo; si no, seguir el comportamiento del spec v2 y las reglas: paleta #007272 (presionado #005F5F, texto blanco), 375 px, objetivos ≥ 44 px, español de México, prefers-reduced-motion.
- [ ] **Step 6:** Implementar (filtro de prenda: escanear o `ExistingProductSearch`).
- [ ] **Step 7:** Pruebas → PASS.
- [ ] **Step 8:** VE con `test:db`.
- [ ] **Step 9: Commit** `feat(inventario): historial de movimientos con filtros y paginación`.
- [ ] **Step 10 (M):** el owner encuentra quién hizo una merma en una fecha (en el ensayo de la demo).

### Tarea 1.10 (orden 11): pantallas de staff con sesión vencida y login (H8) · 3 h · demo sí · frontend-pwa

**Rama:** `feat/sesion-vencida`

**Files:**
- Create: `components/layout/StaffLoadState.tsx`, `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `components/__tests__/StaffPages-session.test.tsx`, `components/__tests__/LoginPage.test.tsx`
- Modify: `app/page.tsx`, `app/productos/page.tsx`, `app/etiquetas/page.tsx`, `app/login/page.tsx`

**Interfaces:**
- Produces: `useStaffData<T>(load: () => Promise<T | null>): { state: "loading" | "ready" | "session" | "error"; data: T | null; retry(): void }` y `<StaffLoadState state={…} retry={…} />` en `StaffLoadState.tsx`, con "Cargando…", `SESSION_EXPIRED_TEXT` + `LoginLink` (de `components/sales/session-expired.tsx`) y "No hay conexión. Reintentar.". Login con el contrato de spec 1.10.
- Consumes: `fetchProductsAction(): Promise<Product[] | null>` y `fetchLocationsAction()` (1.3).

**Mocks y fixtures:** `vi.mock("@/lib/actions")` con `fetchProductsAction` configurable (`null`, rechazo, promesa pendiente); `next-auth/react` (`signIn`, `useSession`); `next/navigation` (`useRouter`, `usePathname`, `useSearchParams`).

**Pruebas existentes que cambia:** `components/__tests__/ProductosPhotos.test.tsx` solo si renderiza `/productos` sin esperar la carga (agregar `await findBy…`; las aserciones no cambian).

- [ ] **Step 1: Pruebas:** en `/`, `/productos` y `/etiquetas`: con `null` → "Tu sesión terminó. Vuelve a iniciar sesión." y enlace a `/login`; con rechazo → "No hay conexión. Reintentar." y el botón vuelve a llamar; con promesa pendiente → "Cargando…" y ningún texto `/\b0 productos\b/`. Login: teclear `" lolo "` → `signIn` recibe `username: "lolo"`; el input tiene `autoCapitalize="none"`, `autoComplete="username"`, `spellCheck` falso y `getByLabelText("Usuario")` lo encuentra; si `signIn` lanza, el botón vuelve a estar habilitado y hay un `role="alert"`.
- [ ] **Step 2:** `npx vitest run components/__tests__/StaffPages-session.test.tsx components/__tests__/LoginPage.test.tsx` → FAIL.
- [ ] **Step 3: Diseño:** sin pantalla de Stitch: seguir el comportamiento del spec v2 y las reglas: paleta #007272 (presionado #005F5F, texto blanco), 375 px, objetivos ≥ 44 px, español de México, prefers-reduced-motion.
- [ ] **Step 4:** Implementar; `error.tsx` y `global-error.tsx` con "Algo falló. Reintentar." (`reset()`); `not-found.tsx` con enlace al inicio.
- [ ] **Step 5:** Pruebas → PASS.
- [ ] **Step 6:** VE.
- [ ] **Step 7: Commit** `fix(staff): estados de carga, sesión vencida y sin conexión; login sin mayúscula automática`.
- [ ] **Step 8 (M):** en Android, sesión vencida en las tres pantallas.

### Tarea 1.11 (orden 12; arranca hoy en paralelo): pooler de Neon (H12) · 1.5 h · demo sí · DUEÑO + devops-deploy

Sin código ni rama. Bloquea la demo.

- [ ] **Step 1 (Claude):** confirmar en la documentación vigente de Prisma 5.22 los parámetros para PgBouncer [C: `pgbouncer=true&connection_limit=1`] y escribirlos en la guía de salida (nombres de parámetros, sin hosts ni valores).
- [ ] **Step 2 (DUEÑO):** en Vercel, `DATABASE_URL` de **Preview acotado a la rama `feat/demo-alta-lote`** = URL del *pooler* (host con `-pooler`) de `ventas-prueba` con esos parámetros. Production no se toca hasta 3.4/3.7. `DIRECT_URL` solo en el `.env` local.
- [ ] **Step 3 (DUEÑO + Claude, M):** en el Preview, dos ventas en paralelo desde dos celulares, un alta con 3 tallas y un traspaso, sin `P2028` ni "prepared statement" en Runtime Logs. Claude anota fecha y resultado en la guía, sin valores.

---

# Fase 2. Catálogo

### Tarea 2.1 (orden 13; puede adelantarse porque no depende de nada): catálogo sin datos inventados; WhatsApp por variable (H6) · 3 h · demo sí · frontend-pwa (+ visual-design)

**Rama:** `feat/catalogo-sin-inventos`

**Files:**
- Create: `lib/public/whatsapp.ts`, `lib/public/tour-flag.ts`, `lib/public/__tests__/whatsapp.test.ts`, `lib/public/__tests__/tour-flag.test.ts`, `components/virtual-store/CatalogGrid.tsx`, `components/__tests__/CatalogGrid.test.tsx`, `lib/__tests__/no-invented-content.test.ts`, `app/catalogo/__tests__/page.test.tsx`
- Modify: `components/virtual-store/VirtualStoreCatalog.tsx` (abre en `"grid"`; recorrido, contador y cajón solo con `isTourEnabled`), `components/virtual-store/ProductHotspotModal.tsx` (props `{ product: PublicProduct | null; shelfLabel?: string; onClose: () => void }`; quita el número de ejemplo de la línea 31), `components/products/ProductCard3D.tsx` (`waLink: string | null`; `null` → `NO_WHATSAPP_TEXT`), `components/virtual-store/VirtualStoreCanvas.tsx` (quita los textos fijos de las líneas 217 y 294), `lib/virtual-store/zones.ts` (los textos de `DEFAULT_HOTSPOTS_CONFIG` se reemplazan por etiquetas neutras de repisa; no se borra `zones.ts`), `.env.example` (comentario de `NEXT_PUBLIC_WHATSAPP_NUMBER` con `<número ficticio 52XXXXXXXXXX>`; línea `NEXT_PUBLIC_SALA_VIRTUAL=""` con "1 = ofrecer la sala virtual de prueba (solo previews)")

**Interfaces:**
- Produces:
  - `getWhatsAppNumber(): string | null` — lee `process.env.NEXT_PUBLIC_WHATSAPP_NUMBER` con acceso literal (para que Next lo incruste) y acepta solo `^52\d{10}$`.
  - `productInquiryMessage(p: PublicProduct, size?: string): string` — con talla, exactamente `Hola, me interesa {marca} {nombre} en talla {talla}. ¿Sigue disponible? Código {codigo}`; sin talla, `Hola, me interesa {marca} {nombre}. ¿Qué tallas tienen? Código {codigo}`; sin `publicCode` omite ` Código …`; nombre recortado a 80; total ≤ 300.
  - `whatsAppLink(number: string, text: string): string` — `https://wa.me/${number}?text=${encodeURIComponent(text)}`.
  - `NO_WHATSAPP_TEXT = "Consulta disponibilidad en tienda."`, `EMPTY_CATALOG_TEXT = "Pronto verás aquí las prendas de la tienda."`.
  - `isTourEnabled(zones: ReadonlyArray<{ kind?: "virtual" | "real" }>): boolean` — `NEXT_PUBLIC_SALA_VIRTUAL === "1"` o alguna zona `kind === "real"` (hoy ninguna).
  - `CatalogGrid({ products, onSelect }: { products: PublicProduct[]; onSelect: (p: PublicProduct) => void })` — `<ul aria-label="Prendas">` con un `<li>` por producto; itera `products`, no `hotspots`.
- Consumes: `PublicProduct` tal como está.

**Mocks y fixtures:** `vi.stubEnv` para las dos variables y `vi.unstubAllEnvs()` en `afterEach`; `next/navigation` (`usePathname`, `useSearchParams`, `useRouter`): el mock de `VirtualStore.test.tsx` hoy solo trae `usePathname` y se amplía; `window.matchMedia` en `vitest.setup.ts` si falta.

**Pruebas existentes que cambia:** `components/__tests__/VirtualStore.test.tsx` (el modal recibe `product`; el caso "modo recorrido 3D" corre con `NEXT_PUBLIC_SALA_VIRTUAL=1`), `lib/virtual-store/__tests__/zones.test.ts` (sus datos de prueba con la marca "LoloTech" pasan a "Marca de prueba" y los títulos fijos a los neutros). Ninguna aserción se relaja.

- [ ] **Step 1: Pruebas de módulo:** sin variable, `"52 0000 000000"`, `"52000000000a"`, `"521" + "0".repeat(10)` (13 dígitos) y `"1" + "0".repeat(11)` → `null`; `"52" + "0".repeat(10)` → ese valor; mensaje exacto con y sin talla; sin código no contiene "Código"; recortes a 80 y 300; el mensaje no contiene el `id` ni `/apart/i`; `isTourEnabled` con `[]` (false), `"1"` (true), `[{ kind: "real" }]` (true), `[{ kind: "virtual" }]` (false).
- [ ] **Step 2: Pruebas de catálogo:** sin bandera y 12 productos → 12 `listitem` dentro de "Prendas", sin "Recorrido 3D", sin `shelfLabel`, `title` ni `brand` de `DEFAULT_HOTSPOTS_CONFIG`; con 0 → `EMPTY_CATALOG_TEXT`; con número válido, el `href` del modal empieza con `https://wa.me/<número>?text=` y el texto decodificado trae `Código K7Q2M` y la talla elegida, sin `sku`, `barcode` ni el `id`; sin número → sin `a[href^="https://wa.me"]` y con `NO_WHATSAPP_TEXT`; el HTML no coincide con `/LS-[A-Z0-9]|sku|barcode|piezas|existencias/i`; `page.dynamic === "force-dynamic"`.
- [ ] **Step 3: Prueba de contenido inventado** (`// @vitest-environment node`): recorre `app/`, `components/`, `lib/` (`.ts`/`.tsx`, sin `__tests__`) y ningún archivo contiene el número de ejemplo que hoy está en la línea 31 de `ProductHotspotModal.tsx` (la prueba arma la cadena concatenando dos mitades, para no contenerla), `"Ghost Puffer"`, `"LoloTech"`, ni coincide con `/\bapart(a|as|ado|ados|ar|o)\b/i` (no atrapa "aparte").
- [ ] **Step 4:** `npx vitest run lib/public lib/__tests__/no-invented-content.test.ts components/__tests__ app/catalogo lib/virtual-store` → FAIL.
- [ ] **Step 5: Diseño:** Si existe `docs/design/2026-11-09-stitch/catalogo-cuadricula` (y `docs/design/2026-11-09-stitch/modal-publico` para el modal), seguirlo; si no, seguir el comportamiento del spec v2 y las reglas: paleta #007272 (presionado #005F5F, texto blanco), 375 px, objetivos ≥ 44 px, español de México, prefers-reduced-motion.
- [ ] **Step 6:** Implementar. Tarjeta de esta tarea: foto de frente, marca, nombre, precio (las tallas en la tarjeta son 2.2).
- [ ] **Step 7:** Pruebas → PASS.
- [ ] **Step 8:** VE.
- [ ] **Step 9: Commit** `fix(catalogo): cuadrícula con todos los productos, WhatsApp por variable y sin datos de ejemplo`.

### Tarea 2.2 (orden 14): una tarjeta por producto con tallas · 4 h · demo sí · frontend-pwa + backend-data

**Rama:** `feat/catalogo-tallas`

**Files:**
- Create: `lib/data/__tests__/public-contract.db.test.ts`
- Modify: `lib/data/public-projection.ts` (`sizes[].price`, orden con `sortSizes`, `getPublicCatalog` usa `getCatalogProducts`), `lib/data/source.ts`, `lib/data/prisma-source.ts`, `lib/data/fixture-source.ts` (`getCatalogProducts`), `components/virtual-store/CatalogGrid.tsx` (chips), `components/virtual-store/ProductHotspotModal.tsx` (precio por talla), `app/api/bot/products/route.ts` (sin cambio de lógica; su prueba cubre el filtro)

**Interfaces:**
- Produces:
  - `PublicProduct.sizes: { size: string; available: boolean; price: number }[]`, ordenadas con `sortSizes`; si dos variantes activas comparten talla: el precio menor y `available` si alguna lo está. `price` de producto = el menor de las tallas activas.
  - `InventoryDataSource.getCatalogProducts(): Promise<Product[]>` — `where: { isActive: true, mergedIntoId: null, imageUrl: { not: null }, backImageUrl: { not: null } }`, `orderBy: [{ createdAt: "desc" }, { id: "asc" }]`; Fixture con el mismo filtro y orden. `getPublicCatalog` lo usa y deja de filtrar `isActive`/fotos en memoria.
  - Tarjeta: hasta 6 chips y luego `+N`; talla agotada tachada con nombre accesible `"{talla}, agotada"`; todas agotadas → "Agotado"; precios distintos → `Desde $X`.
- Consumes: `sortSizes` (1.5), `Product.mergedIntoId` (1.1), `findPublicByCode` (1.6; el salto del bot ya está hecho), `CatalogGrid` (2.1).

**Mocks y fixtures:** UI como 2.1. Base: `new PrismaDataSource(testPrisma)` y `new FixtureDataSource()` sembrados con los mismos datos.

**Pruebas existentes que cambia:** `lib/data/__tests__/public-projection.test.ts` (la lista de claves de `sizes` suma `price`; las aserciones de que no hay `sku`, `barcode` ni conteos se conservan), `components/__tests__/CatalogGrid.test.tsx` de 2.1 (el fixture suma `price` en `sizes`; aserciones intactas).

- [ ] **Step 1: Pruebas:** S agotada y M disponible a 300 y 350 → "Desde $300" y el chip S con nombre accesible "S, agotada"; 8 tallas → 6 chips y "+2"; todas agotadas → "Agotado"; en el modal, elegir M muestra $350 y el mensaje de WhatsApp lleva "talla M".
- [ ] **Step 2: Prueba de contrato** (`test:db`, cierra Pruebas A4): el mismo producto sembrado en Prisma y Fixture → `getPublicCatalog` devuelve objetos con **las mismas claves exactas** (recursivo) y sin `sku`, `barcode`, `inventory` ni `available` a nivel producto; un producto unido no aparece; orden `createdAt desc, id asc`.
- [ ] **Step 3:** `npx vitest run lib/data components/__tests__/CatalogGrid.test.tsx` y `npm run test:db` → FAIL.
- [ ] **Step 4: Diseño:** Si existe `docs/design/2026-11-09-stitch/catalogo-cuadricula` (y `docs/design/2026-11-09-stitch/modal-publico`), seguirlo; si no, seguir el comportamiento del spec v2 y las reglas: paleta #007272 (presionado #005F5F, texto blanco), 375 px, objetivos ≥ 44 px, español de México, prefers-reduced-motion.
- [ ] **Step 5:** Implementar.
- [ ] **Step 6:** Pruebas → PASS.
- [ ] **Step 7:** VE con `test:db`.
- [ ] **Step 8: Commit** `feat(catalogo): una tarjeta por producto con tallas, precio por talla y agotados accesibles`.

### Tarea 2.3 (orden 15): filtro por departamento y "Ver más" · 3 h · demo sí · frontend-pwa + backend-data

**Rama:** `feat/catalogo-departamentos`

**Files:**
- Create: `components/virtual-store/DepartmentChips.tsx`, `components/__tests__/CatalogDepartments.test.tsx`
- Modify: `lib/domain/types.ts` (`Product.department?: { slug: string; name: string; sortOrder: number; isActive: boolean } | null`), `lib/data/prisma-source.ts` (`getProducts` y `getCatalogProducts` con `include: { department: true }`), `lib/data/fixture-source.ts`, `lib/data/fixtures.ts` (`FIXTURE_DEPARTMENTS`: `dama` 1, `caballero` 2, `ninos` 3, `calzado` 4, `accesorios` 5; ids `dep-<slug>`), `lib/data/public-projection.ts` (`department`), `components/virtual-store/VirtualStoreCatalog.tsx`

**Interfaces:**
- Produces: `PublicProduct.department: { slug: string; name: string; sortOrder: number } | null` (inactivo → `null`; spec §3.1). Chips `Todo · …` solo con departamentos presentes en `products`, en `sortOrder`, cada uno `<button aria-pressed>` de 44 px o más, sin conteos. URL `?depto=<slug>` con `useSearchParams` y `router.replace` (sin recargar). 24 tarjetas; "Ver más" suma 24 y desaparece al llegar al total. Filtrado en el cliente.
- Consumes: `getCatalogProducts` (2.2), `assignDepartmentAction` (1.7; el owner asigna antes de la demo).

**Mocks y fixtures:** `next/navigation` con `useSearchParams` configurable y `replace` espía.

**Pruebas existentes que cambia:** `public-projection.test.ts` y `public-contract.db.test.ts` (de 2.2): la lista de claves suma `department` (ampliación).

- [ ] **Step 1: Pruebas:** 30 productos → 24 tarjetas; "Ver más" → 30 y el botón desaparece; `?depto=calzado` llega filtrado con el chip `aria-pressed="true"`; un departamento sin productos no tiene chip; un producto sin departamento solo aparece en "Todo"; departamento inactivo → `department: null`; ningún chip contiene dígitos.
- [ ] **Step 2:** `npx vitest run lib/data components/__tests__/CatalogDepartments.test.tsx` y `npm run test:db` → FAIL.
- [ ] **Step 3: Diseño:** Si existe `docs/design/2026-11-09-stitch/catalogo-cuadricula`, seguirlo; si no, seguir el comportamiento del spec v2 y las reglas: paleta #007272 (presionado #005F5F, texto blanco), 375 px, objetivos ≥ 44 px, español de México, prefers-reduced-motion.
- [ ] **Step 4:** Implementar.
- [ ] **Step 5:** Pruebas → PASS.
- [ ] **Step 6:** VE con `test:db`.
- [ ] **Step 7: Commit** `feat(catalogo): filtro por departamento en la URL y "Ver más"`.
- [ ] **Step 8 (DUEÑO, antes de la demo):** asignar departamento en lote a los productos de `ventas-prueba` desde el Preview (pantalla de 1.7).

### Tarea 2.4 (orden 16): mínimo móvil y accesibilidad (H7) · 4 h · demo sí · frontend-pwa

**Rama:** `feat/catalogo-a11y`

**Files:**
- Create: `components/__tests__/CatalogA11y.test.tsx`, `app/__tests__/ssr-no-blank.test.tsx`
- Modify: `components/virtual-store/ProductHotspotModal.tsx`, `components/virtual-store/CatalogDrawer.tsx` (diálogo), `components/virtual-store/CatalogGrid.tsx` (44 px; `<img width height loading="lazy">`), `components/layout/PageTransition.tsx` (solo `opacity`, `initial={false}`, sin `filter`), `app/providers.tsx` (`<MotionConfig reducedMotion="user">`), `components/virtual-store/VirtualStoreCatalog.tsx` (modal con `key={product.id}`)

**Interfaces:**
- Produces: modal y cajón con `role="dialog"`, `aria-modal="true"`, `aria-labelledby` al título; Esc cierra; foco atrapado (Tab/Shift+Tab) y devuelto al disparador; `document.body.style.overflow = "hidden"` mientras está abierto; iconos con `aria-label`.
- Consumes: `CatalogGrid` y el modal con tallas (2.1–2.3).

**Mocks y fixtures:** `window.matchMedia` configurable (`(prefers-reduced-motion: reduce)` → `matches: true`); `next/navigation` como 2.3; `react-dom/server` `renderToString` para el HTML de servidor.

**Pruebas existentes que cambia:** ninguna (las de 2.1–2.3 consultan por rol y texto).

- [ ] **Step 1: Pruebas:** abrir un producto → `getByRole("dialog", { name: <título> })`; Esc lo cierra y `document.activeElement` es la tarjeta que lo abrió; abierto, `document.body.style.overflow === "hidden"`; cada `button` y `a` de la cuadrícula tiene la clase de 44 px (`min-h-11` y `min-w-11`, o la que fije el diseño) y nombre accesible; `renderToString(<PageTransition>…</PageTransition>)` no contiene `opacity:0` ni `filter`; con movimiento reducido no hay `transform` animado en la tarjeta; abrir A, elegir M, cerrar y abrir B → seleccionada la primera talla de B.
- [ ] **Step 2:** `npx vitest run components/__tests__/CatalogA11y.test.tsx app/__tests__` → FAIL.
- [ ] **Step 3: Diseño:** Si existe `docs/design/2026-11-09-stitch/modal-publico`, seguirlo; si no, seguir el comportamiento del spec v2 y las reglas: paleta #007272 (presionado #005F5F, texto blanco), 375 px, objetivos ≥ 44 px, español de México, prefers-reduced-motion.
- [ ] **Step 4:** Implementar sin librerías nuevas.
- [ ] **Step 5:** Pruebas → PASS.
- [ ] **Step 6:** VE.
- [ ] **Step 7: Commit** `fix(catalogo): diálogos accesibles, 44 px, sin pantalla en blanco y movimiento reducido`.
- [ ] **Step 8 (M):** a 375 px en un celular real, sin desbordes horizontales en `/catalogo`.

---

# Hito (orden 17). Demo al dueño (2026-11-19) · 3 h · DUEÑO + Claude · qa-testing

**Entorno:** Preview de Vercel con variables **acotadas a la rama `feat/demo-alta-lote`**, contra `ventas-prueba` (con la migración 1.1) por el pooler (1.11). Nunca la conexión de producción en Preview. `ventas-prueba` trae duplicados reales para ensayar 1.6.

**Antes de la demo (Claude, con evidencia pegada):**
- [ ] (DUEÑO) merge de cada rama de las Fases 1 y 2 en `feat/demo-alta-lote` y `push`.
- [ ] `npx tsc --noEmit`, `npm test`, `npm run test:db` (ejecutadas, no saltadas), `npm run lint` y `npm run build` en verde local y en CI.
- [ ] (DUEÑO) `npx prisma migrate status` en `ventas-prueba` → "Database schema is up to date!".
- [ ] (DUEÑO) variables de Preview acotadas a la rama: `DATABASE_URL` (pooler de `ventas-prueba`), `NEXTAUTH_SECRET`, `NEXTAUTH_URL` si aplica, `BLOB_READ_WRITE_TOKEN`, `BLOB_PUBLIC_HOST`, `NEXT_PUBLIC_WHATSAPP_NUMBER`; deploy del Preview.
- [ ] Guía de salida, Fase D: variables acotadas por rama; F.2 "No correr `reset-users.ts`" (producción ya tiene contraseñas propias). Commit `docs(runbook): Preview acotado por rama y F.2 omitida`.
- [ ] Ensayo completo del guion en el Preview a 375 px en navegador; resto de 1.11 (M).
- [ ] Lista de hallazgos abiertos en el PR.

**Guion (checklist; dos celulares; cuentas owner, manager, `colab1` en Lomas y `colab2` en ClubAlva):**
- [ ] 1. `colab1` da de alta un producto **con 3 tallas** en modo catálogo con fotos de frente y atrás, y otro en modo solo stock. (1.5)
- [ ] 2. `colab1` agrega la talla L a un producto existente buscando su código público, y otra escaneando. (1.5)
- [ ] 3. `colab2` escanea un código ya registrado en Lomas y suma 2 piezas en ClubAlva. (1.5, 1.2)
- [ ] 4. Owner une dos productos duplicados de una talla; `/ventas` muestra las mismas cifras antes y después. (1.6)
- [ ] 5. Owner cambia el precio de una talla con motivo y ve el historial. Manager asigna departamento a 10 productos. (1.7)
- [ ] 6. Manager registra una merma de 1 con motivo; una merma de 3 sobre stock 1 se rechaza con el mensaje. (1.2)
- [ ] 7. Owner traspasa 1 pieza de Lomas a ClubAlva. (1.8)
- [ ] 8. `colab1` vende en `/pos` en Lomas (efectivo); `colab2` vende en ClubAlva (SPAY, queda pendiente); el manager confirma el pago; el owner ve vendido, cobrado y pendientes en `/ventas`. (ventas P1)
- [ ] 9. Con un carrito abierto de `colab1`, el owner cambia el precio de esa talla: `colab1` ve el aviso de precio cambiado y cobra al nuevo. (1.7)
- [ ] 10. `/movimientos` muestra todo lo anterior con quién y por qué. (1.9)
- [ ] 11. En un celular sin sesión, `/catalogo`: una tarjeta por producto con tallas, filtro por departamento, WhatsApp con código y talla, nada inventado; el producto de solo stock no aparece. (2.1–2.4)
- [ ] 12. Con la sesión vencida, `/productos` muestra el mensaje y no una pantalla en blanco. (1.10)

**Después de la demo:** clasificar las observaciones en "bloquea la salida" o "después"; corregir las primeras (una rama `fix/<tema>` por observación); hacer la Fase 3; repetir el guion completo y la Fase G en el Preview. **Demo aprobada** = el dueño firma la lista con fecha en la guía de salida.

---

# Fase 3. Prerrequisitos de salida

### Tarea 3.1 (orden 18): webhook endurecido (H2) · 3 h · demo no · backend-data

**Rama:** `feat/webhook-endurecido` · **Depende:** 1.6.

**Files:** Create `lib/public/urls.ts`. Modify `app/api/whatsapp/webhook/route.ts`, `app/api/whatsapp/webhook/__tests__/route.test.ts` (el remitente de prueba pasa al número ficticio de 12 dígitos), `.env.example` (`WHATSAPP_PHONE_NUMBER_ID=""`, solo el nombre).

**Interfaces:**
- Produces: `CATALOG_URL` exportada desde `lib/public/urls.ts` (un route handler solo exporta métodos HTTP). Contrato HTTP del spec 3.1, con las variables leídas **dentro** de `POST`. `NEUTRAL_REPLY = "La tienda te confirma por aquí si lo tenemos."` para código de solo stock **y** para código inexistente (mismo texto: no revela existencia). Deduplicación de `message.id` en un `Set` de módulo con tope de 500 (FIFO). `from` con `^\d{10,15}$`. Se revisa `res.ok` del `fetch` a Graph y se registra solo el estado HTTP, nunca el cuerpo.
- Consumes: `findPublicByCode` (1.6).

**Mocks y fixtures:** `vi.mock("@/lib/data/get-source")` con Fixture (ya existe); `vi.stubGlobal("fetch", …)`; `vi.stubEnv` para `NODE_ENV`, `WHATSAPP_APP_SECRET`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN`; `crypto.createHmac` para firmar.

**Pruebas existentes que cambia:** `route.test.ts` (el helper `send` gana `{ signature?; secret?; phoneNumberId?; messageId? }`; los casos de texto existentes se conservan).

- [ ] **Step 1: Pruebas** (criterios de spec 3.1): producción sin secreto → 503 y sin envío; con secreto: sin firma, longitud distinta o inválida → 401; válida → 200; otro `phone_number_id` → 200 sin enviar; cuerpo sin `metadata` → 200 sin excepción; ninguna respuesta contiene "Tienda Principal" ni coincide con `/\bapart(a|as|ado|ados|ar|o)\b/i`; mismo `message.id` dos veces → una respuesta; código de solo stock y código inexistente → exactamente el mismo texto; código unido → responde por el destino.
- [ ] **Step 2:** `npx vitest run app/api` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Pruebas → PASS; VE.
- [ ] **Step 5: Commit** `fix(webhook): firma obligatoria en producción, número de negocio fijo y respuesta neutral`.

### Tarea 3.2 (orden 19): plan de contingencia (H14) · 1 h · demo no · devops-deploy + DUEÑO

**Rama:** `docs/contingencia` · **Depende:** nada.

- [ ] **Step 1:** sección "Contingencia" en `docs/runbooks/2026-11-salida-ventas.md` con el contenido de spec 3.2 (quién vigila y cómo; hoja en papel por tienda con hora, código, talla, precio y método; registro en `/pos` por owner o manager al volver, anotando que la fecha del ticket será la del registro; datos del celular sin internet; retroceso promoviendo el deploy anterior con id anotado antes de salir).
- [ ] **Step 2: Commit** `docs(runbook): plan de contingencia para caídas y sin red`.
- [ ] **Step 3 (DUEÑO + Claude, M):** ensayo una vez sin red durante la demo; anotar la fecha.

### Tarea 3.3 (orden 20): reglas de caché de la PWA y recarga (H18) · 3 h · demo no · frontend-pwa

**Rama:** `feat/pwa-cache` · **Depende:** nada.

**Files:** Create `lib/pwa/runtime-caching.mjs` (exporta el arreglo para probarlo), `lib/pwa/stale-action.ts`, `components/layout/StaleVersionNotice.tsx`, `lib/__tests__/pwa-config.test.ts`. Modify `next.config.mjs` (`runtimeCaching`, `buildExcludes` para las tres `.jpeg` sin uso), mover `public/__tests__/` a `test/public/`, guía de salida (paso "cerrar y abrir la app" tras cada deploy).

**Interfaces:** `runtimeCaching`: `NetworkOnly` para `/api/*`, navegaciones (`request.mode === "navigate"`) y peticiones RSC (cabecera `RSC: 1`), incluido `/catalogo`; `CacheFirst` para `/_next/static`; `StaleWhileRevalidate` 7 días para imágenes de Blob. `isStaleActionError(err: unknown): boolean` detecta "Failed to find Server Action"; `StaleVersionNotice` muestra "Hay una versión nueva. Recarga la página.".

**Mocks y fixtures:** ninguno (se importa el módulo de configuración; `fs` para revisar `public/`).

- [ ] **Step 1: Pruebas:** la regla que atrapa `/api/x` y la de navegación son `NetworkOnly`; `/_next/static/x.js` → `CacheFirst`; `fs.existsSync("public/__tests__") === false`; `isStaleActionError(new Error('Failed to find Server Action "abc"'))` → `true`.
- [ ] **Step 2:** FAIL → implementar → PASS; VE.
- [ ] **Step 3: Commit** `fix(pwa): sin caché para API y páginas y aviso de versión nueva`.
- [ ] **Step 4 (M, DUEÑO + Claude):** tras un deploy de Preview, un celular con la PWA vieja toma la versión nueva con una recarga; sin red, `/catalogo` no muestra disponibilidad vieja.

### Tarea 3.4 (orden 21): variables y Fase G ampliada (H19) · 1.5 h · demo no · devops-deploy + DUEÑO

**Rama:** `docs/fase-g` · **Depende:** 3.1.

- [ ] **Step 1:** en la guía, la lista de **nombres** del spec 3.4 que deben existir en Production antes del build (nunca `DIRECT_URL` ni `SHADOW_DATABASE_URL`) y la Fase G ampliada (webhook firmado → 200 y sin firma → 401; `/catalogo` con productos reales y sin textos inventados; enlace de WhatsApp con el número configurado; una entrada, una merma y un traspaso sobre un producto "PRUEBA" que se desactiva al terminar).
- [ ] **Step 2: Commit** `docs(runbook): variables de producción y Fase G ampliada`.
- [ ] **Step 3 (DUEÑO):** cargar las variables en Production y marcar la lista con fecha e id del deploy, sin valores.

### Tarea 3.5 (orden 22): evaluación de parches de seguridad (H13) · 3 h · demo no · devops-deploy

**Rama:** `chore/parches-seguridad` · **Depende:** 1.12.

- [ ] **Step 1:** `npm audit --omit=dev --json` → tabla de triage en el PR (paquete, severidad, ¿corre en producción?, acción). Next 14.2.35: DoS crítico **aceptado y documentado** hasta PR #17 (> 15.5.27).
- [ ] **Step 2:** aplicar solo menores sin `--force` (`@vercel/blob` 2.9.x, `undici`, `postcss`, `fast-uri`).
- [ ] **Step 3:** VE con `test:db`; `npm audit --omit=dev` sin críticas fuera de la excepción.
- [ ] **Step 4: Commit** `chore(deps): parches menores de seguridad y triage documentado`.
- [ ] **Step 5 (DUEÑO):** autorizar cerrar las ramas de Dependabot obsoletas.

### Tarea 3.6 (orden 23): endurecimiento menor de subida y login · 1.5 h · demo no · backend-data

**Rama:** `fix/subida-login` · **Depende:** nada.

**Files:** Modify `lib/image/upload.ts` (`MAX_IMAGE_BYTES = 3.5 * 1024 * 1024`; firma de bytes: JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF` + `WEBP` en el byte 8), `lib/auth/users.ts` (`findUser` compara contra un hash bcrypt ficticio constante cuando el usuario no existe). Test: `lib/image/__tests__/upload.test.ts` (crear con `vi.mock("@vercel/blob")`), `lib/auth/__tests__/users.test.ts`.

- [ ] **Step 1: Pruebas:** archivo de texto con `type: "image/jpeg"` → `ImageUploadError` sin `put`; 3.6 MB → "La imagen pesa más de 3.5 MB. Toma la foto de nuevo o redúcela."; usuario inexistente → `bcrypt.compare` llamado una vez.
- [ ] **Step 2:** FAIL → implementar → PASS; VE.
- [ ] **Step 3: Commit** `fix(seguridad): validar bytes de imagen, tope de 3.5 MB y login sin diferencia de tiempo`.

### Tarea 3.8 (orden 23.5): clasificación por departamento y tipo · 13 h · demo no · backend-data + frontend-pwa

**Rama:** `feat/tipos-producto` · **Spec:** `docs/superpowers/specs/2026-11-10-taxonomia-productos-design.md` (addendum de v2; manda en caso de duda). La lista de tipos (§4) y los estilos (§3.3) están **pendientes de confirmar por el dueño** en la demo; si cambian, se edita solo `product-types-catalog.ts` y los números de las pruebas que cuentan tipos y pares.

**Files:**
- Create: `prisma/migrations/<timestamp posterior a 20261110120000>_add_product_types/migration.sql` (generado), `lib/domain/product-types-catalog.ts`, `lib/domain/product-taxonomy.ts`, `lib/domain/__tests__/product-taxonomy.test.ts`, `lib/catalog/type-rule.ts`, `prisma/scripts/backfill-product-types.ts`, `prisma/scripts/__tests__/backfill-product-types.db.test.ts`, `lib/data/__tests__/prisma-product-types.db.test.ts`, `lib/data/__tests__/fixture-product-types.test.ts`, `lib/__tests__/actions-product-types.test.ts`, `components/products/ClassificationFields.tsx`, `components/__tests__/NewProductForm-types.test.tsx`, `components/__tests__/ProductosTypes.test.tsx`
- Modify: `prisma/schema.prisma`, `prisma/seed.ts` (tipos y pares por slug), `lib/domain/types.ts` (`Product`), `lib/domain/new-product.ts` (`productTypeId`, `style`, `audience`; se elimina `PRODUCT_CATEGORIES`), `lib/data/source.ts`, `lib/data/prisma-source.ts`, `lib/data/fixture-source.ts`, `lib/data/fixtures.ts` (`FIXTURE_PRODUCT_TYPES`, `FIXTURE_DEPARTMENT_PRODUCT_TYPES`), `lib/data/prisma-sales-source.ts` (copia en `SaleLine`), `lib/catalog/actions.ts` (`listProductTypesAction`), `lib/actions.ts` (`createProductAction`), `lib/products/actions.ts` (`updateProductAction`, `assignProductTypeAction`), `components/products/NewProductForm.tsx`, `components/products/ProductAdminSheet.tsx`, `app/productos/page.tsx`, `prisma/__tests__/migrations-additive.test.ts`, `docs/superpowers/specs/2026-11-05-modelo-datos-er.md` (§2.9 ya escrita en docs; ajustar si el esquema final difiere)

**Interfaces:**
- Produces (Prisma, spec addendum §2): `model ProductType { id; slug @unique; name @unique; sortOrder Int @default(0); isActive Boolean @default(true); products; departments; createdAt; updatedAt }`; `model DepartmentProductType { departmentId → Department (Restrict); productTypeId → ProductType (Restrict); createdAt; @@id([departmentId, productTypeId]); @@index([productTypeId]) }`; `Product.productTypeId String?` (FK `Restrict`, `@@index`), `Product.style String? @db.VarChar(40)`, `Product.audience String? @db.VarChar(20)`; `SaleLine.productTypeId String?` (sin FK, `@@index`). Inversas: `Department.productTypes`, `ProductType.products`.
- Produces (dominio):
  - `lib/domain/product-types-catalog.ts` (solo datos, sin imports de servidor): `PRODUCT_TYPE_CATALOG: readonly { slug: string; name: string; sortOrder: number }[]` (29, addendum §4); `DEPARTMENT_TYPE_SLUGS: Readonly<Record<"dama" | "caballero" | "ninos" | "calzado" | "accesorios", readonly string[]>>` (16 + 12 + 14 + 4 + 9 = 55 pares); `LEGACY_CATEGORY_TO_TYPE: Readonly<Record<string, string>>` (`Playeras→playera`, `Pantalones→pantalon`, `Hoodies→sudadera`, `Tenis→tenis`, `Perfumes→perfume`, `Raquetas de Padel→raqueta-padel`); `STYLE_OPTIONS: Readonly<Record<string, readonly { slug: string; name: string }[]>>` (addendum §3.3).
  - `lib/domain/product-taxonomy.ts`: `AUDIENCES = ["dama", "caballero", "nino"] as const`; `type Audience`; `AUDIENCE_LABELS: Record<Audience, string>` (`Dama`, `Caballero`, `Niño`); `AUDIENCE_DEPARTMENT_SLUG = "calzado"`; `isAudience(x: unknown): x is Audience`; `interface TypeRuleInput { slug: string; isActive: boolean; appliesToDepartment: boolean }`; `validateClassification(input: { departmentSlug: string; type: TypeRuleInput | null; style?: unknown; audience?: unknown }): { style: string | null; audience: Audience | null }` (lanza `Error` con los mensajes del addendum §6, en este orden: tipo nulo, inactivo, no aplica, "para" inválido, falta "para", sobra "para", estilo); `type ClassificationIssue = "SIN_DEPARTAMENTO" | "SIN_TIPO" | "TIPO_INACTIVO" | "TIPO_NO_APLICA" | "FALTA_PARA" | "PARA_SOBRA" | "ESTILO_NO_APLICA"`; `interface ClassificationRules { departments: { id: string; slug: string }[]; types: { id: string; slug: string; departmentIds: string[] }[] }` (solo activos); `classificationIssues(p: Pick<Product, "departmentId" | "productTypeId" | "style" | "audience">, rules: ClassificationRules): ClassificationIssue[]` (orden fijo del tipo); `typesForDepartment<T extends { departmentIds: string[] }>(types: T[], departmentId: string): T[]` (conserva el orden de entrada).
  - `Product` (`lib/domain/types.ts`) gana `productTypeId?: string | null`, `style?: string | null`, `audience?: Audience | null`.
  - `NewProductInput`: `category` se **sustituye** por `productTypeId: string`, `style?: string | null`, `audience?: string | null`; `NormalizedNewProduct` igual. `validateNewProduct` lanza "Elige el tipo." sin `productTypeId` y "Elige para quién es: dama, caballero o niño." si `audience` no es nulo y no es `Audience`. `PRODUCT_CATEGORIES` desaparece.
- Produces (datos, `lib/data/source.ts`; Prisma y Fixture):
  - `CreateProductData` gana `productTypeId?: string | null`, `style?: string | null`, `audience?: Audience | null` (opcionales; `category` se queda y el llamador la llena con `ProductType.name`). `ProductPatch` gana `productTypeId?: string`, `style?: string | null`, `audience?: Audience | null` (`category` = nombre del tipo, lo pone la acción).
  - `assignProductType(productIds: string[], data: { productTypeId: string; category: string; allowedStyles: readonly string[] }): Promise<{ updated: number; styleCleared: number }>` — en una transacción: si algún producto con `departmentId` no nulo no tiene el par en `DepartmentProductType`, `InventoryRuleError("«{category}» no aplica a {n} de los productos elegidos. Quítalos de la selección.")` sin escribir; `style` fuera de `allowedStyles` → `null` (cuenta `styleCleared`); escribe `productTypeId` y `category`; no toca `departmentId`, `audience` ni `SaleLine`; `updated` = productos existentes.
  - `getStockByType(filter: { locationId?: string | null }): Promise<StockByTypeRow[]>` y `StockByTypeRow = { departmentId: string | null; departmentName: string; productTypeId: string | null; typeName: string; typeActive: boolean; audience: Audience | null; locationId: string; locationName: string; pieces: number; products: number }` — SQL exacto del addendum §12 (`$queryRaw` con `Prisma.sql`, sin `$queryRawUnsafe`).
  - `getProducts` mapea `productTypeId`, `style` y `audience` (`isAudience` o `null`). `createSale` copia `product.productTypeId` a `SaleLine.productTypeId`.
- Produces (acciones):
  - `lib/catalog/actions.ts`: `interface ProductTypeOption { id: string; slug: string; name: string; departmentIds: string[] }`; `listProductTypesAction(): Promise<ProductTypeOption[] | null>` — `null` sin sesión (como `listDepartmentsAction`); solo activos; `orderBy: { sortOrder: "asc" }`.
  - `lib/catalog/type-rule.ts` (servidor, sin `"use server"`): `loadTypeRule(productTypeId: string, departmentId: string | null): Promise<{ name: string; slug: string; rule: TypeRuleInput } | null>` — `prisma.productType.findUnique({ where: { id }, select: { name: true, slug: true, isActive: true, departments: { where: { departmentId }, select: { departmentId: true } } } })`; con `departmentId` nulo, `appliesToDepartment: true`.
  - `createProductAction`: el departamento se lee con `select: { isActive: true, slug: true }`; `loadTypeRule` + `validateClassification`; `createProduct({ …, category: type.name, productTypeId, style, audience })`. INVALID con el mensaje de la regla.
  - `updateProductAction(input: { productId; title?; brandId?; departmentId?; productTypeId?; style?: string | null; audience?: string | null })` — el parámetro `category` se quita. Si llega alguno de `departmentId`, `productTypeId`, `style`, `audience` y falta `departmentId` o `productTypeId` → INVALID "Elige departamento y tipo."; si no, valida el bloque con `loadTypeRule` + `validateClassification` y manda `patch.category = type.name`.
  - `assignProductTypeAction(productIds: string[], productTypeId: string): Promise<ProductAdminResult>` con `gate()` (owner o manager releídos de la base), 1–100 ids (mismos mensajes que `assignDepartmentAction`), tipo activo (si no, INVALID "Ese tipo ya no está activo. Elige otro de la lista."); `InventoryRuleError` → INVALID con su mensaje. `ProductAdminResult` en `ok: true` gana `styleCleared?: number` (solo cuando es > 0).
  - `assignDepartmentAction`: **sin cambios**.
- Produces (UI): `ClassificationFields` (props `{ idPrefix: string; departmentSlug: string | null; types: ProductTypeOption[]; value: { productTypeId: string; style: string | null; audience: Audience | null }; onChange(v): void; disabled?: boolean }`): select con etiqueta exacta "Tipo" (desactivado sin departamento; opciones `typesForDepartment`), select "Estilo" con "Sin estilo" (solo si `STYLE_OPTIONS[slug]` tiene valores), grupo de radios "Para" (Dama, Caballero, Niño; ≥ 44 px) solo si `departmentSlug === "calzado"`. Lo usan `NewProductForm` y `ProductAdminSheet`. `/productos`: chips de tipo con los nombres de `listProductTypesAction`, chip "Por revisar" (owner y manager) y botón "Asignar tipo" en la selección múltiple.
- Consumes: `gate()`, `ProductAdminResult`, `updateProductAction`, `ProductAdminSheet`, selección múltiple de `/productos` (1.7); `NewProductForm`/`SizeRows` y `CreateProductData.variants` (1.5); `mergeProducts` (1.6); `requireRole`, `currentUserOrNull` (1.3); `FIXTURE_DEPARTMENTS` con ids `dep-<slug>` (2.3; si no existiera, se crea aquí con los cinco departamentos); `InventoryRuleError` (1.5); `backfillBrandDepartment` (existente).

**Mocks y fixtures:** acciones: `@/lib/auth/current-user`, `@/lib/data/get-source` (Fixture), `next/cache` y `@/lib/prisma` con `brand.findUnique`, `department.findUnique` (devuelve `{ isActive: true, slug: "dama" }` por omisión) y `productType.findUnique` (devuelve `{ name: "Playeras", slug: "playera", isActive: true, departments: [{ departmentId: "dep-dama" }] }` por omisión). Fixture: `FIXTURE_PRODUCT_TYPES = PRODUCT_TYPE_CATALOG.map((t) => ({ id: \`type-${t.slug}\`, ...t, isActive: true }))` y `FIXTURE_DEPARTMENT_PRODUCT_TYPES` desde `DEPARTMENT_TYPE_SLUGS` con `dep-<slug>`; los `fixtureProducts` existentes **no** se clasifican (quedan sin tipo, así ninguna prueba vieja cambia de resultado). UI: el mock de `@/lib/catalog/actions` suma `listProductTypesAction` con `[{ id: "type-playera", slug: "playera", name: "Playeras", departmentIds: ["d1"] }, { id: "type-tenis", slug: "tenis", name: "Tenis", departmentIds: ["d4"] }]` y `listDepartmentsAction` con `[{ id: "d1", slug: "dama", name: "Dama" }, { id: "d4", slug: "calzado", name: "Calzado" }]`; el mock de `@/lib/products/actions` suma `assignProductTypeAction`. Base: `new PrismaDataSource(testPrisma)`, `new PrismaSalesDataSource(testPrisma)`, `resetDb()` (incluye las tablas nuevas porque sale del DMMF), `backfillBrandDepartment(testPrisma)` y `backfillProductTypes(testPrisma)` como preparación.

**Pruebas existentes que cambia** (`NewProductInput.category` → `productTypeId` y el `category` de `updateProductAction` se quita; se migran fixtures y payloads, ninguna aserción se relaja):
- `prisma/__tests__/migrations-additive.test.ts`: se agrega un `describe` para `*_add_product_types`; el de `inventory_controls` no cambia.
- `lib/domain/__tests__/new-product.test.ts`: `valid` usa `productTypeId: "type-playera"` en vez de `category`; "Elige una categoría válida." → "Elige el tipo." (con `""`); la aserción de que `PRODUCT_CATEGORIES` contiene "Playeras" y "Accesorios" se reemplaza por una equivalente sobre `PRODUCT_TYPE_CATALOG` (contiene `playera` y `gorra`), porque la constante desaparece.
- `lib/__tests__/actions-create-product.test.ts`, `lib/__tests__/actions-sizes.test.ts`, `lib/__tests__/actions-permissions.test.ts`: el input usa `productTypeId`; el mock de `@/lib/prisma` suma `productType.findUnique`; el caso `category: ""` pasa a `productTypeId: ""` con `/tipo/i`. Los `ds.createProduct({ … category … })` directos no cambian (`CreateProductData.category` sigue).
- `lib/products/__tests__/actions.test.ts` (de 1.7): "cambia título, marca, departamento y categoría" pasa a mandar `departmentId: "d2", productTypeId: "type-playera", style: null, audience: null` y sigue esperando `category: "Playeras"`; "departamento inactivo: INVALID" manda el bloque completo (sigue probando el departamento inactivo, no el bloque incompleto); "categoría fuera de la lista: INVALID" pasa a "tipo inexistente: INVALID" (`productType.findUnique` → `null`); el mock de `@/lib/prisma` suma `productType`. Los casos de `assignDepartmentAction` no cambian.
- `components/__tests__/NewProductForm.test.tsx`, `NewProductForm-errors.test.tsx`, `NewProductForm-modes.test.tsx`, `NewProductForm-sizes.test.tsx`, `app/escanear/__tests__/page.test.tsx`: el mock de `@/lib/catalog/actions` suma `listProductTypesAction`; `getByLabelText(/categor/i)` con `"Playeras"`/`"Hoodies"`/`"Accesorios"` pasa a `getByLabelText("Tipo")` con `"type-playera"`; las aserciones del payload `category: X` pasan a `productTypeId: "type-playera"`; "Elige una categoría válida." → "Elige el tipo.".
- `components/__tests__/ProductAdminSheet.test.tsx`, `ProductosAdmin.test.tsx`, `ProductosPhotos.test.tsx`: el mock de `@/lib/catalog/actions` suma `listProductTypesAction` (ampliación; las aserciones no cambian).
- `lib/data/__tests__/prisma-merge.db.test.ts` (de 1.6) y `lib/data/__tests__/prisma-sales.db.test.ts`: casos nuevos (ampliación).
- `lib/data/__tests__/public-projection.test.ts` y `public-contract.db.test.ts` (de 2.2/2.3): se agrega que las claves no incluyen `productTypeId`, `style` ni `audience`; la lista exacta de claves no cambia.

- [ ] **Step 1: Prueba del SQL** en `migrations-additive.test.ts` (`describe("migración add_product_types")`): existe la carpeta `*_add_product_types`; contiene `CREATE TABLE "ProductType"`, `CREATE TABLE "DepartmentProductType"` y `ADD COLUMN "productTypeId"` exactamente 2 veces, `ADD COLUMN "style"` y `ADD COLUMN "audience"`; no contiene `DROP`, `ALTER COLUMN`, `SET NOT NULL` ni `CHECK`; ningún renglón con `ADD COLUMN` lleva `NOT NULL`.
- [ ] **Step 2: Pruebas puras** `product-taxonomy.test.ts`:
  - Catálogo: `PRODUCT_TYPE_CATALOG.length === 29`, slugs y nombres sin repetir, `sortOrder` 1–29 sin repetir; Σ `DEPARTMENT_TYPE_SLUGS` = 55 y cada slug existe en el catálogo; cada llave de `LEGACY_CATEGORY_TO_TYPE` y de `STYLE_OPTIONS` apunta a un slug del catálogo; `STYLE_OPTIONS.playera` contiene `polo`.
  - `validateClassification`: `type: null` → lanza "Elige el tipo."; `{ slug: "playera", isActive: false, appliesToDepartment: true }` → "Ese tipo ya no está activo. Elige otro de la lista."; `appliesToDepartment: false` → "Ese tipo no aplica al departamento elegido. Elige otro de la lista."; `departmentSlug: "calzado"`, tenis, sin `audience` → "En Calzado elige para quién es: dama, caballero o niño."; calzado, tenis, `audience: "nino"` → `{ style: null, audience: "nino" }`; calzado, `audience: "Niño"` → "Elige para quién es: dama, caballero o niño."; `departmentSlug: "dama"`, playera, `audience: "dama"` → "«Para» solo se usa en Calzado."; playera con `style: "polo"` → `{ style: "polo", audience: null }`; playera con `style: "con-capucha"` → "Ese estilo no aplica a ese tipo."; tenis con `style: "polo"` → mismo mensaje; `style: ""` → `style: null`.
  - `classificationIssues` con `rules` = departamentos `dep-dama`/`dama` y `dep-calzado`/`calzado`, tipos `type-playera` (`["dep-dama"]`) y `type-tenis` (`["dep-calzado"]`): `{ departmentId: null, productTypeId: null }` → `["SIN_DEPARTAMENTO", "SIN_TIPO"]`; `{ dep-calzado, type-playera }` → `["TIPO_NO_APLICA", "FALTA_PARA"]`; `{ dep-dama, type-playera, style: "polo" }` → `[]`; `{ dep-dama, type-borrado }` → `["TIPO_INACTIVO"]`; `{ dep-dama, type-playera, audience: "nino" }` → `["PARA_SOBRA"]`; `{ dep-dama, type-playera, style: "con-capucha" }` → `["ESTILO_NO_APLICA"]`; `{ dep-calzado, type-tenis, audience: "nino" }` → `[]`.
  - `typesForDepartment(types, "dep-calzado")` → solo `type-tenis`. `validateNewProduct` sin `productTypeId` → "Elige el tipo."; con `audience: "x"` → "Elige para quién es: dama, caballero o niño.".
- [ ] **Step 3: Prueba del relleno** `backfill-product-types.db.test.ts` (`describe.skipIf(!hasTestDb)`, `resetDb` en `beforeEach`): tras `backfillBrandDepartment`, 7 productos con `category` `Playeras`, `Hoodies`, `Tenis`, `Raquetas de Padel`, `Accesorios`, `General`, `Cosa rara`, y una venta (usuario, tienda, `Sale` y una `SaleLine` con `category: "Hoodies"`, `productTypeId: null`) → `backfillProductTypes(testPrisma)` devuelve `{ types: 29, pairs: 55, products: 4, saleLines: 1, unmapped: { Accesorios: 1, General: 1, "Cosa rara": 1 } }`; el producto de `Hoodies` queda con el tipo de slug `sudadera` y `category: "Sudaderas"`; el de `Raquetas de Padel`, con `category: "Raquetas de pádel"`; la `SaleLine` con `productTypeId` de `sudadera` y `category: "Hoodies"` (sin cambio); ningún producto cambia `departmentId`, `style` ni `audience`. Segunda corrida → `{ types: 0, pairs: 0, products: 0, saleLines: 0, unmapped: { Accesorios: 1, General: 1, "Cosa rara": 1 } }` y `productType.count() === 29`. Sin correr antes `backfillBrandDepartment` → rechaza con "Falta el departamento dama: corre primero backfill-brand-department." y `productType.count() === 0`.
- [ ] **Step 4: Pruebas de base** `prisma-product-types.db.test.ts` (preparación: `backfillBrandDepartment` + `backfillProductTypes`; tiendas "Tienda A" y "Tienda B" tipo `store`):
  - `createProduct` con `productTypeId` de `playera`, `style: "polo"`, `category: "Playeras"` → `getProducts()` lo devuelve con esos tres campos y `audience: null`; `updateProduct(id, { productTypeId: <tenis>, category: "Tenis", style: null, audience: "nino" })` → se guardan los cuatro.
  - `assignProductType`: 3 productos de Dama, uno con `style: "con-capucha"` (era sudadera) → `{ updated: 3, styleCleared: 1 }`, los 3 con `category: "Playeras"`; selección con 2 de Dama y 1 de Calzado hacia `playera` → `InventoryRuleError` con "no aplica a 1 de los productos elegidos" y los 3 conservan su tipo anterior; un producto sin departamento → `{ updated: 1, styleCleared: 0 }`.
  - `getStockByType` con el escenario: P1 Dama/Playeras con M (A 3, B 1) y L (A 2); P2 Dama/Playeras con S (A 0); P3 Calzado/Tenis "para" `nino` con 22 (A 4); P4 Calzado/Tenis `dama` con 24 (A 2); P5 Dama sin tipo con U (B 7); P6 Dama/Playeras **inactivo** con M (A 9); P7 Dama/Playeras activo con talla M **inactiva** (A 5). Sin filtro → exactamente, en este orden: `[Dama, Playeras, null, Tienda A, 5, 1]`, `[Dama, Playeras, null, Tienda B, 1, 1]`, `[Dama, Sin tipo, null, Tienda B, 7, 1]`, `[Calzado, Tenis, dama, Tienda A, 2, 1]`, `[Calzado, Tenis, nino, Tienda A, 4, 1]` (campos `departmentName, typeName, audience, locationName, pieces, products`); Σ `pieces` = 19; suma por `productTypeId` de `playera` = 6. Con `locationId` de Tienda B → solo las filas 2 y 3. Tras unir P2 en P1 (1.6; los dos con la misma marca), el resultado no cambia.
  - Ventas (`prisma-sales.db.test.ts`): una venta de P1 → `SaleLine.productTypeId` = id de `playera`; después `updateProduct(P1, { productTypeId: <sudadera>, category: "Sudaderas", style: null, audience: null })` → la `SaleLine` sigue con `playera` y `category: "Playeras"`.
  - Unión (`prisma-merge.db.test.ts`): A (Playeras, con 1 venta) ← B (Sudaderas) → A conserva `playera`; la `SaleLine` de B conserva su `productTypeId`.
- [ ] **Step 5: Prueba del Fixture** `fixture-product-types.test.ts`: el mismo escenario de `getStockByType` con `FixtureDataSource` (tiendas creadas con `createLocation`) devuelve las mismas 5 filas, en el mismo orden, al filtrar por las dos tiendas nuevas; `assignProductType` con un producto de `dep-calzado` hacia `type-playera` → `InventoryRuleError`.
- [ ] **Step 6: Pruebas de acción** `actions-product-types.test.ts`:
  - `listProductTypesAction`: sin sesión → `null`; con sesión → los activos en `sortOrder` con `departmentIds`.
  - `createProductAction`: sin `productTypeId` → `{ ok: false, code: "INVALID", message: "Elige el tipo." }` sin llamar a `createProduct`; tipo que no aplica (`departments: []`) → INVALID "Ese tipo no aplica al departamento elegido. Elige otro de la lista."; tipo inactivo → INVALID; departamento `calzado` sin `audience` → INVALID "En Calzado elige para quién es: dama, caballero o niño."; válido con `style: "polo"` y un `category: "Inventada"` colado en el input → `createProduct` recibe `{ productTypeId: "type-playera", category: "Playeras", style: "polo", audience: null }`.
  - `updateProductAction`: `{ departmentId: "d2" }` solo → INVALID "Elige departamento y tipo."; `{ title: "Nuevo" }` sobre un producto sin tipo → `{ ok: true }`; bloque válido → `category: "Playeras"` en el producto del Fixture.
  - `assignProductTypeAction`: colaborador y "JWT owner con colaborador en la base" → FORBIDDEN; sesión vencida → SESSION; 101 ids → INVALID; tipo inactivo → INVALID; 10 productos de `dep-dama` → `{ ok: true, updated: 10 }`; 3 con uno de estilo `con-capucha` → `{ ok: true, updated: 3, styleCleared: 1 }`; selección con un producto de `dep-calzado` → INVALID con "no aplica a 1 de los productos elegidos" y ningún producto cambia.
  - `assignDepartmentAction` (regresión de 1.7): un producto `dep-dama`/`type-playera` a `dep-calzado` → `{ ok: true, updated: 1 }` y conserva `productTypeId: "type-playera"`.
- [ ] **Step 7: Pruebas de UI:**
  - `NewProductForm-types.test.tsx`: sin departamento, el select "Tipo" está desactivado; con Dama, "Tipo" ofrece solo "Playeras"; con Calzado ofrece solo "Tenis" y aparece el grupo "Para" con 3 radios (Dama, Caballero, Niño); guardar en Calzado sin "Para" muestra "En Calzado elige para quién es: dama, caballero o niño." y no llama a `createProductAction`; con Dama + Playeras aparece "Estilo" con "Sin estilo" y "Polo", y no aparece "Para"; elegir Playeras en Dama y cambiar a Calzado borra el tipo y muestra "El tipo se borró porque no aplica a Calzado."; el payload final lleva `productTypeId`, `style` y `audience` y **no** lleva `category`.
  - `ProductosTypes.test.tsx` (`/productos`): owner y manager ven el chip "Por revisar" y al tocarlo solo quedan los productos con problemas; el colaborador no lo ve; "Asignar tipo" con 3 seleccionados llama a `assignProductTypeAction(ids, "type-playera")` y muestra "Se asignó el tipo a 3 productos."; con `styleCleared: 1` agrega "Se quitó el estilo a 1 porque no aplica a ese tipo."; tras un `assignDepartmentAction` exitoso que deja 2 productos con `TIPO_NO_APLICA` en Calzado, aparece "2 productos quedaron por revisar: su tipo no aplica a Calzado."; los chips de tipo salen de `listProductTypesAction` (hay chip "Playeras" y no hay chip "Hoodies").
  - `ProductAdminSheet.test.tsx` (casos nuevos): la ficha muestra "Tipo", "Estilo" y "Para" según el departamento; guardar un cambio de tipo llama a `updateProductAction` con `departmentId`, `productTypeId`, `style` y `audience` juntos; un producto con un tipo que ya no está en la lista muestra la opción "Actual (no disponible)".
- [ ] **Step 8:** `npx vitest run prisma/__tests__ lib/domain lib/__tests__ lib/products lib/data components/__tests__ app/escanear` y `npm run test:db` → FAIL.
- [ ] **Step 9: Diseño:** Si existe `docs/design/2026-11-09-stitch/alta-tallas` (y `docs/design/2026-11-09-stitch/ficha-interna` para la ficha), seguirlo; si no, seguir el comportamiento del spec v2 y las reglas: paleta #007272 (presionado #005F5F, texto blanco), 375 px, objetivos ≥ 44 px, español de México, prefers-reduced-motion.
- [ ] **Step 10:** Implementar en este orden: esquema → generar el SQL contra Postgres local (`npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --script > prisma/migrations/<timestamp>_add_product_types/migration.sql`; no editar el SQL) → catálogo y dominio → relleno y seed → `source.ts` → Prisma → Fixture → copia en ventas → `type-rule.ts` y acciones → `ClassificationFields` → alta, ficha y `/productos`. En el orden del formulario: Departamento → Tipo → Estilo/Para → Marca.
- [ ] **Step 11:** `grep -rn PRODUCT_CATEGORIES app lib components` → sin resultados; `grep -rn "category:" lib/actions.ts lib/products/actions.ts` → solo las líneas que escriben `type.name`.
- [ ] **Step 12:** Todas las pruebas → PASS, incluidas las existentes migradas.
- [ ] **Step 13:** VE con `test:db` y `lint`.
- [ ] **Step 14: Commit** `feat(catalogo): tipo de producto por departamento con estilo y «para»; relleno y consulta de stock por tipo`.
- [ ] **Step 15 (DUEÑO):** en la rama de Neon `ventas-prueba`: `npx prisma migrate deploy` aplica; `npx prisma migrate status` → "Database schema is up to date!"; `migrate diff --exit-code` sin drift; `npx tsx prisma/scripts/backfill-product-types.ts` dos veces: la segunda reporta 0 tipos, 0 pares, 0 productos y 0 renglones nuevos. Claude anota en la guía la fecha y los conteos de "sin mapear" (solo nombres de categoría y números). Producción **no** (va en 3.7).
- [ ] **Step 16 (M, DUEÑO + encargado):** en el Preview contra `ventas-prueba`, a 375 px: alta de un tenis de niño (Calzado → Tenis → Para: Niño) con 2 tallas en menos de 3 minutos; el encargado deja el chip "Por revisar" sin productos usando "Asignar tipo" y la ficha. Anotar el tiempo y la fecha en el PR.

### Tarea 3.7 (orden 24): salida a producción y carga de mercancía (H1, H15) · 3 h · DUEÑO + Claude · devops-deploy

**Depende:** demo aprobada, 3.1–3.6, 3.8. Sin código.

- [ ] **Step 1 (DUEÑO):** respaldo restaurable del mismo día; id del deploy de producción actual y responsable del retroceso anotados; ventana nocturna sin ventas, fuera de congelamientos.
- [ ] **Step 2 (DUEÑO + Claude):** fases A y E–G de la guía con las migraciones 1.1 y 3.8 (`add_product_types`) incluidas y, después de `migrate deploy`, `npx tsx prisma/scripts/backfill-product-types.ts` (conteos anotados sin datos de clientes); **no correr `reset-users.ts`**; `migrate status` "up to date"; Fase G ampliada (3.4) en verde y 10 minutos sin errores en Runtime Logs. Si falla, "Retroceso". Cierra H1.
- [ ] **Step 3 (Claude):** "Limpieza al terminar" y una línea con fecha en `CLAUDE.md` y `AGENTS.md`, sin valores. Commit `docs: control de inventario y ventas en producción`.
- [ ] **Step 4 (DUEÑO, M):** antes de empezar, el encargado deja "Por revisar" (3.8) en 0; carga por tienda y departamento, con tipo obligatorio (y "para" en Calzado); cada semana, muestra de 20 prendas por tienda contra `/productos` (más de 5 % de diferencias activa 1.13); el 2026-11-30, cada departamento de cada tienda marcado "cargado". Plan B de ClubAlva (H15) si no alcanza. Revisar cada semana el uso de Hobby (Blob y transferencia).

### Tarea 1.13 (condicional, después de 3.7): conteo físico (RF-INV-10) · 6 h · demo no · backend-data + frontend-pwa

Solo si la muestra de 3.7 encuentra más de 5 % de diferencias o el dueño lo pide. **Depende:** 1.2, 3.7. **Rama:** `feat/conteo-fisico`.

**Files:** Create `app/conteo/page.tsx`, `lib/inventory/count-actions.ts`, `lib/inventory/__tests__/count-actions.test.ts`, `lib/data/__tests__/prisma-count.db.test.ts`. Modify `lib/data/source.ts`, `lib/data/prisma-source.ts`, `lib/data/fixture-source.ts` (`applyCount`).

**Interfaces:** `applyCountAction(input: { locationId: string; lines: { variantId: string; counted: number; expectedAvailable: number }[]; requestId: string }): Promise<{ ok: true; applied: number; changed: string[] } | { ok: false; code: "SESSION" | "FORBIDDEN" | "INVALID"; message: string }>`; por renglón, `updateMany({ where: { variantId, locationId, available: expectedAvailable } })` y `ADJUSTMENT` con `notes: "conteo AAAA-MM-DD"` y `requestId: "<requestId>:<variantId>"`; `count === 0` → el `variantId` va a `changed` (CHANGED). Owner o manager con `assertCanOperate`. El conteo vive en el cliente hasta confirmar.

**Mocks y fixtures:** como 1.2.

- [ ] **Step 1: Pruebas** (`test:db`): contado 5 sobre 7 → un `ADJUSTMENT` −2 con la nota; un renglón vendido entretanto → en `changed` y sin ajuste, los demás aplicados; repetir el mismo `requestId` → sin movimientos nuevos. Acción: colaborador → FORBIDDEN.
- [ ] **Step 2: Diseño:** sin pantalla de Stitch: seguir el comportamiento del spec v2 y las reglas: paleta #007272 (presionado #005F5F, texto blanco), 375 px, objetivos ≥ 44 px, español de México, prefers-reduced-motion.
- [ ] **Step 3:** FAIL → implementar → PASS; VE con `test:db`.
- [ ] **Step 4: Commit** `feat(inventario): conteo físico con correcciones comparar-y-escribir`.

---

# Fase 4 y §4.6 (solo referencia; sin tareas detalladas)

Se planifican aparte cuando el dueño las active (enero salvo indicación). Contratos en spec v2 §4.5–§4.6 y en v1 (git `ca22425`).

- 4.1 Producto elegido por punto y zonas fuera de `zones.ts` (depende de 2.1).
- 4.2 Giro frente/atrás (depende de 2.4).
- 4.3 Panorámicas reales (depende de 4.1).
- 4.4 Derivados de imagen (adelantar si Blob en Hobby se acerca al límite).
- 4.5 Blobs huérfanos con salvaguardas (H17).
- 4.6 SEO, Open Graph y aviso de privacidad (H21).
- 4.7 WhatsApp Business (H20).
- 4.8 Tokens de color y contraste (H25).
- §4.6 Después de la demo: carrito de `/pos` que sobrevive a una recarga; devoluciones parciales (con `test:db` en paralelo y `refunded` en `recentSales`); `mergeBrandsAction` con `FOR UPDATE`; PR #17 (Next > 15.5.27, React 19, Serwist); pendientes sin fecha (límite de intentos de login, cabeceras de seguridad y `Permissions-Policy: camera=(self)`, pérdida por impago en el dashboard, Playwright mínimo, `/etiquetas` con selección, carga diferida de `html5-qrcode`).

---

# Resumen

| Orden | Tarea | Depende de | h | Demo | Agente sugerido |
|---|---|---|---|---|---|
| 1 | 1.4 Guarda del seed | — | 1 | Sí | backend-data |
| 2 | 1.12 CI con `test:db`, ESLint, Node | — | 3 | Sí | qa-testing |
| 3 | 1.3 Rol y tienda de la base | — | 4 | Sí | backend-data |
| 4 | 1.1 Migración `inventory_controls` | — | 2 | Sí | backend-data |
| 5 | 1.2 Movimientos tipados, sin "Salida" | 1.1, 1.3 | 5 | Sí | backend-data + frontend-pwa |
| 6 | 1.5 Alta con tallas y "agregar talla" | 1.1, 1.2, 1.3 | 8 | Sí | backend-data + frontend-pwa |
| 7 | 1.7 Precio, edición, desactivar, depto. en lote | 1.1, 1.2, 1.3 | 7 | Sí | backend-data + frontend-pwa |
| 8 | 1.6 Unir duplicados | 1.1, 1.3, 1.5 | 6 | Sí | backend-data + frontend-pwa |
| 9 | 1.8 Traspasos | 1.1, 1.2, 1.3 | 4 | Sí | backend-data + frontend-pwa |
| 10 | 1.9 Historial de movimientos | 1.2, 1.5, 1.8 | 4 | Sí | backend-data + frontend-pwa |
| 11 | 1.10 Sesión vencida y login | 1.3 | 3 | Sí | frontend-pwa |
| 12 | 1.11 Pooler de Neon (DUEÑO) | — | 1.5 | Sí | devops-deploy |
| 13 | 2.1 Catálogo sin inventos, WhatsApp | — | 3 | Sí | frontend-pwa (+ visual-design) |
| 14 | 2.2 Tarjeta con tallas | 1.1, 1.5, 1.6, 2.1 | 4 | Sí | frontend-pwa + backend-data |
| 15 | 2.3 Departamento y "Ver más" | 1.7, 2.2 | 3 | Sí | frontend-pwa + backend-data |
| 16 | 2.4 Móvil y accesibilidad | 2.1, 2.3 | 4 | Sí | frontend-pwa |
| 17 | Hito: demo al dueño | 1.1–1.12, 2.1–2.4 | 3 | — | qa-testing |
| 18 | 3.1 Webhook endurecido | 1.6 | 3 | No | backend-data |
| 19 | 3.2 Contingencia | — | 1 | No | devops-deploy |
| 20 | 3.3 Caché de la PWA | — | 3 | No | frontend-pwa |
| 21 | 3.4 Variables y Fase G (DUEÑO) | 3.1 | 1.5 | No | devops-deploy |
| 22 | 3.5 Parches de seguridad | 1.12 | 3 | No | devops-deploy |
| 23 | 3.6 Subida y login | — | 1.5 | No | backend-data |
| 23.5 | 3.8 Clasificación por departamento y tipo | 1.3, 1.5, 1.6, 1.7, 2.3, hito (lista confirmada) | 13 | No | backend-data + frontend-pwa |
| 24 | 3.7 Salida y carga (DUEÑO) | demo aprobada, 3.1–3.6, 3.8 | 3 | — | devops-deploy |
| — | 1.13 Conteo físico (condicional) | 1.2, 3.7 | 6 | No | backend-data + frontend-pwa |

**Dependencias que el plan agrega al spec** (todas hacia tareas anteriores): 1.5 usa la "Entrada" de 1.2 para "Sumar piezas en tu tienda" e introduce `InventoryRuleError`; 1.7 usa `validateReason` de 1.2; 1.9 reutiliza la búsqueda de 1.5 y lista los traspasos de 1.8; 2.2 reutiliza `findPublicByCode` de 1.6; 2.4 va después de 2.3 porque edita los mismos archivos; 3.8 reutiliza `gate()`, la ficha y la selección múltiple de 1.7, el alta de 1.5, la unión de 1.6 (para probar que no toca la copia de la venta) y `FIXTURE_DEPARTMENTS` de 2.3, y va antes de 3.7 para que la carga entre con tipo.

**Totales:** antes de la demo (órdenes 1–17) ≈ 65.5 h (spec: ≈ 66 h). Con la Fase 3, ≈ 81.5 h (spec: ≈ 82 h); con la 3.8 (orden 23.5, addendum del 2026-11-10), ≈ 94.5 h (spec: ≈ 95 h). 1.13 aparte (6 h).

**Ruta crítica hasta la demo del 2026-11-19:**
- **Por dependencias:** 1.3 (4) → 1.2 (5) → 1.5 (8) → 1.6 (6) → 2.2 (4) → 2.3 (3) → 2.4 (4) → hito (3) = **37 h**. (1.1 corre en paralelo con 1.3; 1.7 y 1.8 tienen holgura.)
- **Con un solo ejecutor en serie (Claude):** la ruta real son las ≈ 65.5 h de las órdenes 1–17; del 11-10 al 11-18 son ≈ 7.3 h por día, sin holgura. Recortes posibles si se atrasa: llevar 1.10 y 2.4 a después de la demo pero antes de la salida (−7 h), y hacer la unión 1.6 solo con la pantalla mínima.
- **Bloqueos del dueño en la ruta:** 1.1 Step 8 (migración en `ventas-prueba`), 1.11 (pooler), 1.12 Step 7 (`push` y CI), merge y `push` de cada rama, variables del Preview y su deploy, asignación de departamentos (2.3 Step 8). Sin ellos no hay demo aunque el código esté listo.

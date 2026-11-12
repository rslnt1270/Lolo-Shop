# Subsistema H: migraciones aditivas y backfill de visibilidad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar la base lista para los subsistemas C, D y E mediante **la única migración aditiva de la versión final fuera de G** (migración 2 de 2), su mapeo al dominio, un script de backfill idempotente de visibilidad de productos y un runbook de salida a producción con respaldo, prueba de restauración, drift check, migración, relleno, verificación y retroceso.

**Architecture:** Un solo cambio de esquema generado con `prisma migrate dev --create-only` contra Postgres local, después de la migración 1 de G: `Product.color`, `Product.isPublished`, `Product.catalogPhotosCheckedAt`, `Location.isPublic` y la tabla `ColorOption`. La misma tarea mapea esas columnas al dominio (`lib/domain/types.ts`, `prisma-source.ts`, `fixture-source.ts`) para que C, D y E solo las consuman; ningún otro plan crea migraciones ni repite estas columnas. Un script `tsx` idempotente (`prisma/scripts/backfill-product-visibility.ts`) con un planificador puro (sin base de datos) y un ejecutor que aplica los cambios. La lista de productos a publicar la aporta el dueño en un CSV fuera del repo; sin CSV, nada se publica. El runbook de producción se añade como sección final de este mismo documento y sigue el patrón de `docs/runbooks/2026-11-salida-ventas.md`.

**Tech Stack:** Next.js 14, Prisma 5.22 sobre PostgreSQL (Neon en producción), TypeScript, `tsx`, Vitest (`npm test` para unidades; `npm run test:db` para pruebas de base contra `TEST_DATABASE_URL` local).

**Spec:** `docs/superpowers/specs/2026-11-11-alta-producto-tienda-design.md` (§6 referencia, §7 criterios C9–C16, §8 decisiones de revisión), `docs/superpowers/specs/2026-11-11-paleta-botones-catalogo-design.md` (§4 catálogo sincronizado con el stock), `docs/superpowers/specs/2026-11-11-alcance-inventario-simplificado-design.md` (sin cambios de esquema; `Movement` se conserva). Cronograma: `docs/superpowers/plans/2026-11-11-version-final-cronograma.md` (§3: H T1 depende **solo** de la migración 1 de G y se mezcla el viernes 13, antes de G T2–T8, D, E y C). Decisiones: `.superpowers/sdd/2026-11-11-version-final/decisiones.md` (1, 3 y 5).

## Global Constraints

- Migraciones solo con `prisma migrate` (generadas contra Postgres local); prohibido escribir SQL a mano en `prisma/migrations/`.
- Cambios aditivos únicamente: sin `DROP`, sin `RENAME`, sin cambiar tipos de columnas existentes, sin `NOT NULL` sin default sobre tablas con filas.
- Color: `Product.color` es `VarChar(40)`, opcional (`String? @db.VarChar(40)`).
- Tienda pública: `Location.isPublic` es `Boolean @default(true)` (decisión 3: las dos tiendas actuales se ven; las bodegas ya se excluyen por `type`); catálogo público = `Location.type = store` y `isPublic = true`. No hay pantalla ni paso de runbook para marcar tiendas.
- Publicación: `Product.isPublished` es `Boolean @default(false)` (el catálogo de producción ya está vacío; no es regresión). `Product.catalogPhotosCheckedAt` es `DateTime?`: fecha en que el servidor aceptó frente y atrás blancas revisadas; nulo en todos los productos existentes.
- Repo público: ningún host, usuario, contraseña ni URL de conexión en código, docs, commits o este plan. Solo nombres de variables (`DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`).
- Respaldos fuera del repo, en `~/respaldos/loloshop/`.
- Commits en Conventional Commits, en rama aparte (no en `main` directo).
- Sin Vercel en el build: las migraciones se corren a mano desde la terminal del dueño, antes de desplegar código que las use.

## Review Focus

1. **CSV con ids inexistentes o mal escritos** (espacios, BOM, mayúsculas): el script reporta cada id no encontrado, no publica nada a medias y termina con código de salida distinto de cero. Test: `planVisibility reporta ids del CSV que no existen y no cambia nada` (Task 2) y `ids con BOM y espacios se normalizan` (Task 2).
2. **Ejecutar el backfill dos veces**: la segunda corrida no cambia filas. Test: `backfill: segunda corrida no modifica filas` (Task 3).
3. **CSV vacío o ausente**: ningún producto queda publicado. Test: `sin CSV ni lista, ningún producto queda publicado` (Task 2).
4. **Producto con foto de frente y sin foto de atrás** (o con `imageUrl` nulo, o sin descripción): no se publica aunque esté en el CSV. Test: `publicar exige imageUrl, backImageUrl y descripción` (Task 2).
5. **Tienda desmarcada a mano o base sin tiendas**: el planificador devuelve advertencia, no falla en silencio. Test: `advierte cuando no hay ninguna Location pública` (Task 2).
6. **Producto con foto de tienda en ambos CSV**: gana la exclusión y su `catalogPhotosCheckedAt` queda nulo. Test: `forceUnpublishIds gana sobre publishIds` (Task 2) y `backfill: --unpublish limpia catalogPhotosCheckedAt` (Task 3).

---

### Task 1: Migración 2 (color, visibilidad, fotos revisadas, tienda pública, colores) y mapeo al dominio

**Files:**
- Modify: `prisma/schema.prisma` (models `Product`, `Location`, `User`; model nuevo `ColorOption`)
- Create (generado por Prisma, no a mano): `prisma/migrations/<timestamp de generación>_catalog_color_visibility/migration.sql` (p. ej. `20261113xxxxxx_catalog_color_visibility`; debe ordenar después de `20261111120000_add_product_types`)
- Modify: `lib/domain/types.ts` (`Product`, `Location`), `lib/data/prisma-source.ts` (`toProduct`, `getLocations`, `createLocation`), `lib/data/fixture-source.ts` (defaults)
- Test: `prisma/__tests__/migrations-additive.test.ts` (guarda única, junto a la de G; **no** se crea `lib/__tests__/migration-add-product-color-visibility.test.ts`), `lib/data/__tests__/prisma-catalog-columns.db.test.ts` (nuevo)

**Interfaces:**
- Consumes: esquema de `main` con la migración 1 de G ya mezclada (`20261111120000_add_product_types`, ver Task 4).
- Produces (Prisma):
  ```prisma
  // model Product
  color                  String?   @db.VarChar(40)
  isPublished            Boolean   @default(false)
  catalogPhotosCheckedAt DateTime?
  @@index([isPublished])

  // model Location
  isPublic  Boolean @default(true)

  // model nuevo
  model ColorOption {
    id          String   @id @default(uuid())
    key         String   @unique @db.VarChar(40)   // normalizeColorKey (plan D)
    label       String   @db.VarChar(40)           // displayColor (plan D)
    createdById String?
    createdBy   User?    @relation(fields: [createdById], references: [id], onDelete: SetNull)
    createdAt   DateTime @default(now())
  }
  // model User: colorOptions ColorOption[]
  ```
- Produces (dominio, `lib/domain/types.ts`): `Product` gana `color?: string | null`, `isPublished?: boolean`, `catalogPhotosCheckedAt?: string | null` (ISO, como `createdAt`); `Location` gana `isPublic?: boolean`. `toProduct` y `getLocations`/`createLocation` los mapean; fixtures: `isPublished: false`, `catalogPhotosCheckedAt: null`, `color: null`, `isPublic: true` salvo que el fixture diga otra cosa.
- Consumidores con estos nombres exactos: D (`color`, `catalogPhotosCheckedAt`, `ColorOption`), C (`isPublished`, `catalogPhotosCheckedAt`, `isPublic`), E (`color` en la búsqueda "Sin código"). Ninguno corre `prisma migrate`.

- [ ] **Step 1: Escribir la prueba de forma de la migración**

En `prisma/__tests__/migrations-additive.test.ts`, `describe("migración catalog_color_visibility")`:
- `"existe una sola carpeta *_catalog_color_visibility y ordena después de 20261111120000_add_product_types"`
- `"agrega color VARCHAR(40), isPublished BOOLEAN NOT NULL DEFAULT false, catalogPhotosCheckedAt TIMESTAMP(3) e isPublic BOOLEAN NOT NULL DEFAULT true"` (regex con espacios flexibles, como en G)
- `"crea la tabla ColorOption con key única"`
- `"no contiene DROP, RENAME ni ALTER COLUMN"`
- `"ninguna otra migración agrega color, isPublished, isPublic ni catalogPhotosCheckedAt"`: recorre todas las carpetas y cuenta cada `ADD COLUMN` de esos nombres = 1 en total.

- [ ] **Step 2: Ejecutar la prueba y confirmar que falla**

Run: `npx vitest run prisma/__tests__/migrations-additive.test.ts`
Expected: FAIL en el `describe` nuevo (no existe la carpeta). Los casos de G pasan.

- [ ] **Step 3: Editar `prisma/schema.prisma` con los campos de arriba**

Solo agregar líneas; no reordenar ni tocar otros modelos ni los campos de G.

- [ ] **Step 4: Validar el esquema y generar la migración contra Postgres local**

Terminal con `DATABASE_URL` y `SHADOW_DATABASE_URL` apuntando a un Postgres local (host local; comprobar con `isLocalDatabaseUrl` de `prisma/local-db.ts`):

Run: `npx prisma validate && npx prisma migrate dev --create-only --name catalog_color_visibility && npx prisma migrate dev`
Expected: `The schema at prisma/schema.prisma is valid`; se crea una carpeta `<timestamp>_catalog_color_visibility` con su `migration.sql` y se aplica en local. No editar el SQL.

- [ ] **Step 5: Ejecutar la prueba de forma y confirmar que pasa**

Run: `npx vitest run prisma/__tests__/migrations-additive.test.ts`
Expected: PASS.

- [ ] **Step 6: Verificar que la migración no cambia datos existentes y que no hay drift**

Run: `npx prisma migrate reset --force` contra la base local, luego `npx prisma migrate status` y `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --exit-code`.
Expected: `Database schema is up to date!` y código 0.

- [ ] **Step 7: Mapear al dominio (prueba que falla, luego implementación)**

En `prisma-catalog-columns.db.test.ts` (`describe.skipIf(!hasTestDb)`):
- `"getProducts lee color, isPublished false y catalogPhotosCheckedAt null por defecto"`
- `"getLocations: una tienda nueva es pública por defecto; isPublic false se respeta"`

Run: `npm run test:db -- lib/data/__tests__/prisma-catalog-columns.db.test.ts` → FAIL; implementar el mapeo de Files → PASS. Después `npx tsc --noEmit` y `npm test`.

- [ ] **Step 8: Commit y PR propio**

```bash
git add prisma/schema.prisma prisma/migrations prisma/__tests__/migrations-additive.test.ts lib/domain/types.ts lib/data/prisma-source.ts lib/data/fixture-source.ts lib/data/__tests__/prisma-catalog-columns.db.test.ts
git commit -m "feat(db): migración de color, publicación, fotos revisadas, tienda pública y colores"
```

PR desde `feat/migracion-catalogo` solo con Task 1. Se mezcla el viernes 13, antes de G T2–T8, D, E y C. Tasks 2–6 siguen en la misma rama.

---

### Task 2: Planificador puro de visibilidad

**Files:**
- Create: `prisma/scripts/lib/plan-visibility.ts`
- Test: `prisma/scripts/__tests__/plan-visibility.test.ts`

**Interfaces:**
- Consumes: tipo de fila `{ id: string; imageUrl: string | null; backImageUrl: string | null; description: string | null; isPublished: boolean; catalogPhotosCheckedAt: Date | null }` y `{ id: string; type: "store" | "warehouse"; isPublic: boolean }` (tiendas).
- Produces:
  ```ts
  export interface VisibilityPlan {
    publish: string[];          // ids a poner isPublished = true y catalogPhotosCheckedAt = now() si es nulo
    unpublish: string[];        // ids a poner isPublished = false
    clearChecked: string[];     // ids de exclusión: catalogPhotosCheckedAt = null (fotos de tienda)
    unknownIds: string[];       // ids del CSV que no existen en la base
    notPublishable: string[];   // ids del CSV sin imageUrl, sin backImageUrl o sin descripción
    warnings: string[];         // p. ej. "no hay tienda pública"
  }
  export function parseIdList(raw: string): string[];
  export function planVisibility(input: {
    products: ProductRow[];
    locations: LocationRow[];
    publishIds: string[];        // desde el CSV del dueño; [] por defecto
    forceUnpublishIds: string[]; // desde el CSV de exclusión; [] por defecto
  }): VisibilityPlan;
  ```

Reglas: `publish` = ids en `publishIds` que existen, tienen `imageUrl`, `backImageUrl` y descripción no vacía, y no están en `forceUnpublishIds`. Publicarlos por CSV es la confirmación del dueño de que sus fotos son blancas (decisión 5), por eso reciben `catalogPhotosCheckedAt`. `unpublish` = productos con `isPublished = true` que no están en `publish`. `clearChecked` = ids de `forceUnpublishIds` que existen y tienen `catalogPhotosCheckedAt` no nulo. Las existencias no se revisan aquí: el filtro del sitio (plan C) las exige en cada lectura. `parseIdList` quita BOM, espacios, líneas vacías y encabezado `id` si existe; no convierte a mayúsculas (los ids son uuid).

- [ ] **Step 1: Escribir las pruebas** (nombres exactos, en `prisma/scripts/__tests__/plan-visibility.test.ts`)

- `sin CSV ni lista, ningún producto queda publicado`: `publishIds: []` con productos `isPublished: true` produce `unpublish` con todos esos ids y `publish: []`.
- `publicar exige imageUrl, backImageUrl y descripción`: id en `publishIds` sin `backImageUrl` o con descripción `"  "` va a `notPublishable` y no a `publish`.
- `planVisibility reporta ids del CSV que no existen y no cambia nada`: id desconocido en `publishIds` aparece en `unknownIds`; `publish` no lo contiene.
- `ids con BOM y espacios se normalizan`: `parseIdList("﻿id\n  abc \n\n def\n")` devuelve `["abc", "def"]`.
- `forceUnpublishIds gana sobre publishIds`: un id en ambas listas no entra a `publish` y sí a `clearChecked` si tenía fecha.
- `advierte cuando no hay ninguna Location pública`: `locations` sin `type: "store"` con `isPublic: true` genera una entrada en `warnings`.
- `planVisibility es puro: misma entrada, misma salida`: dos llamadas idénticas devuelven objetos iguales.

- [ ] **Step 2: Ejecutar y confirmar que fallan**

Run: `npx vitest run prisma/scripts/__tests__/plan-visibility.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `parseIdList` y `planVisibility` en `prisma/scripts/lib/plan-visibility.ts`**

Sin acceso a base de datos. Usar `Set` para las búsquedas. Las firmas son las de Interfaces; el cuerpo es la lógica de las reglas de arriba.

- [ ] **Step 4: Ejecutar y confirmar que pasan**

Run: `npx vitest run prisma/scripts/__tests__/plan-visibility.test.ts`
Expected: 7 pruebas en PASS (más las que el implementador agregue).

- [ ] **Step 5: Commit**

```bash
git add prisma/scripts/lib/plan-visibility.ts prisma/scripts/__tests__/plan-visibility.test.ts
git commit -m "feat(db): planificador puro de visibilidad de productos"
```

---

### Task 3: Script de backfill idempotente

**Files:**
- Create: `prisma/scripts/backfill-product-visibility.ts`
- Test: `prisma/scripts/__tests__/backfill-product-visibility.db.test.ts`

**Interfaces:**
- Consumes: `parseIdList`, `planVisibility`, `VisibilityPlan` de Task 2; `Product.isPublished`, `Product.color`, `Location.isPublic` de Task 1.
- Produces:
  ```ts
  export interface BackfillVisibilityResult {
    published: number;     // filas cambiadas a true
    unpublished: number;   // filas cambiadas a false
    checkedCleared: number; // filas con catalogPhotosCheckedAt puesto en null
    plan: VisibilityPlan;
  }
  export async function backfillProductVisibility(
    prisma: PrismaClient,
    opts: { publishIds: string[]; forceUnpublishIds: string[]; allFalse: boolean }
  ): Promise<BackfillVisibilityResult>;
  ```
  CLI: `npx tsx prisma/scripts/backfill-product-visibility.ts [--publish <ruta.csv>] [--unpublish <ruta.csv>] [--all-false]`. `--all-false` fuerza `isPublished = false` en todos (retroceso; no toca `catalogPhotosCheckedAt`). Sin argumentos: no publica nada. No hay opción para marcar tiendas (`Location.isPublic` ya es `true` por defecto).

Notas de implementación: las escrituras van en una transacción interactiva con `lib/data/tx-options.ts` (`maxWait` 5 s, `timeout` 10 s). Solo se actualizan filas cuyo estado cambia (`updateMany` con `where: { id: { in: [...] }, isPublished: <valor contrario> }`), así la segunda corrida no escribe nada. Al publicar, `catalogPhotosCheckedAt` se pone en `now()` solo donde es nulo (`updateMany` con `catalogPhotosCheckedAt: null`). Salida en consola: `Visibilidad lista: P publicados, U despublicados, F fotos de tienda excluidas.` Código de salida 1 si `unknownIds` o `notPublishable` no están vacíos (los cambios válidos sí se aplican).

- [ ] **Step 1: Escribir las pruebas de base** (`npm run test:db`, contra `TEST_DATABASE_URL` local)

- `backfill: segunda corrida no modifica filas`: primera corrida con un producto válido en `publishIds` devuelve `published: 1`; la segunda devuelve `published: 0` y `unpublished: 0`.
- `backfill: --all-false deja todos los productos sin publicar`: con dos productos publicados, `allFalse: true` devuelve `unpublished: 2` y ambos quedan en `false`.
- `backfill: publicar pone catalogPhotosCheckedAt solo si era nulo`: un producto ya revisado conserva su fecha.
- `backfill: --unpublish limpia catalogPhotosCheckedAt`: un producto con fecha y en el CSV de exclusión queda con `isPublished = false` y fecha nula.
- `backfill: no toca color ni Location.isPublic`: tras correr el backfill, `Product.color` y `Location.isPublic` siguen igual.

- [ ] **Step 2: Ejecutar y confirmar que fallan**

Run: `npm run test:db -- prisma/scripts/__tests__/backfill-product-visibility.db.test.ts`
Expected: FAIL (script no existe).

- [ ] **Step 3: Implementar `backfillProductVisibility` y el CLI en `prisma/scripts/backfill-product-visibility.ts`**

Seguir el estilo de `prisma/scripts/backfill-brand-department.ts` (encabezado con uso, función exportada, bloque `main` que solo corre si es el archivo ejecutado).

- [ ] **Step 4: Ejecutar y confirmar que pasan**

Run: `npm run test:db -- prisma/scripts/__tests__/backfill-product-visibility.db.test.ts`
Expected: 5 pruebas en PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/scripts/backfill-product-visibility.ts prisma/scripts/__tests__/backfill-product-visibility.db.test.ts
git commit -m "feat(db): backfill idempotente de visibilidad de productos"
```

---

### Task 4: Dependencia con G y orden de migraciones

**Files:** ninguno. Esta tarea no modifica `prisma/schema.prisma` ni carpetas de G.

**Interfaces:**
- Consumes: la migración 1 de G (`20261111120000_add_product_types`) mezclada en `main` el jueves 12 (G Task 1, PR propio).
- Produces: regla de orden para Task 1. **Esta tarea se ejecuta antes que Task 1.**

- [ ] **Step 1: Confirmar que G está mergeada antes de generar la migración de H**

Run: `git log --oneline main -- prisma/schema.prisma | head -5`
Expected: aparece el commit de G Task 1 y existe `prisma/migrations/20261111120000_add_product_types/`. Si no, Task 1 espera; no se adelanta generando contra un esquema sin G.

- [ ] **Step 2: Si G tiene su propia migración, verificar que la de H tiene un nombre de carpeta posterior**

Run: `ls prisma/migrations | tail -5`
Expected: la carpeta de H aparece después de la de G (Prisma aplica en orden lexicográfico de timestamp). Si Task 1 se generó antes, regenerarla después de hacer rebase sobre `main`, nunca editar la carpeta de G.

- [ ] **Step 3: Commit**: no aplica (sin cambios).

---

### Task 5: Lista de visibilidad del dueño (paso manual)

**Files:** ninguno en el repo. El CSV vive en `~/respaldos/loloshop/visibilidad/`.

**Interfaces:**
- Consumes: exportación de productos con `id`, `title`, `imageUrl`, `backImageUrl` (consulta de solo lectura, Step 1).
- Produces: `publicar.csv` (ids a publicar; el dueño confirma que sus fotos de frente y atrás son blancas) y, opcional, `excluir.csv` (ids que el dueño confirma que tienen foto de tienda y deben quedar fuera del sitio hasta que se tomen fotos nuevas en el alta o la ficha, plan D).

Regla por defecto: **ningún producto queda publicado** hasta que el dueño confirme la lista. Sin archivos, el backfill no publica nada.

- [ ] **Step 1: Generar la lista para revisión**

Run (con `DIRECT_URL` de producción exportada solo en la terminal):
```bash
mkdir -p ~/respaldos/loloshop/visibilidad
psql "$DIRECT_URL" --csv -c 'SELECT id, title, brand, "imageUrl" IS NOT NULL AS tiene_frente, "backImageUrl" IS NOT NULL AS tiene_atras, coalesce(trim(description), '"''"') <> '"''"' AS tiene_descripcion FROM "Product" WHERE "mergedIntoId" IS NULL ORDER BY brand, title' > ~/respaldos/loloshop/visibilidad/revision.csv
```
Expected: un CSV con una fila por producto activo. Se revisa en una hoja de cálculo; no se sube al repo.

- [ ] **Step 2: El dueño marca las fotos de tienda**

Anotar en `~/respaldos/loloshop/visibilidad/excluir.csv` (columna `id`) los productos cuyas fotos tienen fondo de tienda. El dueño confirma la lista por escrito (nombre y fecha) antes de continuar.
Expected: lista firmada. Si no hay firma, se corre el backfill sin `--publish` y todo queda sin publicar.

- [ ] **Step 3: Armar `publicar.csv`**

Contiene los ids de las prendas con frente y atrás en fondo blanco confirmadas por el dueño, con encabezado `id`. Sin encabezado válido el script lo rechaza.
Expected: archivo presente solo si el dueño lo aprobó.

- [ ] **Step 4: Commit**: no aplica.

---

### Task 6: Verificación de la base en local antes de producción

**Files:** ninguno.

- [ ] **Step 1: Suite completa**

Run: `npm test && npm run test:db && npm run typecheck && npm run lint`
Expected: todo en verde.

- [ ] **Step 2: Backfill dos veces en la base local de ensayo**

Run: `npx tsx prisma/scripts/backfill-product-visibility.ts && npx tsx prisma/scripts/backfill-product-visibility.ts`
Expected: la primera imprime `Visibilidad lista: ...`; la segunda imprime `Visibilidad lista: 0 publicados, 0 despublicados, 0 fotos de tienda excluidas.`

---

## Runbook de producción (H)

Sigue el orden de `docs/runbooks/2026-11-salida-ventas.md`. Lo ejecuta el dueño con un asistente. Terminal nueva, sin variables heredadas.

**Reglas**
- Solo en horario sin ventas y fuera del congelamiento del Buen Fin. Sin respaldo verificado del mismo día, no se toca producción.
- Orden obligatorio: **base, después código**. Migraciones antes de desplegar el código que las usa.
- Este documento no contiene valores de conexión. Se exportan `DIRECT_URL` y `DATABASE_URL` de producción en la terminal (con `read -rsp`, como en el runbook de ventas) y se verifica el host con la comprobación de pooler de esa guía.
- **Orden con el catálogo:** el filtro del sitio público (`isPublished` + elegibilidad, plan C Task 2a) se despliega con C. El backfill de Task 3 se corre **antes** de desplegar ese código; si no, el sitio queda vacío hasta que alguien publique desde la ficha.
- Este runbook aplica las **dos** migraciones de la versión final (1: G, 2: H) y los dos rellenos (tipos de G, visibilidad de H) en una sola ventana.

**R0. Prerrequisitos**
- [ ] G (Tasks 1–7) y H (Tasks 1–3) mezclados en `main`; `npm test`, `npm run test:db` y `npx tsc --noEmit` en verde.
- [ ] Task 5 con `publicar.csv` aprobado o sin archivo (decisión registrada).
- [ ] Responsables anotados (respaldo, ejecución, acompañamiento) y hora de la ventana.

**R1. Respaldo (Fase A del runbook de ventas)**
```bash
mkdir -p ~/respaldos/loloshop
pg_dump "$DIRECT_URL" --format=custom --no-owner --file ~/respaldos/loloshop/prod-H-$(date +%F-%H%M).dump
pg_restore --list ~/respaldos/loloshop/prod-H-*.dump | head
```
Expected: archivo de tamaño mayor que cero; la lista incluye `Product`, `Location`, `Variant`, `InventoryLevel`, `Movement`.

**R2. Prueba de restauración**
```bash
pg_restore --no-owner --dbname "$SHADOW_DATABASE_URL" ~/respaldos/loloshop/prod-H-*.dump
for t in User Location Product Variant InventoryLevel Movement; do
  echo -n "$t prod: "; psql "$DIRECT_URL" -Atc "SELECT count(*) FROM \"$t\""
  echo -n "$t resto: "; psql "$SHADOW_DATABASE_URL" -Atc "SELECT count(*) FROM \"$t\""
done
```
Expected: pares de conteos idénticos. Si no coinciden, repetir R1. Luego vaciar la base sombra.

**R3. Drift check contra el esquema de `main` previo a H**

Producción debe coincidir con el esquema **del commit desplegado en producción** (hoy `d84ca3e`; confirmarlo en Vercel antes de empezar y usar ese hash como `PREV`). No usar el `main` actual: ya trae las migraciones 1 y 2. Guardar el esquema fuera del repo:
```bash
mkdir -p ~/respaldos/loloshop/tmp
PREV=d84ca3e   # reemplazar por el commit del deploy de producción vigente
git show "$PREV":prisma/schema.prisma > ~/respaldos/loloshop/tmp/prev.prisma
npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel ~/respaldos/loloshop/tmp/prev.prisma --exit-code; echo "codigo: $?"
```
Expected: `No difference detected.` y `codigo: 0`. Con código 2 se detiene: no se migra.

**R4. Migraciones**
```bash
npx prisma migrate status            # debe listar exactamente 2 pendientes: 20261111120000_add_product_types y <timestamp>_catalog_color_visibility
npx prisma migrate deploy
npx prisma migrate status
```
Expected: `All migrations have been successfully applied.` y luego `Database schema is up to date!`. Si `deploy` falla a medias, no reintentar a ciegas: restaurar R1 en una rama nueva y analizar el error.

**R5. Rellenos (con `DATABASE_URL` de producción en la misma terminal)**
```bash
# R5a. Tipos (plan G), dos veces; la segunda reporta 0 en todo
npx tsx prisma/scripts/backfill-product-types.ts
npx tsx prisma/scripts/backfill-product-types.ts
# R5b. Visibilidad (este plan), dos veces
npx tsx prisma/scripts/backfill-product-visibility.ts [--publish ~/respaldos/loloshop/visibilidad/publicar.csv] [--unpublish ~/respaldos/loloshop/visibilidad/excluir.csv]
npx tsx prisma/scripts/backfill-product-visibility.ts [mismas opciones]
```
Expected: R5a como en G Task 8; R5b: la primera imprime `Visibilidad lista: P publicados, U despublicados, F fotos de tienda excluidas.`; la segunda imprime `0 publicados, 0 despublicados, 0 fotos de tienda excluidas.` Código de salida 1 significa ids no encontrados o no publicables: revisar la salida antes de seguir.

**R6. Consultas de verificación (solo lectura)**
```bash
psql "$DIRECT_URL" -Atc 'SELECT count(*) FILTER (WHERE "isPublished") AS publicados, count(*) AS total FROM "Product"'
psql "$DIRECT_URL" -Atc 'SELECT name, type, "isPublic" FROM "Location" ORDER BY name'
psql "$DIRECT_URL" -Atc 'SELECT count(*) FROM "Product" WHERE "isPublished" AND ("imageUrl" IS NULL OR "backImageUrl" IS NULL OR "catalogPhotosCheckedAt" IS NULL)'
psql "$DIRECT_URL" -Atc 'SELECT count(*) FROM "Product" WHERE color IS NOT NULL'
```
Expected: las tiendas tienen `isPublic = t`; la tercera consulta devuelve `0`; `publicados` coincide con lo aprobado por el dueño; la cuarta es `0` (la columna es nueva y nadie ha llenado color todavía).

**R7. Despliegue de código**
Merge a `main` (o promoción del deploy verificado) cuando R4–R6 estén bien. Anotar el identificador del deploy anterior para retroceso.

**R8. Pruebas de humo en producción**
- [ ] Login como owner.
- [ ] `/productos` abre y lista productos sin error.
- [ ] `/catalogo` muestra solo productos publicados y elegibles (fotos revisadas, descripción, existencias en tienda pública).
- [ ] `npx prisma migrate status` dice `Database schema is up to date!`.
- [ ] Runtime Logs de Vercel sin errores de Prisma durante 10 minutos.

**Retroceso**

*Opción 1, código:* promover el deploy anterior en Vercel. Seguro porque las columnas son nullable o tienen default y el código anterior no las usa.

*Opción 2, visibilidad mal asignada (sin pérdida de datos):* correr `npx tsx prisma/scripts/backfill-product-visibility.ts --all-false` con `DATABASE_URL` de producción. Deja todo sin publicar; después se vuelve a correr con la lista correcta.

*Opción 3, base dañada:* restaurar R1 (`pg_restore --clean --if-exists --no-owner --dbname "$DIRECT_URL" ...`) o el punto en el tiempo de Neon. Se pierden ventas posteriores al respaldo; registrarlas para reingresarlas. Después de cualquier retroceso, no reintentar el mismo día.

**Registro**
- Autoriza el retroceso: ______
- Firma del dueño y hora: ______

---

## Preguntas abiertas para el dueño

1. ~~Catálogo público al desplegar.~~ **Resuelta (decisión 3):** `isPublished` arranca en `false`; el catálogo de producción ya está vacío, así que no es regresión.
2. ~~Tienda pública.~~ **Resuelta (decisión 3):** `Location.isPublic @default(true)`; sin paso de runbook.
3. ~~Campo "publicar".~~ **Resuelta (decisión 1):** "Publicar" decide solo el sitio web (`/catalogo` y recorrido 3D). La acción y el filtro son del plan C.
4. ~~Lista de colores.~~ **Resuelta (auditoría B1):** tabla `ColorOption` con `key @unique` (dos altas concurrentes no duplican color). Sin `AppSetting.colorPalette`.
5. **Congelamiento:** ¿la ventana de R4–R7 cae antes del Buen Fin? (sigue abierta; no afecta la demo, que corre en preview).

## Notas para el revisor

- Dependencia con G: la migración 2 se genera después de que la migración 1 de G esté en `main` (Task 4). H no modifica ninguna carpeta de migración de G.
- Consumidores: D (`color`, `catalogPhotosCheckedAt`, `ColorOption`), C (`isPublished`, `catalogPhotosCheckedAt`, `isPublic`) y E (`color`). Cualquier cambio de nombre se corrige aquí antes de generar la migración; C y D no tienen tareas de esquema.

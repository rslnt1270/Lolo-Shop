# LoloShop: tarea 3.8, clasificación de productos por departamento y tipo (addendum al spec v2)

**Fecha:** 2026-11-10 · **Estado:** diseño para planificar · **Tarea:** 3.8 (orden 23.5), después de la demo y de la 3.6, **antes de la 3.7**
**Base:** spec v2 (`2026-11-09-loloshop-implementaciones-posteriores-design.md`, autoridad), modelo de datos (`2026-11-05-modelo-datos-er.md`, §2.3 y la nueva §2.9), SRS (RF-CAT-03, D-CAT-2). Contratos leídos del código real de la rama `feat/editar-producto` (tareas 1.1 a 1.7): `lib/products/actions.ts` (`gate()`, `updateProductAction`, `assignDepartmentAction`), `lib/domain/new-product.ts` (`PRODUCT_CATEGORIES`, `NewProductInput.sizes`), `lib/data/source.ts` (`CreateProductData`, `ProductPatch`), `lib/actions.ts` (`createProductAction`), `lib/catalog/actions.ts` (`listDepartmentsAction`), `lib/data/prisma-sales-source.ts` (`createSale` copia `departmentId` y `category`), `prisma/scripts/backfill-brand-department.ts`.

(T) = prueba automática; (M) = verificación manual; "h" = horas de agente.

---

## 1. Por qué y decisiones del dueño (2026-11-10, vinculantes)

Hoy `Product.category` es texto validado contra `PRODUCT_CATEGORIES` (7 valores en código) y mezcla dos ejes: "Accesorios" y "Tenis" son categorías y, a la vez, `accesorios` y `calzado` son departamentos. No hay relación departamento ↔ tipo (el alta ofrece "Perfumes" en Niños), los productos viejos tienen `category = "General"` (ningún chip los encuentra) y no hay dónde guardar "polo". Antes de cargar la mercancía real (3.7), cada prenda debe entrar con un tipo confiable para que el stock por tipo salga bien.

1. **Opción B.** `ProductType` es **global** (Playeras, Pants, Tenis). La tabla puente `DepartmentProductType` dice qué tipos aplican en cada departamento. El producto lleva `Product.productTypeId`; la venta guarda una **copia sin FK** en `SaleLine.productTypeId`, igual que `departmentId`. Durante la transición se escribe también `Product.category` (= nombre del tipo), como se hizo con `brand`/`brandId`.
2. **"Polo" es un atributo de estilo**, no un tipo, y no va en la descripción.
3. **El calzado de niño va en Calzado**, con el atributo **"para"** (dama, caballero o niño).
4. **Orden:** 3.8 va después de la demo y antes de la 3.7: la mercancía real entra con tipo obligatorio.
5. **Prioridad:** que el backend registre bien el stock. El dashboard de stock por tipo queda para después; aquí solo la **consulta base** y su prueba.

---

## 2. Modelo de datos

```prisma
model ProductType {
  id          String                  @id @default(uuid())
  slug        String                  @unique          // "playera", "tenis"; estable, nunca cambia
  name        String                  @unique          // "Playeras"; es lo que se copia a Product.category
  sortOrder   Int                     @default(0)      // orden en selects y reportes, igual en todos los departamentos
  isActive    Boolean                 @default(true)
  products    Product[]
  departments DepartmentProductType[]
  createdAt   DateTime                @default(now())
  updatedAt   DateTime                @default(now()) @updatedAt
}

model DepartmentProductType {
  departmentId  String
  productTypeId String
  createdAt     DateTime    @default(now())
  department    Department  @relation(fields: [departmentId], references: [id], onDelete: Restrict)
  productType   ProductType @relation(fields: [productTypeId], references: [id], onDelete: Restrict)

  @@id([departmentId, productTypeId])
  @@index([productTypeId])
}

// Product:    + productTypeId String?   + productType ProductType? @relation(fields: [productTypeId], references: [id], onDelete: Restrict)
//             + style    String? @db.VarChar(40)   // slug de estilo (§3), validado en el servidor
//             + audience String? @db.VarChar(20)   // "para": dama | caballero | nino (§3), solo en Calzado
//             + @@index([productTypeId])
// Department: + productTypes DepartmentProductType[]
// SaleLine:   + productTypeId String?   (copia sin FK, como departmentId)  + @@index([productTypeId])
```

Decisiones de forma:
- **`name @unique`**: `category` se llena con el nombre, así que dos tipos con el mismo nombre romperían el filtro y los reportes de texto.
- **Nombres en plural** ("Playeras", "Pantalones", "Tenis", "Perfumes"): coinciden con los valores viejos de `category` y con `SaleLine.category` ya guardado, así que el filtro de `/productos`, la búsqueda del bot y el histórico siguen funcionando sin reescribir texto.
- **Sin `sortOrder` en la puente**: el orden global del tipo basta (Playeras antes que Pants en todos los departamentos). Si el dueño pide un orden distinto por departamento, es una columna anulable más.
- `Product.productTypeId` es **opcional en la base** (como `departmentId`, ER §2.3 A3): los productos viejos sin tipo siguen siendo válidos. Es **obligatorio en el servidor** para las altas nuevas (§6). Hacerlo `NOT NULL` es una migración posterior, aparte, cuando "Por revisar" quede en cero.
- **Invariante de transición:** si `productTypeId` no es nulo, `category === ProductType.name`. Todo camino de escritura (alta, edición, lote, relleno) lo respeta; el texto nunca lo manda el cliente.

---

## 3. Atributos: `estilo` y `para`

### 3.1 Qué son

| Atributo | Valores | Aplica a | Obligatorio |
|---|---|---|---|
| **estilo** (`Product.style`) | slug de una lista **por tipo** (§3.3). "polo" está confirmado; el resto es propuesta | Solo tipos con lista de estilos (hoy Playeras, Camisas, Sudaderas, Pants) | No. Un valor como máximo |
| **para** (`Product.audience`) | `dama`, `caballero`, `nino` (etiquetas "Dama", "Caballero", "Niño") | Solo departamento `calzado` | **Sí** en altas nuevas de Calzado; prohibido fuera de Calzado |

El estilo es **un solo valor** por producto: describe la variante de corte que el cliente pide por nombre ("una polo"). Otras dimensiones (manga, corte, tiro) quedan fuera; si se piden, cada una es su propio atributo, no se mezclan en `estilo`.

### 3.2 Forma: comparación y recomendación

| Forma | Esquema | A favor | En contra |
|---|---|---|---|
| (a) Columna JSON validada | `Product.attributes Json?` con `{ estilo?, para? }` y validación en código | Un atributo nuevo no pide migración | El tipo de Prisma para JSON es incómodo (`Prisma.JsonNull`), la validación se duplica en Prisma y Fixture, los reportes necesitan `->>` en SQL crudo, la forma puede derivar sin que `tsc` lo note |
| (b) Tablas | `Attribute`, `AttributeValue` y `ProductAttributeValue` (EAV) | El dueño administra valores sin desplegar; integridad por FK | Unas 6 h más, tres tablas, UI de chips; demasiado para dos atributos conocidos |
| (c) **Columnas dedicadas** | `Product.style String?` y `Product.audience String?`, valores validados contra listas en código | Tipado en `Product`, `where`/`groupBy` directos, Fixture trivial, reporte sin JSON, migración de dos columnas anulables | Agregar un estilo requiere desplegar (igual que hoy `PRODUCT_CATEGORIES`); otro atributo = otra columna aditiva |

**Recomendación: (c).** Los dos atributos están definidos por el dueño y tienen semántica fija; el costo de (a) y (b) no compra nada que se necesite antes de la carga. Las listas de estilos viven en `lib/domain/product-types-catalog.ts` (`STYLE_OPTIONS`, por slug de tipo). Cuando exista la pantalla del owner (etapa 2, §9) y pida administrar estilos, se pasa a una tabla `ProductStyle` con el mismo patrón que `brand`/`brandId` (el slug guardado en `style` se mapea a la FK por relleno), sin perder datos.

`audience` es texto validado y no enum de Postgres por la misma razón que `Department` (ER §2.3): si el dueño agrega "unisex" o "bebé", es un cambio de código sin migración.

### 3.3 Estilos iniciales por tipo (**pendiente de confirmar por el dueño**; solo "polo" está confirmado)

| Tipo (slug) | Estilos (slug: etiqueta) |
|---|---|
| `playera` | `polo`: Polo · `cuello-redondo`: Cuello redondo · `cuello-v`: Cuello V · `sin-mangas`: Sin mangas |
| `camisa` | `polo`: Polo · `de-vestir`: De vestir · `casual`: Casual |
| `sudadera` | `con-capucha`: Con capucha · `sin-capucha`: Sin capucha · `con-cierre`: Con cierre |
| `pants` | `jogger`: Jogger · `recto`: Recto |
| los demás | sin estilos (el campo no se muestra) |

---

## 4. Lista inicial de tipos por departamento (**pendiente de confirmar por el dueño**)

29 tipos globales y 55 pares departamento × tipo. El repo es público: la lista no lleva datos sensibles. La fuente única en código es `lib/domain/product-types-catalog.ts` (`PRODUCT_TYPE_CATALOG` y `DEPARTMENT_TYPE_SLUGS`); la usan el seed, el relleno y los fixtures.

| # | slug | Nombre | Dama | Caballero | Niños | Calzado | Accesorios |
|---|---|---|---|---|---|---|---|
| 1 | `playera` | Playeras | sí | sí | sí | | |
| 2 | `blusa` | Blusas | sí | | sí | | |
| 3 | `camisa` | Camisas | sí | sí | sí | | |
| 4 | `sudadera` | Sudaderas | sí | sí | sí | | |
| 5 | `chamarra` | Chamarras | sí | sí | sí | | |
| 6 | `sueter` | Suéteres | sí | sí | | | |
| 7 | `jeans` | Jeans | sí | sí | sí | | |
| 8 | `pantalon` | Pantalones | sí | sí | sí | | |
| 9 | `pants` | Pants | sí | sí | sí | | |
| 10 | `leggings` | Leggings | sí | | sí | | |
| 11 | `shorts` | Shorts | sí | sí | sí | | |
| 12 | `falda` | Faldas | sí | | sí | | |
| 13 | `vestido` | Vestidos | sí | | sí | | |
| 14 | `conjunto` | Conjuntos | sí | sí | sí | | |
| 15 | `ropa-interior` | Ropa interior | sí | sí | sí | | |
| 16 | `traje-de-bano` | Trajes de baño | sí | sí | | | |
| 17 | `tenis` | Tenis | | | | sí | |
| 18 | `zapato` | Zapatos | | | | sí | |
| 19 | `sandalia` | Sandalias | | | | sí | |
| 20 | `bota` | Botas | | | | sí | |
| 21 | `gorra` | Gorras | | | | | sí |
| 22 | `bolsa` | Bolsas | | | | | sí |
| 23 | `mochila` | Mochilas | | | | | sí |
| 24 | `cartera` | Carteras | | | | | sí |
| 25 | `cinturon` | Cinturones | | | | | sí |
| 26 | `calcetines` | Calcetines | | | | | sí |
| 27 | `lentes` | Lentes | | | | | sí |
| 28 | `perfume` | Perfumes | | | | | sí |
| 29 | `raqueta-padel` | Raquetas de pádel | | | | | sí |
| | | **Pares** | 16 | 12 | 14 | 4 | 9 |

Reglas de la lista: Dama, Caballero y Niños agrupan por **público**; Calzado y Accesorios por **tipo de producto** (el público del calzado va en "para"). No hay tipo "Otro": si falta uno, lo agrega el dueño (seed ahora, pantalla después). "Hoodies" desaparece como nombre: es "Sudaderas" (estilo "Con capucha").

---

## 5. Migración y relleno

### 5.1 Migración `add_product_types` (aditiva)

Se genera contra Postgres **local** con `prisma migrate diff --from-migrations … --to-schema-datamodel … --script` (como 1.1), con timestamp posterior a `20261110120000_inventory_controls`. Solo puede contener: `CREATE TABLE "ProductType"`, `CREATE TABLE "DepartmentProductType"`, `ADD COLUMN` anulables (`Product.productTypeId`, `Product.style`, `Product.audience`, `SaleLine.productTypeId`), `CREATE INDEX`/`CREATE UNIQUE INDEX` y `ADD CONSTRAINT … FOREIGN KEY` sobre columnas nuevas. Sin `DROP`, `ALTER COLUMN`, `SET NOT NULL` ni `CHECK`; ningún `ADD COLUMN` con `NOT NULL`. No se edita el SQL. **Ningún dato se escribe en la migración.** Va a producción con la salida (3.7), junto a las de ventas y 1.1.

### 5.2 Relleno `prisma/scripts/backfill-product-types.ts` (idempotente, sin SQL a mano)

Mismo patrón que `backfill-brand-department.ts`: función exportada `backfillProductTypes(prisma): Promise<BackfillProductTypesResult>` y ejecución directa con `npx tsx`. Pasos, en este orden:

1. **Departamentos:** lee `Department` por slug. Si falta alguno de los cinco de `DEPARTMENT_TYPE_SLUGS`, **aborta antes de escribir** con "Falta el departamento <slug>: corre primero backfill-brand-department.".
2. **Tipos:** por cada entrada de `PRODUCT_TYPE_CATALOG`, `findUnique({ where: { slug } })`; si no existe, `create`. **No actualiza** los existentes (no pisa un renombre futuro del owner). Cuenta los creados.
3. **Pares:** `departmentProductType.createMany({ data, skipDuplicates: true })`; cuenta los insertados.
4. **Productos:** mapa `texto viejo → slug` = `LEGACY_CATEGORY_TO_TYPE` (`Playeras→playera`, `Pantalones→pantalon`, `Hoodies→sudadera`, `Tenis→tenis`, `Perfumes→perfume`, `Raquetas de Padel→raqueta-padel`) más cada `ProductType.name → slug` (un producto que ya trae el nombre nuevo también se mapea). Por cada entrada: `product.updateMany({ where: { productTypeId: null, category: <texto> }, data: { productTypeId, category: <ProductType.name> } })`. No toca `departmentId`, `style` ni `audience`, y **no infiere** estilo ni "para" desde el título.
5. **Ventas:** con el mismo mapa, `saleLine.updateMany({ where: { productTypeId: null, category: <texto> }, data: { productTypeId } })`. Toma **la copia de la venta** (`SaleLine.category`), nunca el producto actual, y **no cambia** `SaleLine.category` (es histórica).
6. **Sin mapear:** `product.groupBy({ by: ["category"], where: { productTypeId: null }, _count: true })` → `unmapped: Record<string, number>`. "General", "Accesorios" (ambiguo: ¿gorra o bolsa?) y cualquier texto fuera del mapa quedan **sin tipo** ("Por revisar", §8).

`BackfillProductTypesResult = { types: number; pairs: number; products: number; saleLines: number; unmapped: Record<string, number> }`. La segunda corrida da `{ types: 0, pairs: 0, products: 0, saleLines: 0, unmapped: <igual> }`. La consola imprime solo conteos y nombres de categoría (nunca datos de clientes).

### 5.3 Seed

`prisma/seed.ts` (con la guarda de 1.4) hace `upsert` por slug de los 29 tipos (`update: { name, sortOrder }`, solo local) y `createMany … skipDuplicates` de los 55 pares, después de los departamentos.

---

## 6. Reglas de validación

Funciones puras en `lib/domain/product-taxonomy.ts`; el servidor siempre decide con datos releídos de la base.

| Regla | Dónde | Mensaje al operador |
|---|---|---|
| Alta nueva sin tipo | `validateNewProduct` y `createProductAction` | "Elige el tipo." |
| Tipo inexistente o inactivo | acción (lee `ProductType`) | "Ese tipo ya no está activo. Elige otro de la lista." |
| Par (departamento, tipo) fuera de la puente | acción (`ProductType.departments` filtrado por `departmentId`) | "Ese tipo no aplica al departamento elegido. Elige otro de la lista." |
| Departamento `calzado` sin "para" | `validateClassification` | "En Calzado elige para quién es: dama, caballero o niño." |
| "para" fuera de Calzado | `validateClassification` | "«Para» solo se usa en Calzado." |
| "para" con valor fuera de `AUDIENCES` | `validateNewProduct` y `validateClassification` | "Elige para quién es: dama, caballero o niño." |
| Estilo que no está en `STYLE_OPTIONS[tipo]` | `validateClassification` | "Ese estilo no aplica a ese tipo." |
| Estilo `""` o `null` | | se guarda `null` |

- **Alta** (`createProductAction`): `NewProductInput.category` se **sustituye** por `productTypeId: string` (obligatorio), `style?: string | null` y `audience?: string | null`. El servidor lee el departamento (`isActive`, `slug`) y el tipo (`name`, `slug`, `isActive`, si aplica al departamento), valida y llama a `createProduct` con `category = ProductType.name`. Cualquier `category` que mande el cliente se ignora.
- **Agregar talla** (`addVariantAction`, 1.5): sin cambios; el tipo es del producto.
- **Edición individual** (`updateProductAction`): la clasificación se guarda **en bloque**. Si llega cualquiera de `departmentId`, `productTypeId`, `style` o `audience`, deben llegar `departmentId` **y** `productTypeId` (con `style` y `audience` explícitos, `null` permitido); si no, INVALID "Elige departamento y tipo.". El bloque se valida completo con las reglas de arriba, sin leer el estado anterior. Editar solo título o marca no exige nada de clasificación (un producto viejo "Por revisar" se puede corregir de título sin clasificarlo). El parámetro `category` de 1.7 desaparece.
- **Tipo en lote** (`assignProductTypeAction`, nuevo): owner o manager (`gate()` de 1.7, rol releído de la base); de 1 a 100 ids; tipo activo. En una transacción: si algún producto seleccionado tiene departamento y el par no existe, INVALID "«{tipo}» no aplica a {n} de los productos elegidos. Quítalos de la selección." y **no se escribe nada**; los productos sin departamento sí se aceptan. Escribe `productTypeId` y `category`; un `style` que no esté en la lista del tipo nuevo se pone en `null` y se cuenta (`styleCleared`); `audience` y `departmentId` no se tocan.
- **Colaborador:** elige tipo, estilo y "para" en el alta; no edita la clasificación después (regla de 1.7).

---

## 7. Cambio de departamento en lote (`assignDepartmentAction`, 1.7)

**Su contrato y su comportamiento no cambian.** No toca `productTypeId`, `style` ni `audience`, y sigue devolviendo `{ ok: true, updated }`. Razones: (1) rechazar el lote por un tipo incompatible bloquearía la tarea más común del owner (asignar departamento a cientos de productos viejos sin tipo); (2) borrar el tipo destruiría información correcta (una sudadera movida de Dama a Niños sigue siendo sudadera); (3) no reabre una tarea ya terminada.

Si el par queda fuera de la puente, o el producto llega a Calzado sin "para", o sale de Calzado con "para", el producto **sigue siendo válido** y aparece en **"Por revisar"** (§8). La pantalla `/productos`, después de un lote exitoso, recalcula con la función pura `classificationIssues` sobre la lista recargada y avisa: "{n} productos quedaron por revisar: su tipo no aplica a {departamento}." (o "les falta «para»"). La edición individual y el lote de tipo sí exigen el par válido.

---

## 8. "Por revisar"

`classificationIssues(product, rules): ClassificationIssue[]`, pura, con `rules` = departamentos activos y tipos activos con sus `departmentIds` (lo que devuelve `listProductTypesAction`). Problemas, en este orden fijo: `SIN_DEPARTAMENTO`, `SIN_TIPO`, `TIPO_INACTIVO` (el id no está entre los activos), `TIPO_NO_APLICA`, `FALTA_PARA`, `PARA_SOBRA`, `ESTILO_NO_APLICA`.

En `/productos`, owner y manager ven el chip **"Por revisar"** (pantalla interna), que filtra los productos activos con al menos un problema, y la acción en lote **"Asignar tipo"** junto a "Asignar departamento". Los chips de tipo de `/productos` salen de `listProductTypesAction` (nombres), no de `PRODUCT_CATEGORIES`, que **se elimina** del código.

---

## 9. Administración de los tipos

- **Etapa 1 (esta tarea):** la lista vive en código revisado (`product-types-catalog.ts`) y entra por el **seed** (local) y por `backfill-product-types.ts` (Neon, paso del dueño). Agregar un tipo o un par = PR + correr el relleno (idempotente).
- **Etapa 2 (con el dashboard de stock, después de 3.7):** pantalla **solo del owner** (`requireRole(user, ["owner"])` con el usuario releído de la base) para crear, renombrar, ordenar, desactivar y marcar departamentos. Reglas que se fijan desde ahora:
  - Nunca se borra un tipo (`onDelete: Restrict`). Desactivarlo lo saca del alta y del lote; los productos lo conservan, se siguen vendiendo y cuentan en el stock ("Pants (inactivo)").
  - Renombrar actualiza `Product.category` de todos sus productos **en la misma transacción** (invariante §2); `SaleLine.category` nunca se reescribe. El `slug` no cambia.
  - Quitar un par de la puente no toca productos: entran en "Por revisar".
  - "Fusionar tipos" (mover productos de A a B y desactivar A) nunca reescribe `SaleLine.productTypeId`.
- El manager **asigna** tipos (lote e individual) pero no los crea; el colaborador solo elige en el alta.

---

## 10. Proyección pública (`PublicProduct`)

**Sin cambios de claves en 3.8.** `PublicProduct.category` sigue siendo texto y, por la invariante, lleva `ProductType.name` en los productos clasificados. No se exponen `productTypeId`, `style` ni `audience`; la prueba de contrato de claves de 2.2/2.3 queda igual y se agrega una aserción de que esas tres claves no aparecen. Un filtro público por tipo (`type: { slug; name } | null`, inactivo → `null`, `?tipo=<slug>`) y mostrar "Polo" o "Niño" en la tarjeta son una tarea posterior del catálogo, con su ampliación de la prueba de contrato en ese PR.

Efectos colaterales aceptados: la búsqueda pública (`matchesPublicQuery`) encuentra "Sudaderas" en vez de "Hoodies" para los productos rellenados; `lib/virtual-store/zones.ts` compara `category` con textos propios ("Outerwear", "Calzado", "Hoodies") que ya no coinciden; se corrige con 4.1 (zonas fuera de `zones.ts`), que debe usar el slug del tipo.

---

## 11. Ventas: copia en `SaleLine`

`createSale` (`prisma-sales-source.ts`) lee `product.productTypeId` junto con `departmentId` y `category`, y lo copia en `SaleLine.productTypeId`. Reclasificar o unir productos (1.6 mueve solo `SaleLine.productId`) **no** cambia la copia. `style` y `audience` **no** se copian en esta tarea: el reporte de ventas por estilo no está pedido; si se pide, son dos columnas anulables más y el histórico anterior queda sin el dato (costo aceptado).

---

## 12. Consulta base de stock por tipo y tienda

`InventoryDataSource.getStockByType(filter: { locationId?: string | null }): Promise<StockByTypeRow[]>`, en Prisma con `$queryRaw` y `Prisma.sql` parametrizado (como `byDepartment`) y en el Fixture en memoria con el mismo resultado.

```sql
SELECT p."departmentId"                          AS "departmentId",
       COALESCE(d."name", 'Sin departamento')    AS "departmentName",
       p."productTypeId"                         AS "productTypeId",
       COALESCE(t."name", 'Sin tipo')            AS "typeName",
       COALESCE(t."isActive", true)              AS "typeActive",
       p."audience"                              AS "audience",
       il."locationId"                           AS "locationId",
       loc."name"                                AS "locationName",
       SUM(il."available")::int                  AS "pieces",
       (COUNT(DISTINCT p."id") FILTER (WHERE il."available" > 0))::int AS "products"
FROM "InventoryLevel" il
JOIN "Variant"  v   ON v."id" = il."variantId" AND v."isActive"
JOIN "Product"  p   ON p."id" = v."productId"  AND p."isActive" AND p."mergedIntoId" IS NULL
JOIN "Location" loc ON loc."id" = il."locationId"
LEFT JOIN "Department"  d ON d."id" = p."departmentId"
LEFT JOIN "ProductType" t ON t."id" = p."productTypeId"
WHERE ${locationId ? Prisma.sql`il."locationId" = ${locationId}` : Prisma.sql`TRUE`}
GROUP BY p."departmentId", d."name", d."sortOrder", p."productTypeId", t."name", t."isActive", t."sortOrder",
         p."audience", il."locationId", loc."name"
HAVING SUM(il."available") > 0
ORDER BY d."sortOrder" NULLS LAST, t."sortOrder" NULLS LAST, p."audience" NULLS FIRST, loc."name";
```

`StockByTypeRow = { departmentId: string | null; departmentName: string; productTypeId: string | null; typeName: string; typeActive: boolean; audience: Audience | null; locationId: string; locationName: string; pieces: number; products: number }`.

- Excluye productos y tallas inactivos y productos unidos (mismo criterio que "poco stock" tras el fix de 1.7). Las filas con 0 piezas no salen.
- "Pants en total" (Dama + Caballero) = suma de filas por `productTypeId` en TypeScript; no hace falta otra consulta.
- **Interna.** No hay acción ni pantalla en 3.8. Cuando el dashboard la use, la acción recorta el alcance del colaborador a su tienda (como `dashboard-scope.ts`) y nunca pasa por `PublicProduct`.

---

## 13. Contrato (resumen; el detalle de firmas está en el plan, tarea 3.8)

- Dominio: `lib/domain/product-types-catalog.ts` (`PRODUCT_TYPE_CATALOG`, `DEPARTMENT_TYPE_SLUGS`, `LEGACY_CATEGORY_TO_TYPE`, `STYLE_OPTIONS`), `lib/domain/product-taxonomy.ts` (`AUDIENCES`, `Audience`, `AUDIENCE_LABELS`, `AUDIENCE_DEPARTMENT_SLUG = "calzado"`, `validateClassification`, `classificationIssues`, `typesForDepartment`). `Product` gana `productTypeId?`, `style?`, `audience?`. `NewProductInput.category` → `productTypeId`, `style?`, `audience?`. `PRODUCT_CATEGORIES` se elimina.
- Datos: `CreateProductData` gana `productTypeId?`, `style?`, `audience?` (opcionales: los ~20 literales de prueba existentes compilan; `category` sigue). `ProductPatch` gana `productTypeId?`, `style?`, `audience?`. Nuevos `assignProductType(ids, { productTypeId, category, allowedStyles }): Promise<{ updated; styleCleared }>` y `getStockByType(filter)`. Prisma y Fixture en el mismo PR.
- Acciones: `listProductTypesAction()` (staff con sesión), `createProductAction` (tipo obligatorio), `updateProductAction` (bloque de clasificación), `assignProductTypeAction(ids, typeId)` (owner o manager). `assignDepartmentAction` sin cambios.
- Ventas: `SaleLine.productTypeId` copiado en `createSale`.

---

## 14. Criterios de aceptación

- (T) El SQL de `*_add_product_types` contiene `CREATE TABLE "ProductType"`, `CREATE TABLE "DepartmentProductType"` y `ADD COLUMN` de `productTypeId` (en `Product` y `SaleLine`), `style` y `audience`; no contiene `DROP`, `ALTER COLUMN`, `SET NOT NULL` ni `CHECK`; ningún `ADD COLUMN` es `NOT NULL`.
- (T, `test:db`) Relleno sobre 7 productos (`Playeras`, `Hoodies`, `Tenis`, `Raquetas de Padel`, `Accesorios`, `General`, `Cosa rara`) y una venta con `SaleLine.category = "Hoodies"` → `{ types: 29, pairs: 55, products: 4, saleLines: 1, unmapped: { Accesorios: 1, General: 1, "Cosa rara": 1 } }`; el de `Hoodies` queda con el tipo `sudadera` y `category = "Sudaderas"`; la `SaleLine` queda con `productTypeId` de `sudadera` y `category = "Hoodies"`. Segunda corrida → `{ types: 0, pairs: 0, products: 0, saleLines: 0, unmapped: <igual> }`. Sin departamentos → error y 0 tipos creados.
- (T) Alta sin tipo → INVALID "Elige el tipo."; Tenis en Dama → INVALID; tipo inactivo → INVALID; Calzado sin "para" → INVALID; Dama con "para" → INVALID; Playeras con estilo `polo` → se crea con `style: "polo"` y `category: "Playeras"` (aunque el cliente mande otra `category`).
- (T) Edición: solo `departmentId` → INVALID "Elige departamento y tipo."; bloque válido → `category` = nombre del tipo; editar solo el título de un producto sin tipo → `ok: true`.
- (T) Lote de tipo: colaborador o JWT de owner degradado → FORBIDDEN; 101 ids → INVALID; 10 de Dama a Playeras → `{ ok: true, updated: 10 }`; uno de Calzado en la selección → INVALID y ningún producto cambia; uno con estilo `con-capucha` pasado a Playeras → `styleCleared: 1` y `style: null`.
- (T) `assignDepartmentAction` de un producto Dama/Playeras a Calzado → `{ ok: true, updated: 1 }` y conserva `productTypeId`; `classificationIssues` lo marca `TIPO_NO_APLICA` y `FALTA_PARA`.
- (T, `test:db`) `getStockByType` sobre el escenario del plan devuelve exactamente las 5 filas esperadas, en orden; con `locationId` de la tienda B, solo sus 2 filas; productos o tallas inactivos y unidos no cuentan; el Fixture devuelve lo mismo.
- (T, `test:db`) Una venta copia `productTypeId`; reclasificar después el producto no cambia la copia; unir (1.6) tampoco.
- (T) `PublicProduct` conserva sus claves exactas y no trae `productTypeId`, `style` ni `audience`.
- (T) UI: el select "Tipo" está desactivado sin departamento y solo lista los tipos del departamento; "Para" solo aparece en Calzado; "Estilo" solo en tipos con lista; cambiar de Dama a Calzado borra el tipo con aviso; chip "Por revisar" solo para owner y manager.
- (T) `grep -rn PRODUCT_CATEGORIES app lib components` → sin resultados.
- (M) En `ventas-prueba` (DUEÑO): `migrate deploy`, `migrate status` "up to date", `migrate diff --exit-code` sin drift; el relleno corre dos veces y la segunda reporta 0 nuevos; los conteos de "sin mapear" se anotan en la guía sin datos de clientes.
- (M) En un celular a 375 px: alta de un tenis de niño (Calzado, Tenis, Para: Niño) con 2 tallas en menos de 3 minutos; el encargado deja "Por revisar" en 0 sobre `ventas-prueba` antes de la salida.

---

## 15. Riesgos y qué no hacer

- **No** escribir datos en el SQL de la migración ni editarlo; el relleno es TypeScript con prueba de base.
- **No** inferir estilo o "para" del título ("Polo Nautica" no se marca solo): un error silencioso en el relleno contamina el stock por tipo. Lo hace el encargado con la ficha o el lote.
- **No** cambiar la clave de duplicados de 1.6 (`brandId` + título + `departmentId`): agregar el tipo separaría duplicados con una mitad sin clasificar.
- **No** tocar `assignDepartmentAction` (§7).
- **No** exponer la consulta de stock ni los atributos en lo público.
- Riesgo: la lista no se confirma antes de 3.8. Mitigación: la lista vive en un solo archivo; corregirla antes de 3.7 es editar ese archivo y correr el relleno (idempotente, crea lo que falta). Renombrar un tipo ya creado en `ventas-prueba` se hace en el seed local y, en Neon, con un script de una vez con prueba (no SQL a mano).
- Riesgo: el alta suma un campo (y "para" en Calzado). Mitigación: el select de tipo trae entre 4 y 16 opciones según el departamento; (M) de tiempo en el celular.

---

## 16. Encaje en el plan

- **Orden 23.5**, después de 3.6 y antes de 3.7. **Depende de:** 1.3 (`requireRole`, `currentUserOrNull`), 1.5 (alta con `sizes[]`, `NewProductForm`, `SizeRows`), 1.6 (`mergeProducts`, para probar que no toca la copia), 1.7 (`gate()`, `updateProductAction`, `ProductAdminSheet`, `/productos` con selección múltiple), 2.3 (`FIXTURE_DEPARTMENTS` con ids `dep-<slug>`) y el hito de la demo (el dueño confirma la lista de §4 y los estilos de §3.3).
- **3.7 cambia:** depende también de 3.8; la salida aplica la migración `add_product_types` y corre `backfill-product-types.ts` después de `migrate deploy`; la carga de mercancía entra con tipo obligatorio y "Por revisar" en 0 antes de empezar.
- **Etapa 2 (fuera de 3.8):** pantalla del owner para tipos y estilos, dashboard de stock por tipo sobre `getStockByType`, filtro público por tipo.
- **Estimación:** 13 h (esquema y migración 1; catálogo, seed y relleno con prueba de base 2; dominio puro 1; data sources Prisma y Fixture con pruebas de base 3; acciones 1.5; UI de alta, ficha y `/productos` 2.5; copia en ventas 0.5; ER y documentos 0.5; VE 1).

---

## 17. Preguntas abiertas para el dueño

Cada una trae la propuesta sobre la que se construye.

1. **Lista de tipos (§4).** *Propuesta:* la tabla tal cual. Confirmar en especial: ¿"Pants" y "Pantalones" son tipos distintos?; ¿ropa interior también en Caballero y Niños (el SRS A4 la ponía solo en Dama)?; ¿se queda "Raquetas de pádel" (D-CAT-2)?
2. **Estilos (§3.3).** *Propuesta:* "Polo" en Playeras y Camisas, más los de la tabla. ¿Cuáles usas de verdad al vender?
3. **"Para" en Calzado.** *Propuesta:* obligatorio, con Dama, Caballero y Niño. ¿Hace falta "Unisex" (tenis) o "Bebé"?
4. **"Para" fuera de Calzado.** *Propuesta:* no (como lo pediste). ¿Gorras o mochilas de niño necesitan distinguirse en Accesorios?
5. **Sin tipo al cargar.** *Propuesta:* lo que hoy está en "General" o "Accesorios" queda "Por revisar" y el encargado lo clasifica en lote antes de la carga; no hay tipo "Otro". ¿De acuerdo?

---

## 18. Fronteras y seguridad

- **Fronteras:** datos (sí: `InventoryDataSource` gana `assignProductType` y `getStockByType`; `CreateProductData` y `ProductPatch` crecen; Prisma, Fixture y pruebas en el mismo PR); migraciones (sí: una aditiva, ensayada en `ventas-prueba` por el dueño); público (no); plataforma y rutas (no).
- **Seguridad y privacidad:** sin hallazgos altos. Medio: `assignProductTypeAction` y la edición releen el rol de la base con `gate()`, nunca del JWT. Bajo: la lista y los slugs van al repo público y no contienen datos sensibles; "para" describe la prenda, no a una persona. Bajo: la consulta de stock por tipo es interna y no expone conteos al público (solo "disponible / agotado").

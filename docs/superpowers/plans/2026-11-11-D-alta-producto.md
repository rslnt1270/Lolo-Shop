# Subsistema D: Alta de producto en tienda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar una prenda nueva en un solo recorrido desde el celular: escanear, decidir si va al catálogo, fotografiar de frente y atrás sobre fondo blanco con análisis de bordes en el navegador, describir, clasificar (departamento y tipo de la 3.8), asignar marca y color, tallas, guardar y mostrar el estado resultante.

**Architecture:** D **extiende** lo que entrega G y **consume** las columnas de H; no crea migraciones ni reescribe el alta en paralelo. La lógica pura vive en `lib/domain/product-reference.ts` (color, título sugerido, estado fotográfico) y `lib/image/process.ts` (análisis de fondo), probada con Vitest y fixtures de píxeles generados. El servidor (`createProductAction` de G) gana color, descripción obligatoria, regla de fotos revisadas y `catalogStatus`; las acciones de foto de la ficha exigen la misma revisión. El formulario monta `ClassificationFields` de G y agrega decisión, fotos, descripción, color y título sugerido. Movimiento centralizado en `lib/motion/timing.ts`.

**Tech Stack:** Next.js (App Router), React, TypeScript, Prisma 5.22 (PostgreSQL), Vercel Blob (`@vercel/blob`), html5-qrcode, framer-motion, Vitest (`npm test`) y Vitest con base real (`npm run test:db`).

**Spec:** `docs/superpowers/specs/2026-11-11-alta-producto-tienda-design.md` (leer completo, incluidas §6 referencia, §7 criterios C1–C22 y §8 decisiones de revisión). Relacionados: `docs/superpowers/specs/2026-11-11-paleta-botones-catalogo-design.md`, `docs/superpowers/specs/2026-11-11-alcance-inventario-simplificado-design.md`, `docs/superpowers/specs/2026-11-10-taxonomia-productos-design.md`. Decisiones: `.superpowers/sdd/2026-11-11-version-final/decisiones.md` (1, 5, 8, 11).

**Orden de mezcla (cronograma §3):** quinto, después de B base, A, las dos migraciones (G T1 y H T1) y G T2–T8; antes de E y C. Tasks 1, 2 y 7 son lógica pura y pueden empezar el 13 sin esperar a G; Tasks 3–12 se rebasan sobre G.

## Global Constraints

- **Sin migraciones en D.** `Product.color`, `Product.catalogPhotosCheckedAt` y la tabla `ColorOption` los crea H (migración `<timestamp>_catalog_color_visibility`); `productTypeId`, `style` y `audience` los crea G (`20261111120000_add_product_types`). D no corre `prisma migrate` ni crea `Product.tipo`.
- **Construye sobre G sin reescribir:** `NewProductInput`, `validateNewProduct`, `createProductAction`, `loadTypeRule`, `listProductTypesAction` y `ClassificationFields` vienen de G y se **amplían**. Mensajes de tipo: los de G ("Elige el tipo.", "Ese tipo no aplica al departamento elegido. Elige otro de la lista.", etc.).
- Ningún secreto en código, tests ni fixtures. El repo es público (`BLOB_READ_WRITE_TOKEN`, `TEST_DATABASE_URL` solo en entorno).
- Commits en Conventional Commits; un commit por tarea.
- Textos de operador en español, con los mensajes exactos que indica la spec.
- Límites del spec (valores exactos): título ≤ 120 caracteres (`MAX_TITLE_LENGTH`); descripción ≤ 500 (`MAX_DESCRIPTION_LENGTH`) y obligatoria; foto ≤ 4 MB (`MAX_IMAGE_BYTES`); tallas 1 a 12; color ≤ 40.
- Formatos de escaneo exactamente: EAN-13, UPC-A, UPC-E, EAN-8, Code 128, Code 39, QR.
- Animaciones (spec §4.5): transición de paso 280 ms, desplazamiento 16 px; captura 220 ms, escala 0.96→1; desplazamiento de rechazo 3 veces, 240 ms en total; check 420 ms (el mismo valor que `lolo-draw` de B); estado visible 1.4 s (1400 ms). Con reducir movimiento, el giro de carga se hace más lento (1600 ms por vuelta, factor 2), no se detiene (decisión 11).
- Botones: `Button` y `buttonClasses` de B base (ya en `main`); sin colores fijos nuevos.
- Alta requiere internet. Sin conexión no se guarda y los datos se conservan en pantalla.
- Pruebas en las rutas reales: componentes en `components/__tests__/`, acciones en `lib/__tests__/`, dominio en `lib/domain/__tests__/`. No se crea `components/products/__tests__/`.

## Review Focus

Entradas o condiciones que la spec implica y que más probablemente rompen el alta en uso real. Cada una tiene prueba en la tarea dueña del código.

1. **Doble toque en "Guardar producto"** en red lenta: se crean dos productos o dos códigos. Prueba: Tarea 9, `review: doble toque no envía dos altas`.
2. **Internet cae a mitad del guardado o de la subida de foto**: se pierden los datos o queda un estado a medias. Prueba: Tarea 9, `review: sin conexión conserva el formulario`; Tarea 4, `review: alta con foto subida y fallo posterior no deja producto a medias`.
3. **Color con espacios, acentos, mayúsculas, emoji o vacío**: se duplica el color o se guarda basura. Prueba: Tarea 1, `review: color con emoji o solo espacios se rechaza o se limpia`.
4. **Almacenamiento bloqueado (modo privado, cuota llena)**: el recorrido o el alta fallan. Prueba: Tarea 10, `C3`.
5. **Foto HEIC o EXIF girado**: el análisis de bordes lee una imagen de lado y falla siempre. Prueba: Tarea 8, `review: foto con orientación EXIF pasa el análisis tras la rotación`.
6. **Cliente viejo que sube una foto desde la ficha sin análisis**: entra una foto de tienda al catálogo. Prueba: Tarea 4, `C18 (server): updateProductImageAction sin photosAnalyzed responde INVALID`.

## Preguntas abiertas (resumen)

Resueltas por la auditoría y las decisiones: P1, P3, P9, P10, P12 y P13 (ver la sección final). Siguen abiertas, sin bloquear: P2 (texto "Fotos completas, sin existencias", se confirma en el ensayo), P4, P5, P6, P7, P8 y P11.

---

## Mapa de criterios a pruebas

| Criterio | Tipo | Prueba (nombre exacto en el archivo indicado) | Tarea |
|---|---|---|---|
| C1 | T | `C1: la primera visita muestra el recorrido de 3 pasos` (`components/__tests__/AltaTour.test.tsx`) | 10 |
| C2 | T | `C2: Saltar cierra en cualquier paso y no reaparece sin "¿Cómo registrar?"` (mismo archivo) | 10 |
| C3 | M + T | Manual M-C3 (Tarea 12). Proxy: `C3 (proxy): storage que lanza hace que el recorrido aparezca y el formulario siga` (mismo archivo) | 10 |
| C4 | T | `C4: los formatos de escaneo son exactamente los siete del spec` (`lib/domain/__tests__/scan-formats.test.ts`); `C4: un código escrito a mano se acepta` (`components/__tests__/NewProductForm-alta.test.tsx`) | 7, 9 |
| C5 | T | `C5: "¿Va al catálogo?" aparece antes que departamento, tipo y marca` (`NewProductForm-alta.test.tsx`) | 9 |
| C6 | T | `C6: fondo claro y uniforme pasa`, `C6: fondo de color no pasa`, `C6: sombra en el borde no pasa` (y los demás casos de fixtures, ver Tarea 2) (`lib/image/__tests__/process.test.ts`) | 2 |
| C7 | T | `C7: foto rechazada no se sube y muestra el aviso de repetir` (`components/__tests__/ProductPhotoCapture.test.tsx`) | 8 |
| C8 | M | Manual M-C8 (Tarea 12). Proxy: `C8 (proxy): tras capturar frente, la captura de atrás sigue en el alta` (`NewProductForm-alta.test.tsx`) | 9, 12 |
| C9 | T | `C9: no se guarda sin marca` (`lib/domain/__tests__/product-reference.test.ts`); `C9 (db): createProductAction rechaza sin tipo ni marca` (`lib/__tests__/actions-alta.db.test.ts`). "Sin tipo" ya lo cubre G (`validateNewProduct sin productTypeId lanza 'Elige el tipo.'`) | 1, 4 |
| C10 | T | `C10: el color se oculta en Accesorios y en Perfume` y `C10: el color es opcional en Playeras` (`product-reference.test.ts`) | 1 |
| C11 | T | `C11: "Rosa" y "rosas" dan la misma clave` (`product-reference.test.ts`); `C11 (db): "Rosa" y "rosas" no crean dos colores` (`lib/catalog/__tests__/colors.db.test.ts`) | 1, 3 |
| C12 | T | `C12: título sugerido es tipo + marca + color` y `C12: sin color queda tipo + marca` (`product-reference.test.ts`); `C12: el título se puede editar sin que vuelva a sugerirse` (`NewProductForm-alta.test.tsx`) | 1, 9 |
| C13 | T | `C13 (db): sin fotos el estado es "Solo stock"` (`lib/__tests__/actions-alta.db.test.ts`); `C13: productPhotoStatus sin fotos` (`product-reference.test.ts`) | 1, 4 |
| C14 | T | `C14 (db): una foto blanca deja "Falta completar registro fotográfico"`; `C14: productPhotoStatus con una foto` | 1, 4 |
| C15 | T | `C15 (db): frente y atrás con existencias dejan "Listo para catálogo"`; `C15: productPhotoStatus con dos fotos y existencias` | 1, 4 |
| C16 | T | `C16: producto con fotos y sin existencias no entra al catálogo público` (`lib/data/__tests__/public-projection.test.ts`) | **C Task 2** |
| C17 | T | `C17: la lista de /productos no muestra el botón de foto` (`components/__tests__/ProductosPhotos.test.tsx`) | 8 |
| C18 | T | `C18: la foto desde la ficha pasa por el mismo análisis` (`components/__tests__/ProductPhotoCapture.test.tsx`); `C18 (server): updateProductImageAction sin photosAnalyzed responde INVALID` (`lib/__tests__/actions-photos.test.ts`) | 4, 8 |
| C19 | M + T | Manual M-C19 (Tarea 12). Proxy: `C19 (proxy): los valores de movimiento del spec` (`lib/motion/__tests__/timing.test.ts`) | 11 |
| C20 | M + T | Manual M-C20 (Tarea 12). Proxy: `C20 (proxy): con reducir movimiento no hay desplazamiento y el estado cambia` (`timing.test.ts`) | 11 |
| C21 | T | `C21 (db): "Sin código" encuentra por tipo, marca, color o código interno` y `C21 (db): texto que no es producto no devuelve nada` | **E Task 6** |
| C22 | T | `C22 (db): vender por referencia descuenta la talla` | **E Task 6** |

---

### Task 1: Referencia del producto y estado fotográfico (lógica pura)

**Files:**
- Create: `lib/domain/product-reference.ts`
- Test: `lib/domain/__tests__/product-reference.test.ts`

**Interfaces:**
- Consumes: nada (los slugs de departamento y tipo llegan como texto; sin import de G para poder empezar antes).
- Produces (usado por Tareas 3, 4, 9):
  - `BASE_COLORS: readonly string[]` = `["Negro","Blanco","Gris","Azul","Rojo","Rosa","Verde","Café","Beige","Naranja","Amarillo","Morado"]`
  - `NO_COLOR_DEPARTMENT_SLUGS: readonly string[]` = `["accesorios"]` y `NO_COLOR_TYPE_SLUGS: readonly string[]` = `["perfume"]`
  - `colorApplies(input: { departmentSlug: string | null; typeSlug: string | null }): boolean` — `false` si `departmentSlug === "accesorios"` o `typeSlug === "perfume"`; `true` en cualquier otro caso (incluido sin datos).
  - `normalizeColorKey(raw: string): string` — minúsculas, sin acentos (NFD y quitar marcas `\p{M}`), solo `[a-z0-9 ]`, espacios colapsados y recortados; luego quita la última `s` si la longitud es > 3 y la última `e` si la longitud es > 3. Devuelve `""` si no queda nada.
  - `displayColor(raw: string): string` — recorta, colapsa espacios, primera letra en mayúscula, resto en minúscula.
  - `buildSuggestedTitle(parts: { typeName: string; brand: string; color: string | null }): string` — `[typeName, brand, color?.toLowerCase()].filter(Boolean).join(" ")`. `typeName` es `ProductType.name` en singular de presentación cuando exista; si no, el nombre del tipo tal cual.
  - `validateReference(input: { brand: string; color: string | null; departmentSlug: string | null; typeSlug: string | null }): { color: string | null }` — marca vacía → `"Elige la marca."` (si `validateNewProduct` ya tiene un mensaje de marca, se usa ese y la prueba lo cita); si `colorApplies` es falso, `color: null`; color solo espacios o sin clave → `null`; con color, `displayColor` y `"El color puede tener máximo 40 caracteres."` si pasa de 40. **No valida el tipo**: eso es de G.
  - `type PhotoStatus = "Solo stock" | "Falta completar registro fotográfico" | "Fotos completas, sin existencias" | "Listo para catálogo"`
  - `productPhotoStatus(input: { hasFront: boolean; hasBack: boolean; hasStock: boolean }): PhotoStatus` — ninguna foto: "Solo stock"; una: "Falta completar registro fotográfico"; ambas sin existencias: "Fotos completas, sin existencias" (texto por confirmar en el ensayo, P2); ambas con existencias: "Listo para catálogo" (spec §4.3, C15). Es el estado **interno** de `/productos`; el sitio web lo decide C (elegible y publicado).

- [ ] **Step 1: Escribir las pruebas que fallan**

Casos obligatorios (nombres exactos de la tabla del mapa):
- `C10: el color se oculta en Accesorios y en Perfume`: `colorApplies({ departmentSlug: "accesorios", typeSlug: "gorra" }) === false`; `colorApplies({ departmentSlug: "dama", typeSlug: "perfume" }) === false`; `validateReference({ brand: "Hugo Boss", color: "azul", departmentSlug: "accesorios", typeSlug: "perfume" }).color === null`.
- `C10: el color es opcional en Playeras`: `validateReference({ brand: "ALO", color: null, departmentSlug: "dama", typeSlug: "playera" })` no lanza y `color === null`.
- `C11: "Rosa" y "rosas" dan la misma clave`: `normalizeColorKey("Rosa") === normalizeColorKey("rosas") === "rosa"`; `normalizeColorKey("Azules") === "azul"`; `normalizeColorKey("Café") === normalizeColorKey("cafés")`.
- `review: color con emoji o solo espacios se rechaza o se limpia`: `normalizeColorKey("🔥🔥")` y `normalizeColorKey("   ")` devuelven `""`; `validateReference` con color `"   "` devuelve `color: null`; con `"rosa 🔥"` la clave es `"rosa"`.
- `C9: no se guarda sin marca`: marca vacía lanza `"Elige la marca."`.
- `C12: el título sugerido es tipo + marca + color`: `buildSuggestedTitle({ typeName: "Leggins", brand: "ALO", color: "rosa" }) === "Leggins ALO rosa"`.
- `C12: sin color queda tipo + marca`: `buildSuggestedTitle({ typeName: "Perfume", brand: "Hugo Boss", color: null }) === "Perfume Hugo Boss"`.
- `C13: productPhotoStatus sin fotos`, `C14: productPhotoStatus con una foto` (ambos lados), `C15: productPhotoStatus con dos fotos y existencias`, `review: productPhotoStatus con dos fotos sin existencias` (los cuatro valores exactos).

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npx vitest run lib/domain/__tests__/product-reference.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementar `lib/domain/product-reference.ts`** con las firmas de Interfaces. Sin dependencias de Prisma ni de Node: debe correr en cliente y servidor.

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `npx vitest run lib/domain/__tests__/product-reference.test.ts`
Expected: PASS (todas).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/product-reference.ts lib/domain/__tests__/product-reference.test.ts
git commit -m "feat(alta): referencia de producto y estado fotográfico"
```

---

### Task 2: Análisis de fondo blanco en el navegador

**Files:**
- Modify: `lib/image/process.ts` (agregar `analyzeBackground` y constantes exportadas; no tocar `computeSquareCrop` ni `autoLevels`)
- Create: `lib/image/__tests__/fixtures/background.ts` (generador de fixtures)
- Modify: `lib/image/__tests__/process.test.ts` (agregar `describe("analyzeBackground")`)

**Interfaces:**
- Consumes: nada.
- Produces:
  - Constantes exportadas: `BORDER_RATIO = 0.05`, `MIN_BORDER_PX = 4`, `MIN_IMAGE_SIDE = 16`, `BG_MIN_LUMA = 200`, `BG_MAX_LUMA_STDDEV = 18`, `BG_MIN_WHITE_FRACTION = 0.9`, `BG_MAX_CHROMA = 25`.
  - `analyzeBackground(data: Uint8ClampedArray, width: number, height: number): BackgroundAnalysis` con `BackgroundAnalysis = { ok: boolean; meanLuma: number; stdLuma: number; whiteFraction: number; meanChroma: number }`.
  - Regla: `band = max(MIN_BORDER_PX, round(min(width,height) * BORDER_RATIO))`. Se analizan solo los píxeles con `x < band || x >= width-band || y < band || y >= height-band`. Luma `0.299R + 0.587G + 0.114B`; croma = `max(R,G,B) - min(R,G,B)`. `ok = meanLuma >= BG_MIN_LUMA && stdLuma <= BG_MAX_LUMA_STDDEV && whiteFraction >= BG_MIN_WHITE_FRACTION && meanChroma <= BG_MAX_CHROMA`, donde `whiteFraction` es la proporción de píxeles de borde con luma ≥ `BG_MIN_LUMA`. Si `min(width,height) < MIN_IMAGE_SIDE` devuelve `ok: false` con métricas en 0.

- [ ] **Step 1: Fixtures exactas** (`lib/image/__tests__/fixtures/background.ts`). Función `makeImage(w, h, pixel: (x, y) => [r, g, b]) => Uint8ClampedArray` RGBA con alfa 255. Imagen base de 100×100 salvo indicado:

| Nombre | Definición | Resultado esperado |
|---|---|---|
| `WHITE` | todo `[255,255,255]` | `ok: true` |
| `OFFWHITE_NOISE` | gris `v = 235 + ((x*31 + y*17) % 13) - 6` en R=G=B | `ok: true` (media ≈ 235, desv. ≈ 3.7) |
| `WHITE_WITH_PRODUCT` | blanco; centro `20 ≤ x,y < 80` en `[200,40,40]` | `ok: true` (el centro no se analiza) |
| `RED_WALL` | todo `[200,40,40]` | `ok: false` (luma ≈ 88) |
| `GRAY_WALL` | todo gris 150 | `ok: false` (luma < 200) |
| `SHADOW_BOTTOM` | blanco; filas `y ≥ 95` en gris 90 | `ok: false` (whiteFraction ≈ 0.74) |
| `GRADIENT` | gris `v = 180 + round(x * 70 / 99)` | `ok: false` (desv. ≈ 20.2, media ≈ 215) |
| `TINY` | 8×8 blanco | `ok: false` |

- [ ] **Step 2: Pruebas que fallan** en `process.test.ts`: un `it` por fixture con el nombre `C6: ...` que el mapa indica (`fondo claro y uniforme pasa` = `WHITE` y `OFFWHITE_NOISE`; `fondo de color no pasa` = `RED_WALL`; `sombra en el borde no pasa` = `SHADOW_BOTTOM`; también `C6: gradiente y pared gris no pasan`, `C6: el producto al centro no afecta el resultado`, `C6: imagen muy pequeña no pasa`). Afirmar `ok` y, en los que fallan, que `whiteFraction` o `stdLuma` cruzan su umbral.

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `npx vitest run lib/image/__tests__/process.test.ts`
Expected: FAIL, `analyzeBackground` no exportada.

- [ ] **Step 4: Implementar `analyzeBackground`** en `lib/image/process.ts`. Un solo recorrido de píxeles; sin dependencias del DOM.

- [ ] **Step 5: Ejecutar y ver que pasan**

Run: `npx vitest run lib/image/__tests__/process.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/image/process.ts lib/image/__tests__/process.test.ts lib/image/__tests__/fixtures/background.ts
git commit -m "feat(foto): análisis de bordes para fondo blanco"
```

---

### Task 3: Persistencia de color y lista dinámica de colores (consume H)

**Files:**
- Modify: `lib/data/source.ts` (`CreateProductData` gana `color: string | null` y `photosChecked: boolean`; los campos de G quedan igual)
- Modify: `lib/data/prisma-source.ts` (`createProduct` escribe `color` y `catalogPhotosCheckedAt = photosChecked ? new Date() : null`; no toca `Variant.color`)
- Modify: `lib/data/fixture-source.ts` (acepta los campos nuevos)
- Create: `lib/catalog/colors.ts` (funciones de servidor: `listColors()`, `addColor(raw, userId)`)
- Modify: `lib/catalog/actions.ts` (agregar `listColorsAction(): Promise<string[] | null>` y `createColorAction(raw: string): Promise<{ ok: true; label: string } | { ok: false; message: string }>`, mismo patrón que `createBrandAction`; junto a `listProductTypesAction` de G, sin tocarla)
- Test: `lib/data/__tests__/prisma-create-product.db.test.ts` (ampliar)
- Test: `lib/catalog/__tests__/colors.db.test.ts` (nuevo, `*.db.test.ts`)

**Interfaces:**
- Consumes: `normalizeColorKey`, `displayColor`, `BASE_COLORS` (Tarea 1); columnas `Product.color`, `Product.catalogPhotosCheckedAt` y tabla `ColorOption` (H Task 1, ya en `main`); `Product.color` y `catalogPhotosCheckedAt` ya mapeados al dominio por H.
- Produces:
  - `listColors(): Promise<string[]>` = `BASE_COLORS` ∪ etiquetas de `ColorOption`, sin duplicar por clave, ordenadas con los base primero.
  - `addColor(raw: string, userId: string): Promise<{ label: string }>` — si la clave ya existe (base o tabla) devuelve la etiqueta existente sin crear fila; si no, crea con `displayColor(raw)`; un P2002 de `key` (alta concurrente) relee y devuelve la existente.
  - `CreateProductData` gana `color: string | null; photosChecked: boolean`.

- [ ] **Step 1: Sin cambios de esquema.** Confirmar con `grep -n "catalogPhotosCheckedAt\|model ColorOption" prisma/schema.prisma` que H ya está en la rama. Si no aparece, detenerse: falta rebasar sobre `main`.

- [ ] **Step 2: Pruebas que fallan** (db):
  - En `prisma-create-product.db.test.ts`: `"stores product color and photos check; variant color stays General"`: crear con `color: "Rosa"`, `photosChecked: true` → `product.color === "Rosa"`, `catalogPhotosCheckedAt` no nulo, `variant.color === "General"`; con `photosChecked: false` → `catalogPhotosCheckedAt === null`.
  - En `colors.db.test.ts`: `C11 (db): "Rosa" y "rosas" no crean dos colores`: `addColor("Rosa")` y luego `addColor("rosas")` → ambos devuelven `label` igual; `count` de `ColorOption` con esa clave es 1 y `listColors()` no repite "rosa". También `addColor("Morado")` (base) no crea fila nueva, y `"dos addColor en paralelo con la misma clave no fallan"`.

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `npm run test:db -- lib/data/__tests__/prisma-create-product.db.test.ts lib/catalog/__tests__/colors.db.test.ts`
Expected: FAIL (campos de entrada y módulo inexistentes).

- [ ] **Step 4: Implementar** `lib/catalog/colors.ts`, las dos acciones y los cambios en `source.ts`, `prisma-source.ts` y `fixture-source.ts`.

- [ ] **Step 5: Ejecutar y ver que pasan**

Run: `npm run test:db -- lib/data/__tests__/prisma-create-product.db.test.ts lib/catalog/__tests__/colors.db.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/data/ lib/catalog/
git commit -m "feat(alta): color del producto y lista dinámica de colores"
```

---

### Task 4: Servidor: color, descripción, fotos revisadas y estado (sobre G)

**Files:**
- Modify: `lib/domain/new-product.ts` (sobre la versión de G: `NewProductInput` gana `color?: string | null` y `photosAnalyzed?: boolean`; `validateNewProduct` exige descripción y acepta modo catálogo con 0, 1 o 2 fotos; **no** toca `productTypeId`, `style`, `audience` ni los mensajes de G)
- Modify: `lib/actions.ts` (`createProductAction` de G: después de `loadTypeRule` + `validateClassification`, aplica `validateReference` con `departmentSlug` y `type.slug`; pasa `color` y `photosChecked` a `ds.createProduct`; devuelve `catalogStatus`. `updateProductImageAction` y `setProductBackImageAction` exigen `photosAnalyzed`; nueva `setCatalogPhotosAction`)
- Modify: `lib/data/source.ts`, `prisma-source.ts`, `fixture-source.ts` (`updateProductImage`/`updateProductBackImage` no cambian `catalogPhotosCheckedAt`; nuevo `setCatalogPhotos(productId, { imageUrl, backImageUrl })` que escribe las dos URL y `catalogPhotosCheckedAt = now()` en una sola escritura)
- Modify: `lib/domain/__tests__/new-product.test.ts` (actualizar expectativas que cambian)
- Test: `lib/__tests__/actions-alta.db.test.ts` (nuevo), `lib/__tests__/actions-photos.test.ts` (nuevo)

**Interfaces:**
- Consumes: Tareas 1 y 3; de G: `NewProductInput` (con `productTypeId`), `validateNewProduct`, `loadTypeRule`, `validateClassification`, `createProductAction`.
- Produces:
  - `NormalizedNewProduct` gana `color: string | null` y `photosChecked: boolean` (= frente y atrás presentes y `photosAnalyzed === true`).
  - `CreateProductResult` ok gana `catalogStatus: PhotoStatus` (= `productPhotoStatus({ hasFront, hasBack, hasStock: suma de piezas de las tallas > 0 })`).
  - Regla de fotos: si `imageUrl` o `backImageUrl` vienen, deben pasar `isProductBlobUrl` **y** `photosAnalyzed === true`; si no, `"La foto no pasó la revisión de fondo blanco. Tómala de nuevo."`. El servidor no puede analizar píxeles: esta bandera es la confianza en el cliente (ver P4 y riesgo 1).
  - `updateProductImageAction(productId: string, formData: FormData, opts: { photosAnalyzed: boolean })` y `setProductBackImageAction(productId: string, url: string, opts: { photosAnalyzed: boolean })`: sin `photosAnalyzed === true` → `{ ok: false, code: "INVALID", message: "La foto no pasó la revisión de fondo blanco. Tómala de nuevo." }` sin escribir. Cambiar **un** lado conserva `catalogPhotosCheckedAt` si ya estaba puesto y no lo pone si era nulo.
  - `setCatalogPhotosAction(productId: string, input: { imageUrl: string; backImageUrl: string; photosAnalyzed: boolean }): Promise<PhotoActionResult>` — mismos permisos que `checkPhotoAccess` (ambos lados); exige las dos URL de Blob y `photosAnalyzed`; llama `ds.setCatalogPhotos`. Es la forma de que un producto viejo (fotos de tienda o sin revisar) quede con `catalogPhotosCheckedAt` y pueda publicarse (decisión 5).
  - `catalogPhotosCheckedAt` se pone solo cuando frente y atrás se guardan revisadas **en la misma llamada** (alta con dos fotos, o `setCatalogPhotosAction`), o por el relleno de H para los ids del `publicar.csv`.

**Cambio de regla respecto del código actual:** hoy `mode: "catalog"` exige las dos fotos. La spec (§2.3 y C14) exige que una sola foto deje "Falta completar registro fotográfico", y las fotos son recomendadas para registrar. Por tanto `mode` solo elige la intención inicial (C5) y el estado sale de las fotos presentes. `CATALOG_PHOTOS_MESSAGE` deja de usarse en el alta.

- [ ] **Step 1: Pruebas unitarias que fallan** (`new-product.test.ts`, sobre los casos de G):
  - `C9: validateNewProduct rechaza sin marca` (mensaje de Tarea 1). "Sin tipo" queda en la prueba de G.
  - `review: descripción vacía no pasa`: `description: "  "` lanza.
  - Actualizar el caso `expect(validateNewProduct(valid).description).toBeNull()` → ahora lanza; actualizar el caso de `CATALOG_PHOTOS_MESSAGE` → modo catálogo sin fotos **no** lanza y deja `imageUrl: null`.
  - `C14 (unit): modo catálogo con una foto no lanza`.
  - `review: fotos sin photosAnalyzed se rechazan`.
  - `review: dos fotos con photosAnalyzed dejan photosChecked true; una sola, false`.

- [ ] **Step 2: Pruebas que fallan** (`lib/__tests__/actions-alta.db.test.ts`, sesión de owner, tienda de prueba, tipos sembrados con `backfillProductTypes`):
  - `C9 (db): createProductAction rechaza sin tipo ni marca` → `ok: false, code: "INVALID"` con "Elige el tipo." y, con tipo, con el mensaje de marca.
  - `C10 (db): en Accesorios el color se descarta` → producto con `color: null` aunque llegue `"Azul"`.
  - `C13 (db): sin fotos el estado es "Solo stock"` → `catalogStatus === "Solo stock"`.
  - `C14 (db): una foto blanca deja "Falta completar registro fotográfico"` (URL válida de Blob mock: la forma `https://<host>/productos/x.jpg` que acepta `isProductBlobUrl` con `BLOB_PUBLIC_HOST` del entorno de test).
  - `C15 (db): frente y atrás con existencias dejan "Listo para catálogo"` y `catalogPhotosCheckedAt` no nulo.
  - `review: alta con foto subida y fallo posterior no deja producto a medias`: forzar un error de base tras subir → no existe `Product` con ese título.

  En `lib/__tests__/actions-photos.test.ts` (mocks de sesión y data source, patrón de `lib/__tests__/actions-permissions.test.ts`):
  - `C18 (server): updateProductImageAction sin photosAnalyzed responde INVALID` (no sube ni escribe).
  - `C18 (server): setProductBackImageAction sin photosAnalyzed responde INVALID`.
  - `"cambiar un lado conserva catalogPhotosCheckedAt y no lo pone si era nulo"`.
  - `"setCatalogPhotosAction con las dos fotos revisadas llama setCatalogPhotos"`; `"setCatalogPhotosAction sin photosAnalyzed responde INVALID"`; `"setCatalogPhotosAction del colaborador sigue las reglas de checkPhotoAccess"`.

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `npx vitest run lib/domain/__tests__/new-product.test.ts lib/__tests__/actions-photos.test.ts` y `npm run test:db -- lib/__tests__/actions-alta.db.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar** los cambios de Files. Mantener el patrón existente de `try/catch` y de mensajes en `CreateProductResult` y `PhotoActionResult`. Actualizar los llamadores de las dos acciones de foto (`ProductPhotoButton`, `NewProductForm`) para pasar `{ photosAnalyzed }`; la UI completa es la Tarea 8.

- [ ] **Step 5: Ejecutar y ver que pasan** (mismos comandos). Expected: PASS. Después `npx vitest run lib/__tests__ lib/products` para no romper las pruebas de G.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/new-product.ts lib/domain/__tests__/new-product.test.ts lib/actions.ts lib/data/ lib/__tests__/actions-alta.db.test.ts lib/__tests__/actions-photos.test.ts components/products/
git commit -m "feat(alta): color, descripción, fotos revisadas y estado en el servidor"
```

---

### Task 5: (movida) Catálogo público solo con existencias (C16)

Movida a **C Task 2** (dueño de la proyección pública). D no toca `fetchPublicProductsAction` ni `public-projection.ts`.

---

### Task 6: (movida) "Sin código" en /pos (C21, C22)

Movida a **E Task 6**, que es dueño de `searchProducts`/`searchProductsAction` y del panel "Sin código". D no modifica la búsqueda. La búsqueda por "tipo" usa `Product.category`, que con G es `ProductType.name`; no existe un campo `tipo`.

---

### Task 7: Formatos de escaneo (C4)

**Files:**
- Create: `lib/domain/scan-formats.ts` (`export const SCAN_FORMAT_NAMES = ["EAN_13","UPC_A","UPC_E","EAN_8","CODE_128","CODE_39","QR_CODE"] as const`)
- Modify: `components/inventory/Scanner.tsx` (mapear `SCAN_FORMAT_NAMES` a `Html5QrcodeSupportedFormats`; hoy la constante `FORMATS` está en línea 19)
- Test: `lib/domain/__tests__/scan-formats.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `SCAN_FORMAT_NAMES`. El escáner mantiene su firma pública.

- [ ] **Step 1: Prueba que falla.** `C4: los formatos de escaneo son exactamente los siete del spec`: `expect([...SCAN_FORMAT_NAMES].sort()).toEqual([...].sort())` con la lista de siete nombres.
- [ ] **Step 2: Ejecutar.** `npx vitest run lib/domain/__tests__/scan-formats.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** el módulo y el mapeo en `Scanner.tsx`. Verificar con `grep -n "Html5QrcodeSupportedFormats\." components/inventory/Scanner.tsx` que el mapeo queda igual.
- [ ] **Step 4: Ejecutar y ver que pasa.** Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/domain/scan-formats.ts lib/domain/__tests__/scan-formats.test.ts components/inventory/Scanner.tsx
git commit -m "refactor(escaner): formatos de lectura en un módulo probado"
```

---

### Task 8: Captura de foto con análisis de fondo, guía de encuadre y ficha

**Files:**
- Modify: `components/products/ProductPhotoCapture.tsx`
- Modify: `components/products/ProductPhotoButton.tsx` (pasa `{ photosAnalyzed: true }` a las acciones de Task 4; si el producto no tiene `catalogPhotosCheckedAt`, ofrece "Tomar fotos de catálogo (frente y atrás)" y guarda con `setCatalogPhotosAction`)
- Modify: `components/products/ProductAdminSheet.tsx` (monta `ProductPhotoButton` en la ficha; es el único acceso a fotos después del alta)
- Modify: `app/productos/page.tsx` (C17: quitar `ProductPhotoButton` de la lista, hoy en las líneas ~121 y ~127)
- Test: `components/__tests__/ProductPhotoCapture.test.tsx` (existente, ampliar)
- Test: `components/__tests__/ProductosPhotos.test.tsx` (existente, ampliar con C17)

**Interfaces:**
- Consumes: `analyzeBackground` (Tarea 2), `updateProductImageAction`, `setProductBackImageAction`, `setCatalogPhotosAction` (Tarea 4), `motionTiming` (Tarea 11; si aún no existe, usar los valores de la tabla de Global Constraints en una constante local y reemplazarla en Tarea 11).
- Produces: prop nueva `processFile?: (file: File) => Promise<{ file: File; analysis: BackgroundAnalysis }>` con valor por defecto que usa `createImageBitmap` y canvas. Permite probar sin canvas real. `onCapture(file)` solo se llama con fotos aprobadas, así que quien la recibe envía `photosAnalyzed: true`.

Comportamiento:
1. **Guía en pantalla** (spec §4.2): antes de abrir la cámara, la casilla muestra un marco de encuadre y el texto `Coloca la prenda sobre una superficie blanca y céntrala en el marco.`
2. Tras `autoLevels`, llamar `analyzeBackground(imageData.data, out, out)` **antes** de codificar.
3. Si `ok === false`: no llamar `onCapture`, mostrar `El fondo no está en blanco. Repite la foto con la prenda sobre una superficie blanca.` y disparar el movimiento de rechazo (Tarea 11). No se guarda nada.
4. Si `ok === true`: llamar `onCapture(file)`.
5. No hay opción de foto de tienda; el único camino es esta captura.
6. `ProductPhotoButton` (ficha) usa el mismo componente, así que C18 se cumple en la UI; el servidor lo exige además (Tarea 4).

- [ ] **Step 1: Pruebas que fallan**:
  - `C7: foto rechazada no se sube y muestra el aviso de repetir`: `processFile` mock devuelve `ok:false`; `onCapture` no se llama; el texto exacto aparece en `role="alert"`.
  - `C7 (aceptada): foto aprobada llama onCapture`: `ok:true` → `onCapture` llamado una vez.
  - `review: la guía de encuadre aparece antes de tomar la foto`.
  - `C18: la foto desde la ficha pasa por el mismo análisis`: render de `ProductPhotoButton` con `processFile` mock falso → `onCapture` no se llama y `updateProductImageAction` (mock) no se invoca; con `ok:true` se invoca con `{ photosAnalyzed: true }`.
  - `review: producto sin fotos revisadas ofrece tomar frente y atrás y guarda con setCatalogPhotosAction`.
  - `C17: la lista de /productos no muestra el botón de foto` (`ProductosPhotos.test.tsx`): render de la lista con productos → `queryByRole("button", { name: /foto/i })` es null; la ficha sí lo muestra.
  - `review: foto con orientación EXIF pasa el análisis tras la rotación`: `processFile` real no se prueba en jsdom; se prueba que `createImageBitmap` se llama con `imageOrientation: "from-image"` (mock del global).
- [ ] **Step 2: Ejecutar.** `npx vitest run components/__tests__/ProductPhotoCapture.test.tsx components/__tests__/ProductosPhotos.test.tsx` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ejecutar y ver que pasa.** Más `npx vitest run components/__tests__/ProductAdminSheet.test.tsx components/__tests__/ProductosTypes.test.tsx` (regresión de A y G).
- [ ] **Step 5: Commit**

```bash
git add components/products/ app/productos/page.tsx components/__tests__/ProductPhotoCapture.test.tsx components/__tests__/ProductosPhotos.test.tsx
git commit -m "feat(foto): captura con guía y análisis de fondo blanco; fotos solo desde la ficha"
```

---

### Task 9: Formulario de alta: orden, referencia, descripción y guardado (sobre G)

**Files:**
- Modify: `components/products/NewProductForm.tsx` (sobre la versión de G, que ya monta `ClassificationFields`: reordenar al orden unificado; agregar decisión, fotos, descripción, color, título sugerido editable y la tienda activa; quitar la obligatoriedad de las dos fotos; estado tras guardar)
- Test: `components/__tests__/NewProductForm-alta.test.tsx` (nuevo, junto a las suites existentes)
- Modify tests: `components/__tests__/NewProductForm.test.tsx`, `NewProductForm-modes.test.tsx`, `NewProductForm-errors.test.tsx` (solo las expectativas que cambian por descripción obligatoria y modo catálogo con 0–2 fotos; `NewProductForm-types.test.tsx` de G no se toca)

**Interfaces:**
- Consumes: `validateReference`, `buildSuggestedTitle`, `colorApplies`, `PhotoStatus` (Tarea 1); `listColorsAction`, `createColorAction` (Tarea 3); `createBrandAction`, `listBrandsAction` (existentes); `createProductAction` (G + Tarea 4); `ClassificationFields`, `listProductTypesAction`, `ProductTypeOption` (G); `ProductPhotoCapture` con `processFile` (Tarea 8); `AltaTour` (Tarea 10); `motionTiming` (Tarea 11); `Button` (B base).
- Produces: sin API nueva. Al guardar muestra `catalogStatus` en la tarjeta del resultado.

Reglas de UI:
- **Orden unificado en el DOM:** decisión "¿Va al catálogo?" (Solo stock / Catálogo) → fotos (solo si Catálogo, recomendadas) → descripción (obligatoria) → Departamento → Tipo / Estilo / Para (`ClassificationFields` de G, props sin cambios) → Marca (combo con creación) → Color (combo con creación; oculto si `colorApplies({ departmentSlug, typeSlug })` es falso, con `typeSlug` = `ProductTypeOption.slug` del tipo elegido) → título sugerido (editable; deja de sincronizarse tras la primera edición manual; usa `ProductTypeOption.name`) → tallas → "Guardar producto".
- **Tienda activa** (spec §2.1): arriba del formulario, `Registrando en: {nombre de la tienda}`. El colaborador ve su tienda fija; owner y manager usan el selector de tienda que ya existe. Sin tienda elegida no se puede guardar.
- Botón de guardar: `Button` con `loading` mientras guarda (evita el doble toque, Review Focus 1). Si `navigator.onLine === false`, no envía y muestra `Sin internet no se puede guardar. Tus datos siguen aquí.`
- Si `createProductAction` lanza o devuelve `SESSION`/`ERROR` por red, el formulario conserva todos los valores.
- Envía `photosAnalyzed: true` solo si las fotos vinieron de `onCapture` (siempre aprobadas).
- El campo de código a mano (`ManualCodeEntry`, existente) cubre C4 "escribe a mano".

- [ ] **Step 1: Pruebas que fallan** (`NewProductForm-alta.test.tsx`; RTL, mocks de `@/lib/actions` y `@/lib/catalog/actions` con `listProductTypesAction` = Playeras en dama, Perfume en dama, Gorra en accesorios, Tenis en calzado):
  - `C5: "¿Va al catálogo?" aparece antes que departamento, tipo y marca`: `compareDocumentPosition` entre el grupo de decisión y los campos.
  - `review: el orden es decisión, fotos, descripción, departamento, tipo, marca, color, título y tallas`.
  - `C9: sin marca no se envía`: el botón muestra el error y `createProductAction` no se llama. ("Sin tipo" lo cubre `NewProductForm-types.test.tsx` de G.)
  - `C10: el color se oculta en Accesorios y con tipo Perfume`.
  - `C12: el título sugerido se actualiza y se puede editar sin que vuelva a sugerirse`: tipo Playeras, marca "ALO", color "rosa" → título sugerido con esas tres partes; editar a mano y cambiar color → el título no cambia.
  - `C4: un código escrito a mano se acepta`: `ManualCodeEntry` con `"4006381333931"` pasa a la siguiente etapa.
  - `C8 (proxy): tras capturar frente, la captura de atrás sigue en el alta`: `ProductPhotoCapture` de frente y atrás están montados a la vez y el formulario no cambia de paso.
  - `review: muestra Registrando en con la tienda activa`.
  - `review: doble toque no envía dos altas`: dos clics seguidos → `createProductAction` llamada una vez.
  - `review: sin conexión conserva el formulario`: `navigator.onLine` false → no se llama al servidor y el texto de la spec aparece; con `createProductAction` que rechaza, los valores siguen en los campos.
  - `C13/C14/C15 (UI)`: tras guardar mock con `catalogStatus` concreto, el texto del estado aparece en la tarjeta (los cuatro valores de `PhotoStatus`).
  - `review: el payload lleva productTypeId, color, description y photosAnalyzed, y no lleva category ni tipo`.
- [ ] **Step 2: Ejecutar.** `npx vitest run components/__tests__/NewProductForm-alta.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** por partes (decisión y fotos; descripción y referencia; guardado). Mantener las props, el comportamiento de sesión y `ClassificationFields` tal como los deja G.
- [ ] **Step 4: Ejecutar y ver que pasa.** Después `npx vitest run components/__tests__/NewProductForm` (todas las suites del alta, incluidas las de A y G) para regresiones.
- [ ] **Step 5: Commit**

```bash
git add components/products/NewProductForm.tsx components/__tests__/NewProductForm*.test.tsx
git commit -m "feat(alta): formulario en orden de recorrido con referencia, tienda activa y estado"
```

---

### Task 10: Recorrido de primera vez (C1, C2, C3)

**Files:**
- Create: `lib/alta/tour-storage.ts` (`hasSeenTour(): boolean`, `markTourSeen(): void`; clave `loloshop.altaTour.v1`; `try/catch` en ambas; si falla leer, devuelve `false`)
- Create: `components/products/AltaTour.tsx` (3 pasos, botón "Saltar" siempre visible con `Button variant="outline"`, progreso con puntos)
- Modify: `components/products/NewProductForm.tsx` (montar `AltaTour` y el enlace "¿Cómo registrar?")
- Test: `components/__tests__/AltaTour.test.tsx`

**Interfaces:**
- Consumes: `motionTiming` (Tarea 11).
- Produces: `AltaTour` props `{ open: boolean; onClose(): void }`. Contenido propuesto (spec §4.1, confirmar en P6): 1) escanear la etiqueta; 2) elegir si va al catálogo; 3) tomar fotos sobre fondo blanco.

Comportamiento: al montar, si `!hasSeenTour()` se abre. "Saltar" o terminar paso 3 llama `markTourSeen()` y cierra. "¿Cómo registrar?" reabre sin importar el valor guardado. Sin almacenamiento, aparece cada vez (C3) y no bloquea el alta.

- [ ] **Step 1: Pruebas que fallan**:
  - `C1: la primera visita muestra el recorrido de 3 pasos`: `localStorage` vacío → 3 pasos, texto del paso 1.
  - `C2: Saltar cierra en cualquier paso y no reaparece sin "¿Cómo registrar?"`: saltar en paso 2 → cerrado; re-render → cerrado; clic en "¿Cómo registrar?" → abierto.
  - `C3 (proxy): storage que lanza hace que el recorrido aparezca y el formulario siga`: `Storage.prototype.getItem` lanza → aparece; el formulario acepta campos.
- [ ] **Step 2: Ejecutar.** `npx vitest run components/__tests__/AltaTour.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** storage y componente.
- [ ] **Step 4: Ejecutar y ver que pasa.**
- [ ] **Step 5: Commit**

```bash
git add lib/alta/ components/products/AltaTour.tsx components/products/NewProductForm.tsx components/__tests__/AltaTour.test.tsx
git commit -m "feat(alta): recorrido de primera vez saltable"
```

---

### Task 11: Movimiento y reducción de movimiento (C19, C20)

**Files:**
- Create: `lib/motion/timing.ts` (`motionTiming(reduced: boolean)` y `prefersReducedMotion(): boolean`)
- Create: `lib/motion/use-reduced-motion.ts` (hook sobre `matchMedia("(prefers-reduced-motion: reduce)")` con `try/catch`)
- Test: `lib/motion/__tests__/timing.test.ts`
- Modify: `components/products/AltaTour.tsx`, `ProductPhotoCapture.tsx`, `NewProductForm.tsx` (usar `motionTiming`; quitar constantes locales de Tarea 8)

**Interfaces:**
- Produces: `motionTiming(reduced)` devuelve:

| Campo | Normal | Reducido |
|---|---|---|
| `stepMs` | 280 | 1 |
| `stepOffsetPx` | 16 | 0 |
| `photoMs` | 220 | 1 |
| `photoScaleFrom` | 0.96 | 1 |
| `rejectShakeCount` | 3 | 0 |
| `rejectShakeMs` | 240 | 1 |
| `checkMs` | 420 | 1 |
| `holdMs` | 1400 | 1400 |
| `spinSlowFactor` | 1 | 2 |

"Reducido" nunca quita el estado final: `holdMs` se mantiene y el giro se hace más lento, no se elimina (spec §4.5, decisión 11). `checkMs` normal = 420 ms, igual que `lolo-draw` de B; con `spinSlowFactor` 2 el giro dura 1600 ms por vuelta, igual que la regla de reducir movimiento de B (`.lolo-btn-spinner { animation-duration: 1600ms }`). El botón de guardar usa `Button` de B; esta tabla gobierna las animaciones propias del alta (pasos, captura, rechazo, check de la tarjeta).

- [ ] **Step 1: Pruebas que fallan**:
  - `C19 (proxy): los valores de movimiento del spec`: `motionTiming(false)` deep-equal a la columna normal.
  - `C20 (proxy): con reducir movimiento no hay desplazamiento y el estado cambia`: `motionTiming(true)` tiene `stepOffsetPx: 0`, `rejectShakeCount: 0`, `stepMs: 1`, `holdMs: 1400`, `spinSlowFactor: 2`.
  - `C20 (hook)`: `matchMedia` mockeado como `matches: true` → `prefersReducedMotion()` true; si `matchMedia` lanza → false.
- [ ] **Step 2: Ejecutar.** `npx vitest run lib/motion` → FAIL.
- [ ] **Step 3: Implementar.** Reemplazar las constantes locales de Tareas 8 y 10 por `motionTiming`.
- [ ] **Step 4: Ejecutar y ver que pasa**, más `npx vitest run components/__tests__/NewProductForm components/__tests__/AltaTour.test.tsx components/__tests__/ProductPhotoCapture.test.tsx` para regresiones.
- [ ] **Step 5: Commit**

```bash
git add lib/motion/ components/products/ components/__tests__/
git commit -m "feat(alta): tiempos de movimiento con reducción por preferencia del sistema"
```

---

### Task 12: Verificación final y pruebas manuales

**Files:** ninguno nuevo.

- [ ] **Step 1: Automáticas.** Run: `npm run lint`, `npm test`, `npm run test:db`, `npm run build`. Expected: todo en verde. Sin `BLOB_READ_WRITE_TOKEN` real, la subida real falla; los tests usan mock.
- [ ] **Step 2: Mapa de criterios.** Confirmar que cada C1–C20 del mapa tiene su prueba ejecutada (`npx vitest run -t "C[0-9]"` y `npm run test:db -- -t "C[0-9]"`). C16 se verifica al cerrar C y C21–C22 al cerrar E.
- [ ] **Step 3: Manuales en celular (no bloquean la compilación; se reportan):**
  - M-C3: con modo privado, el recorrido aparece cada vez y el alta guarda.
  - M-C8: frente y atrás en el mismo celular sin salir del alta.
  - M-C19: transiciones, captura y check con movimiento según la tabla.
  - M-C20: con "reducir movimiento" en el sistema, sin desplazamientos, con cambios de estado.
- [ ] **Step 4: No desplegar.** Este plan no incluye deploy ni `migrate deploy` en producción; eso lo decide el dueño con el runbook de H.
- [ ] **Step 5: Revisar que no quedó `tipo`.** `grep -rn "\btipo\b" lib components app --include=*.ts --include=*.tsx | grep -v __tests__` solo muestra textos de UI, nunca un campo `tipo` en tipos, acciones o esquema.

---

## Respaldo sin G (decisión 8)

Solo si G Tasks 2–8 no están en `main` el lunes 16. La migración 1 de G y la de H sí están (se mezclan el 12 y el 13).
- D se rebasa sobre `main` sin G: `NewProductInput` conserva `category`; el formulario usa el select `category` actual (`PRODUCT_CATEGORIES`) en el lugar de `ClassificationFields`; **no** se crea columna `tipo`.
- `colorApplies({ departmentSlug, typeSlug })` recibe `typeSlug = category === "Perfumes" ? "perfume" : null`; `buildSuggestedTitle` usa `typeName = category`.
- Las pruebas de C9 "sin tipo" usan el mensaje existente de categoría. El resto de tareas no cambia.
- Cuando G entra después, sus Tasks 2–8 sustituyen el select por `ClassificationFields` y su relleno clasifica estos productos por `category`; no hay datos de D que migrar.

## Preguntas que la spec no responde

- **P1. ~~Catálogo automático frente a la elección inicial.~~** Resuelta (decisión 1): la elección inicial (C5) es intención; el estado interno lo calculan las fotos y las existencias (`productPhotoStatus`); el sitio web lo decide C (elegible y publicado).
- **P2. Fotos sin existencias.** Este plan usa "Fotos completas, sin existencias" (Tarea 1). Se confirma el texto en el ensayo del 18; cambiarlo es una constante.
- **P3. ~~Tipo temporal.~~** Resuelta: sin `Product.tipo`. El tipo es `productTypeId` de G; respaldo con `category` (sección anterior).
- **P4. Verificación de fondo en el servidor.** El servidor no puede analizar píxeles; confía en la bandera `photosAnalyzed` del cliente y en las URL de Blob. Se acepta para la demo (riesgo 1).
- **P5. Sinónimos de color.** La regla de normalización (minúsculas, sin acentos, sin plural) no une "rosado" con "rosa" ni "negra" con "negro". Abierta; no bloquea (la referencia no tiene que encajar al 100 %).
- **P6. Contenido del recorrido.** La propuesta de contenido (§4.1) está marcada "por confirmar". Este plan la usa tal cual.
- **P7. Descripción.** Solo se exige texto no vacío, con máximo 500.
- **P8. Variant.color.** Se deja en "General"; la búsqueda usa `Product.color`.
- **P9. ~~Permisos del colaborador.~~** Resuelta: plan A, Tasks 1–2.
- **P10. ~~Botón "Publicar".~~** Resuelta (decisión 1): plan C, Task 2b.
- **P11. Umbrales de fondo.** Los de la Tarea 2 son propuesta y deben calibrarse con fotos reales antes del ensayo del 18.
- **P12. ~~Cambio de reglas de modo catálogo.~~** Resuelta: se acepta guardar con 0, 1 o 2 fotos (spec §8 "Guardar sin foto", C14).
- **P13. ~~Venta sin código.~~** Resuelta: plan E, Task 6.

## Riesgos principales

1. **Confianza en el cliente para el fondo blanco (P4).** Un cliente modificado puede marcar una foto como analizada. Mitigación: el análisis está en el cliente como dice la spec; el servidor exige la bandera, valida la URL y solo pone `catalogPhotosCheckedAt` con las dos fotos en una llamada; además, publicar en el sitio es una acción explícita de owner o manager (plan C).
2. **Dependencia de la tarea 3.8.** D va después de G en el orden de mezcla. Si G se retrasa, aplica "Respaldo sin G", sin columnas temporales.
3. **Calibración del análisis (P11).** Fondos reales (pared blanca, sombras, papel con textura) pueden pasar o fallar mal. Los fixtures prueban la lógica, no la calidad en campo; la prueba M-C19 y una tanda de fotos reales deben hacerse antes del ensayo.
4. **Rebase sobre G en `NewProductForm.tsx` (621 líneas).** Mitigación: D no empieza la Tarea 9 hasta que G esté en `main`; B T7 se aplica después de D.

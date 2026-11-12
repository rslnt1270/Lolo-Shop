# Subsistema C: sitio web con "Publicar", captura libre de fotos, lista "Por publicar", sin CTA de WhatsApp y favoritos locales — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revisión 2026-11-12 (entrega 2).** Reescrito sobre el código de `main` d05d68b (entrega 1, PR #34) y la **decisión del dueño del 2026-11-12, que manda sobre los specs**: se quita el requisito de fondo blanco. Cualquier foto tomada se acepta (sin marco, sin rechazo). El personal solo captura rápido fotos y productos; el dueño edita las fotos después y las reemplaza antes de publicar. Cronograma: `docs/superpowers/plans/2026-11-12-entrega-2-cronograma.md` (grupos G18, G19, G20, G25 y G26).

**Goal:** El sitio web (`/catalogo`, el recorrido 3D y el bot por código) muestra solo prendas **publicadas y elegibles**. Elegible = foto de frente y de atrás presentes, descripción y existencias en una tienda pública. Publicada = owner o manager tocó "Publicar". La captura de fotos ya no analiza el fondo. Owner y manager tienen la lista "Por publicar" en `/productos` para abrir, reemplazar y publicar. Sin el CTA de WhatsApp, con favoritos guardados en el navegador y una pantalla `/favoritos`.

**Architecture:** C no crea migraciones: usa `Location.isPublic`, `Product.isPublished` y `Product.catalogPhotosCheckedAt`, ya en producción (migración `20261111150008_catalog_color_visibility`) y mapeados al dominio (`lib/domain/types.ts`). Una función pura (`lib/domain/catalog-eligibility.ts`) decide la elegibilidad; la usan la proyección pública, la acción "Publicar", la ficha y la lista "Por publicar". La proyección pública (`lib/data/public-projection.ts`) sigue siendo la única fuente del sitio. `setProductPublishedAction` (owner y manager, rol releído de la base con `gate()`) vive en `lib/products/actions.ts`. Los favoritos son IDs en `localStorage`; el servidor nunca recibe qué guarda la persona.

**Decisión sobre `catalogPhotosCheckedAt` (2026-11-12):** la columna **se conserva sin migración** y **deja de decidir** cualquier cosa. Nuevo significado: "fecha en que frente y atrás se guardaron juntas desde la app" (alta en modo catálogo o `setCatalogPhotosAction`). Nadie la lee para elegibilidad, botones ni filtros. Motivos: (1) borrar la columna sería una migración destructiva, prohibida en esta entrega; (2) la revisión humana que antes hacía el análisis de fondo la hace ahora el dueño al tocar "Publicar", y `isPublished` ya la registra; (3) el script de relleno de H (`prisma/scripts/backfill-product-visibility.ts`) la sigue escribiendo y no hace falta tocarlo. La escritura queda con una guarda en la capa de datos: solo se escribe si llegan las dos URL (minor G12 de la entrega 1). Si después de la versión final sigue sin uso, se quita con una migración propia y aprobada.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Prisma 5 (PostgreSQL), Vitest + React Testing Library, Tailwind con tokens de B base.

**Spec:** `docs/superpowers/specs/2026-11-11-paleta-botones-catalogo-design.md` (§4–§6), `docs/superpowers/specs/2026-11-11-alta-producto-tienda-design.md` (§3 "Publicar", §8 catálogo; **lo de fondo blanco de §1, §2.3, §3, C14, C15 y §8 queda sin efecto por la decisión del 2026-11-12**), `docs/superpowers/specs/2026-11-05-sitio-publico-ux-design.md` (§2.2 y §5.8). Decisiones de la entrega 1: `.superpowers/sdd/2026-11-11-version-final-cronograma/decisiones.md` (1 y 3; la 5 cambia: publicar ya no exige fotos blancas).

## Global Constraints

- Botones y colores **solo** con `Button`/`buttonClasses` (`components/ui/`) y los tokens de B base. Sin hex fijos (`bg-[#22B8B8]`, `text-[#16302F]`, `border-[#0C7C7C]`, `#9A3B2E`) en código nuevo; el barrido de B T10 falla si aparecen.
- Botón: altura mínima 44 px (`min-h-11` de `buttonClasses`).
- Sin cifras de stock en ninguna pantalla pública: solo booleanos por talla.
- `PublicProduct` no gana campos. Sin SKU, barcode, `inventory`, `locationId` ni conteos.
- **Privacidad (repo público, fotos sin revisar):** como ya no hay filtro automático de fotos, **ninguna foto llega al sitio sin que owner o manager toquen "Publicar"**, y la confirmación de "Publicar" pide revisar que no haya personas identificables, precios ni datos de clientes en las fotos. G18 (Tasks 2 y 2a) se mezcla **antes** que la captura libre (Task 2c).
- Favoritos: solo `localStorage`, en `try/catch`, sin cuenta, sin llamadas al servidor para guardar.
- **Sin migraciones en C.** Pruebas `*.db.test.ts` con `npm run test:db` (las excluye `npm test`); sin `TEST_DATABASE_URL` se saltan: reportarlo, no darlo por verificado.
- Publicar solo owner y manager, comprobado en el servidor con el rol releído de la base; el colaborador no ve el botón ni la lista.
- Elegible y publicado se exige en **lectura** (proyección), no solo al publicar.
- Compatibilidad con pestañas PWA viejas: el servidor **ignora** `photosAnalyzed` si llega (no lo exige ni lo rechaza).
- Texto en español de México, tuteo.

## Review Focus

1. Foto sin revisar que llega al sitio sin "Publicar": prueba en Task 2a ("producto con fotos y existencias sin publicar no aparece") y orden de mezcla G18 antes de G19.
2. Colaborador con sesión vieja de owner llama `setProductPublishedAction`: `FORBIDDEN` con el rol de la base. Task 2b.
3. Producto publicado que se queda sin existencias o sin descripción: desaparece sin despublicar. Task 2a.
4. "Reemplazar foto" abre la galería (sin forzar la cámara) y no la rechaza por el fondo. Task 2c y 2d.
5. Pestaña vieja que manda `photosAnalyzed: true` o nada: la foto se guarda igual. Task 2c.
6. Almacenamiento bloqueado o JSON corrupto en favoritos; render en servidor sin `window`. Tasks 5 y 6.
7. Tienda con `isPublic = false` o sin tiendas públicas: catálogo vacío sin error. Task 2.

---

### Task 1: Lectura de `Location.isPublic` — **cubierta en la entrega 1**

- [x] Cubierta por `lib/data/__tests__/prisma-catalog-columns.db.test.ts` ("getLocations: una tienda nueva es pública por defecto; isPublic false se respeta") y por el mapeo de `lib/data/prisma-source.ts` (`getLocations`, `createLocation`) y `lib/data/fixture-source.ts` (`createLocation` con `isPublic: true`). Sin trabajo.

---

### Task 2: Proyección: solo tiendas públicas y solo prendas con alguna talla disponible (C16) — G18

**Files:**
- Modify: `lib/data/public-projection.ts` (`getPublicCatalog` y `findPublicByCode`; extraer helper)
- Test: `lib/data/__tests__/public-projection.test.ts` (agregar `describe("stock sincronizado con el catálogo", ...)`)

**Interfaces:**
- Consumes: `Location.isPublic?: boolean`, `Location.type`.
- Produces: `export function publicStoreIds(locations: Location[]): Set<string>` en `public-projection.ts`: `type === "store"` e `isPublic !== false`. `getPublicCatalog` y `findPublicByCode` la usan en lugar del `new Set(locations.filter((l) => l.type === "store")…)` actual.

- [ ] **Step 1: Escribir los tests que fallan** (mismos fixtures del bloque existente):
  - `"tienda con isPublic false no cuenta para la disponibilidad"`
  - `"bodega pública no cuenta: solo type store"`
  - `"sin tiendas públicas, getPublicCatalog devuelve [] sin lanzar"`
  - `"una prenda con todas sus tallas sin stock no aparece en getPublicCatalog"`
  - `"una prenda con una talla con stock aparece y las demás conservan available false"`
  - `"publicStoreIds excluye bodegas y tiendas con isPublic false"`
  - `"C16: producto con fotos y sin existencias no entra al catálogo público"`
- [ ] **Step 2: Ejecutar y ver que fallan.** Run: `npm test -- lib/data/__tests__/public-projection.test.ts` → FAIL en los nuevos.
- [ ] **Step 3: Implementar.** Agregar `publicStoreIds`; cambiar el filtro final de `getPublicCatalog` de `p.sizes.length > 0` a `p.sizes.some((s) => s.available)`; `findPublicByCode` devuelve `null` si ninguna talla está disponible.
- [ ] **Step 4: Ejecutar y verificar.** Run: `npm test -- lib/data/__tests__/public-projection.test.ts && npm run test:db -- lib/data/__tests__/public-contract.db.test.ts` → PASS. El contrato de claves no cambia.
- [ ] **Step 5: Commit.** `git commit -m "feat(catalogo): solo prendas con existencias en tiendas públicas"`

---

### Task 2a: Elegibilidad del sitio (sin fondo blanco) y filtro de publicación — G18

**Files:**
- Create: `lib/domain/catalog-eligibility.ts`
- Test: `lib/domain/__tests__/catalog-eligibility.test.ts` (nuevo)
- Modify: `lib/data/prisma-source.ts` (`getCatalogProducts`: el `where` actual `{ isActive: true, mergedIntoId: null, imageUrl: { not: null }, backImageUrl: { not: null } }` gana `isPublished: true`), `lib/data/fixture-source.ts` (mismo filtro en `getCatalogProducts`), `lib/data/source.ts` (comentario de `getCatalogProducts`)
- Modify: `lib/data/public-projection.ts` (`getPublicCatalog` y `findPublicByCode` exigen `isPublished === true` y `catalogEligibility(...).eligible`)
- Test: `lib/data/__tests__/public-projection.test.ts`, `lib/data/__tests__/public-contract.db.test.ts` (ampliar)

**Interfaces:**
- Consumes: `Product.isPublished`, `Product.description`, `imageUrl`, `backImageUrl` (dominio); `publicStoreIds` (Task 2). **No** consume `catalogPhotosCheckedAt`.
- Produces:
  ```ts
  export type EligibilityGap = "FOTO_FRENTE" | "FOTO_ATRAS" | "DESCRIPCION" | "EXISTENCIAS";
  export const ELIGIBILITY_GAP_TEXT: Readonly<Record<EligibilityGap, string>>;
  // FOTO_FRENTE: "Falta la foto de frente."
  // FOTO_ATRAS: "Falta la foto de atrás."
  // DESCRIPCION: "Falta la descripción."
  // EXISTENCIAS: "No hay piezas en una tienda pública."
  export function catalogEligibility(p: {
    imageUrl: string | null; backImageUrl?: string | null;
    description?: string | null; hasStockInPublicStore: boolean;
  }): { eligible: boolean; gaps: EligibilityGap[] }; // gaps en el orden del tipo; eligible = gaps.length === 0
  export function hasStockInPublicStore(
    p: { variants: { isActive?: boolean; inventory: { locationId: string; available: number }[] }[] },
    storeIds: ReadonlySet<string>,
  ): boolean; // alguna variante activa con available > 0 en storeIds
  export function isPendingPublication(p: Product, storeIds: ReadonlySet<string>): boolean;
  // "Por publicar" (Task 2d): activo, sin unir, imageUrl y backImageUrl presentes,
  // hasStockInPublicStore, isPublished !== true. La descripción NO es condición de la lista:
  // si falta, la fila lo muestra como hueco y "Publicar" queda deshabilitado.
  ```
  Pura, sin Prisma; corre en cliente y servidor. Relación con el alta: `productPhotoStatus` (`lib/domain/product-reference.ts`) sigue dando las etiquetas internas ("Solo stock", "Falta completar registro fotográfico", "Fotos completas, sin existencias", "Listo para catálogo"). "Listo para catálogo" = frente, atrás, descripción (obligatoria en el alta) y existencias, **esperando que owner o manager publiquen**.
- Regla del sitio: `getPublicCatalog` y `findPublicByCode` devuelven un producto solo si `isPublished === true` **y** `catalogEligibility(...).eligible`. El bot (`findPublicByCode`) queda alineado con el sitio.

- [ ] **Step 1: Escribir los tests que fallan**

`catalog-eligibility.test.ts`:
- `"producto con frente, atrás, descripción y existencias es elegible"`
- `"sin foto de atrás: FOTO_ATRAS"`
- `"descripción solo espacios: DESCRIPCION"`
- `"sin existencias en tienda pública: EXISTENCIAS"`
- `"varios huecos salen en orden fijo"`
- `"catalogPhotosCheckedAt nulo no cuenta: producto completo sin esa fecha es elegible"` (decisión 2026-11-12)
- `"isPendingPublication: fotos y existencias sin publicar → true; publicado → false; sin foto de atrás → false; sin existencias → false; inactivo o unido → false"`

`public-projection.test.ts`:
- `"producto con fotos y existencias sin publicar no aparece en el sitio"` (gate de privacidad)
- `"producto publicado sin descripción no aparece"`
- `"producto publicado que se queda sin existencias desaparece sin despublicar"`
- `"findPublicByCode no devuelve un producto sin publicar ni uno sin existencias"`

`public-contract.db.test.ts`: `"getCatalogProducts solo trae publicados con las dos fotos"`.

- [ ] **Step 2: Ejecutar y ver que fallan.** Run: `npm test -- lib/domain/__tests__/catalog-eligibility.test.ts lib/data/__tests__/public-projection.test.ts && npm run test:db -- lib/data/__tests__/public-contract.db.test.ts` → FAIL.
- [ ] **Step 3: Implementar** según Files e Interfaces. El filtro de Prisma es optimización; la regla de verdad es `catalogEligibility` en la proyección.
- [ ] **Step 4: Ejecutar y verificar** (mismo comando) → PASS. Además `npm test -- components/__tests__/CatalogGrid.test.tsx components/__tests__/CatalogDepartments.test.tsx` (regresión).
- [ ] **Step 5: Commit.** `git commit -m "feat(catalogo): el sitio muestra solo prendas publicadas y elegibles"`

**Efecto en producción:** tras desplegar G18, `/catalogo` queda vacío hasta que owner o manager publiquen (en producción ningún producto tiene `isPublished = true`). Por eso G18–G20 salen juntos (cronograma §5).

---

### Task 2b: Acción "Publicar" (owner y manager) y sección "Sitio web" en la ficha — G20

**Files:**
- Modify: `lib/data/source.ts`, `lib/data/prisma-source.ts`, `lib/data/fixture-source.ts` (`setProductPublished(productId: string, published: boolean): Promise<void>`; `getProductForPublish(productId: string): Promise<Product | null>` con variantes e inventario; `null` si no existe, está inactivo o unido)
- Modify: `lib/products/actions.ts` (nueva `setProductPublishedAction`)
- Create: `components/products/PublishControl.tsx` (estado, huecos, botón y confirmación; lo reusan la ficha y la lista de Task 2d)
- Modify: `components/products/ProductAdminSheet.tsx` (sección "Sitio web" solo con `canEditData`; recibe `locations` con `type` e `isPublic`, ver Task 2d)
- Test: `lib/products/__tests__/actions.test.ts` (ampliar), `components/__tests__/ProductAdminSheet.test.tsx` (ampliar), `components/__tests__/PublishControl.test.tsx` (nuevo), `lib/data/__tests__/prisma-publish.db.test.ts` (nuevo)

**Interfaces:**
- Consumes: `catalogEligibility`, `hasStockInPublicStore`, `publicStoreIds`, `ELIGIBILITY_GAP_TEXT` (Tasks 2 y 2a); `gate()` y `ProductAdminResult` de `lib/products/actions.ts`; `Button`.
- Produces:
  - `setProductPublishedAction(productId: string, published: boolean): Promise<ProductAdminResult>`. `gate()` con los roles por defecto `["owner", "manager"]` (colaborador → `FORBIDDEN`; sin sesión → `SESSION`). `typeof published !== "boolean"` → `INVALID`. Producto inexistente, inactivo o unido → `NOT_FOUND`. `published: true` relee producto (`getProductForPublish`) y tiendas (`getLocations`), calcula `catalogEligibility`; si no es elegible → `{ ok: false, code: "INVALID", message: ELIGIBILITY_GAP_TEXT[gaps[0]] }` sin escribir. `published: false` siempre se permite. Al escribir: `refresh()` (ya revalida `/productos` y `/catalogo`).
  - `PublishControl({ product: Product; locations: Pick<Location, "id" | "type" | "isPublic">[]; onChanged(): void })`: muestra "Publicado en el sitio" o "No publicado"; si no es elegible, la lista de huecos y "Publicar" deshabilitado; si es elegible, `Button` "Publicar" que abre una confirmación en la misma pantalla: **"¿Publicar en el sitio? Revisa que las fotos no muestren personas, precios ni datos de clientes."** con "Sí, publicar" y "Cancelar"; si está publicado, `Button variant="outline"` "Quitar del sitio" (sin confirmación). Errores con `withSession` y `ActionErrorText`, como el resto de la ficha.

- [ ] **Step 1: Escribir los tests que fallan**

`lib/products/__tests__/actions.test.ts`:
- `"setProductPublishedAction: colaborador → FORBIDDEN y no escribe"`
- `"setProductPublishedAction: sesión vieja de owner con rol colaborador en la base → FORBIDDEN"`
- `"setProductPublishedAction: sin sesión → SESSION"`
- `"setProductPublishedAction: producto no elegible → INVALID con el texto del primer hueco"`
- `"setProductPublishedAction: manager publica un producto elegible aunque catalogPhotosCheckedAt sea nulo"`
- `"setProductPublishedAction: despublicar no exige elegibilidad"`
- `"setProductPublishedAction: published no booleano → INVALID"`

`prisma-publish.db.test.ts`: `"setProductPublished cambia solo isPublished"`; `"getProductForPublish no devuelve productos unidos ni inactivos"`.

`PublishControl.test.tsx`:
- `"producto elegible: Publicar pide confirmación con el aviso de personas y precios"`
- `"Sí, publicar llama setProductPublishedAction(id, true) y luego onChanged"`
- `"Cancelar no publica"`
- `"producto no elegible muestra los huecos y Publicar deshabilitado"`
- `"Quitar del sitio llama setProductPublishedAction con false"`

`ProductAdminSheet.test.tsx`:
- `"owner y manager ven la sección Sitio web"`
- `"el colaborador no ve la sección Sitio web"`

- [ ] **Step 2: Ejecutar y ver que fallan.** Run: `npm test -- lib/products/__tests__/actions.test.ts components/__tests__/PublishControl.test.tsx components/__tests__/ProductAdminSheet.test.tsx && npm run test:db -- lib/data/__tests__/prisma-publish.db.test.ts` → FAIL.
- [ ] **Step 3: Implementar** según Files e Interfaces. La UI decide el botón; el servidor decide permiso y elegibilidad.
- [ ] **Step 4: Ejecutar y verificar** (mismo comando), más `npm test -- components/__tests__/ProductosAdmin.test.tsx components/__tests__/ProductosTypes.test.tsx components/__tests__/ProductosPhotos.test.tsx`.
- [ ] **Step 5: Commit.** `git commit -m "feat(catalogo): Publicar para owner y manager con elegibilidad en el servidor"`

---

### Task 2c: Captura libre de fotos (sin análisis de fondo blanco) — G19

Aplica la decisión del 2026-11-12 a todo lo que dejó la entrega 1 (D T1, T8, T9). **Se mezcla después de G18.**

**Files:**
- Modify: `lib/image/process.ts` (borrar `analyzeBackground`, `BackgroundAnalysis`, `BORDER_RATIO`, `MIN_BORDER_PX`, `MIN_IMAGE_SIDE`, `BG_*`), `lib/image/__tests__/process.test.ts` (borrar el `describe("analyzeBackground")`; los fixtures de `lib/image/__tests__/fixtures/` que solo usa ese bloque se borran)
- Modify: `lib/image/process-file.ts` (`ProcessedPhoto = { file: File }`; nueva opción `{ levels?: boolean }` por defecto `true`; sin análisis)
- Modify: `components/products/ProductPhotoCapture.tsx` (sin `FRAMING_GUIDE`, `BACKGROUND_REJECTED`, `shakeKeyframes`, marco punteado ni temblor; texto de ayuda nuevo `PHOTO_HINT_FRONT = "Toma la foto de frente de la prenda."` / `PHOTO_HINT_BACK = "Toma la foto de atrás de la prenda."`; prop nueva `source?: "camera" | "gallery"` por defecto `"camera"`: con `"gallery"` el `<input>` va **sin** `capture`)
- Modify: `lib/motion/timing.ts` y `lib/motion/__tests__/timing.test.ts` (quitar `rejectShakeCount` y `rejectShakeMs`)
- Modify: `components/products/ProductPhotoButton.tsx` (quitar `ANALYZED` y el tercer argumento; prop `catalogChecked` se renombra `captureBoth?: boolean`, por defecto `false`; etiqueta "Reemplazar foto de frente/atrás" cuando `hasImage`, "Agregar foto de frente/atrás" si no; con `hasImage` pasa `source="gallery"` y `processFile` con `levels: false`, ver pregunta 1)
- Modify: `components/products/ProductAdminSheet.tsx` (bloque de fotos, hoy en la rama `product.catalogPhotosCheckedAt ? … : …`: owner/manager con **ninguna** foto → `ProductPhotoButton captureBoth`; con alguna foto → un botón por lado. El colaborador sigue igual: solo espacios vacíos)
- Modify: `components/products/NewProductForm.tsx` (quitar `photosAnalyzed: photos.length > 0` y su comentario; texto de fotos "Recomendadas, sobre fondo blanco. …" → "Recomendadas: frente y atrás. Sin las dos fotos el producto queda en «Falta completar registro fotográfico»."; tras guardar con estado "Listo para catálogo", línea extra: "Queda en «Por publicar» hasta que el dueño o el encargado lo publiquen.")
- Modify: `components/products/AltaTour.tsx` (solo `TOUR_STEPS[2]`: `{ title: "Toma fotos de frente y atrás", body: "Fotografía el frente y la parte de atrás de la prenda. El dueño las revisa antes de publicarlas." }`)
- Modify: `lib/domain/new-product.ts` (borrar `MSG_PHOTOS_NOT_ANALYZED`, el campo `photosAnalyzed` de `NewProductInput` y la línea `if ((front || back) && input.photosAnalyzed !== true) throw …`; `photosChecked` sigue = `Boolean(front && back)` en modo catálogo)
- Modify: `lib/actions.ts` (borrar `NOT_ANALYZED`, `isAnalyzed` y el campo `photosAnalyzed` de `CreateProductInput`; firmas nuevas abajo)
- Modify: `lib/data/prisma-source.ts` y `lib/data/fixture-source.ts` (`createProduct`: `catalogPhotosCheckedAt` solo si `data.photosChecked && data.imageUrl && data.backImageUrl`; guarda de capa de datos, minor G12)
- Modify: `lib/domain/types.ts` (comentario de `catalogPhotosCheckedAt`: "Fecha en que frente y atrás se guardaron juntas desde la app. Informativa: no decide elegibilidad (decisión 2026-11-12)."), `lib/data/source.ts` (comentarios de `photosChecked` y `setCatalogPhotos`)
- Modify: `lib/domain/product-reference.ts` (JSDoc de `productPhotoStatus`: significado nuevo de "Listo para catálogo"; lógica sin cambio)
- Tests a actualizar: `components/__tests__/ProductPhotoCapture.test.tsx`, `components/__tests__/ProductosPhotos.test.tsx`, `components/__tests__/NewProductForm-alta.test.tsx`, `components/__tests__/NewProductForm-modes.test.tsx`, `components/__tests__/AltaTour.test.tsx`, `lib/__tests__/actions-photos.test.ts`, `lib/__tests__/actions-create-product.test.ts`, `lib/__tests__/actions-permissions.test.ts`, `lib/__tests__/actions-alta.db.test.ts`, `lib/domain/__tests__/new-product.test.ts`, `lib/data/__tests__/prisma-create-product.db.test.ts`, `lib/data/__tests__/fixture-source.test.ts`, `app/__tests__/ssr-no-blank.test.tsx` (solo si menciona el texto quitado)

**Interfaces:**
- Produces (firmas nuevas; el servidor **ignora** argumentos extra de pestañas viejas):
  ```ts
  setProductBackImageAction(productId: string, url: string): Promise<PhotoActionResult>;
  updateProductImageAction(productId: string, formData: FormData): Promise<PhotoActionResult>;
  setCatalogPhotosAction(productId: string, input: { imageUrl: string; backImageUrl: string }): Promise<PhotoActionResult>;
  defaultProcessFile(file: File, opts?: { levels?: boolean }): Promise<{ file: File }>;
  ```
  `checkPhotoAccess` no cambia (reemplazar una foto ya puesta sigue siendo solo owner o manager; poner la primera, cualquiera con sesión).

- [ ] **Step 1: Escribir o reescribir los tests que fallan**
  - `ProductPhotoCapture.test.tsx`: `"cualquier foto procesada se entrega con onCapture, sin rechazo"`; `"no hay marco de encuadre ni texto de fondo blanco"` (`queryByTestId("framing-guide")` nulo; `queryByText(/blanc/i)` nulo); `"source gallery: el input no lleva capture"`; `"source camera (por defecto): el input lleva capture=environment"`. Borrar las pruebas de rechazo y temblor.
  - `actions-photos.test.ts`: reemplazar el bloque "fotos desde la ficha exigen la revisión de fondo" por `"updateProductImageAction y setProductBackImageAction guardan sin photosAnalyzed"` y `"una pestaña vieja que manda { photosAnalyzed: true } también guarda"`; `"setCatalogPhotosAction guarda sin photosAnalyzed"`. Conservar las de acceso, Blob y sesión.
  - `new-product.test.ts`: `"modo catálogo con dos fotos sin photosAnalyzed: photosChecked true"`; borrar las de `MSG_PHOTOS_NOT_ANALYZED`.
  - `prisma-create-product.db.test.ts`: `"photosChecked sin las dos URL no escribe catalogPhotosCheckedAt"`; `fixture-source.test.ts`: misma prueba en la fixture.
  - `ProductosPhotos.test.tsx`: `"owner con un producto sin fotos ve Tomar fotos de catálogo (frente y atrás)"`; `"owner con fotos ve Reemplazar foto de frente y de atrás aunque catalogPhotosCheckedAt sea nulo"`; `"colaborador solo ve Agregar en el lado vacío"`.
  - `NewProductForm-alta.test.tsx`: `"alta en catálogo con dos fotos no manda photosAnalyzed"`; `"estado Listo para catálogo muestra que queda en Por publicar"`.
  - `AltaTour.test.tsx`: el paso 3 no menciona fondo blanco.
- [ ] **Step 2: Ejecutar y ver que fallan.** Run: `npm test -- components/__tests__/ProductPhotoCapture.test.tsx components/__tests__/ProductosPhotos.test.tsx components/__tests__/NewProductForm components/__tests__/AltaTour.test.tsx lib/__tests__/actions-photos.test.ts lib/domain/__tests__/new-product.test.ts lib/data/__tests__/fixture-source.test.ts` → FAIL.
- [ ] **Step 3: Implementar** según Files e Interfaces.
- [ ] **Step 4: Verificar.** El mismo comando → PASS; `npm run test:db -- lib/data/__tests__/prisma-create-product.db.test.ts lib/__tests__/actions-alta.db.test.ts` → PASS; `grep -rn "blanc\|photosAnalyzed\|analyzeBackground\|FRAMING_GUIDE\|BACKGROUND_REJECTED\|rejectShake" app components lib --include=*.ts --include=*.tsx` → sin resultados fuera de pruebas que verifican su ausencia.
- [ ] **Step 5: Commit.** `git commit -m "feat(fotos): captura libre sin análisis de fondo; el dueño revisa al publicar"`

---

### Task 2d: Lista "Por publicar" en `/productos` (owner y manager) — G20

Para que el dueño encuentre rápido las prendas cuyas fotos debe editar, reemplazar y publicar.

**Files:**
- Modify: `app/productos/page.tsx` (guardar `locations` con `id`, `name`, `type`, `isPublic` en vez de `Pick<Location, "id" | "name">`; nuevo conmutador "Por publicar (N)" junto a "Por revisar", solo `isStaff`; con él activo, la grilla muestra `PendingPublicationRow` en lugar de `ProductCard`)
- Create: `components/products/PendingPublicationRow.tsx`
- Modify: `components/products/ProductAdminSheet.tsx` (tipo de la prop `locations`: `Pick<Location, "id" | "name" | "type" | "isPublic">[]`)
- Test: `components/__tests__/ProductosPorPublicar.test.tsx` (nuevo)

**Interfaces:**
- Consumes: `isPendingPublication`, `publicStoreIds`, `catalogEligibility` (Task 2a); `PublishControl` (Task 2b); `ProductPhotoButton` con `source="gallery"` (Task 2c); `fetchProductsAction` y `fetchLocationsAction` (ya cargados por la página; owner y manager reciben todo el inventario).
- Produces: `PendingPublicationRow({ product: Product; locations: …; onChanged(): void })`. Muestra: miniaturas de frente y atrás, cada una como enlace "Abrir foto de frente/atrás" (`target="_blank" rel="noopener noreferrer"` a la URL de Blob, para descargarla y editarla); marca, título, tipo y código público; huecos de `catalogEligibility` (p. ej. "Falta la descripción."); `ProductPhotoButton` por lado ("Reemplazar foto de frente", "Reemplazar foto de atrás", abre la galería); `PublishControl`; enlace "Ver ficha" (abre `ProductAdminSheet` con `setOpenId`). Orden: más antiguos primero (`createdAt` asc), para vaciar la cola.
- Reglas: el conteo "Por publicar (N)" usa `products.filter((p) => isPendingPublication(p, publicStoreIds(locations)))`. "Por revisar" y "Por publicar" son excluyentes (activar uno apaga el otro). Tras "Publicar" o reemplazar, `reload()`; el producto publicado sale de la lista.

- [ ] **Step 1: Escribir los tests que fallan** (`ProductosPorPublicar.test.tsx`, con mocks de las acciones como `ProductosAdmin.test.tsx`):
  - `"owner ve Por publicar con el conteo de productos con dos fotos y existencias sin publicar"`
  - `"manager también lo ve; el colaborador no"`
  - `"un producto sin foto de atrás, sin existencias en tienda pública o ya publicado no entra"`
  - `"cada fila tiene Abrir foto de frente y de atrás con el enlace a la foto"`
  - `"Reemplazar foto abre la captura desde la galería (input sin capture)"`
  - `"producto sin descripción aparece con Falta la descripción y Publicar deshabilitado"`
  - `"Publicar, tras confirmar, recarga y el producto sale de la lista"`
  - `"Por revisar y Por publicar no están activos a la vez"`
- [ ] **Step 2: Ejecutar y ver que fallan.** Run: `npm test -- components/__tests__/ProductosPorPublicar.test.tsx` → FAIL.
- [ ] **Step 3: Implementar.** El conmutador copia el patrón de "Por revisar" (`aria-pressed`, 44 px); B T7 le pone los colores de chip.
- [ ] **Step 4: Verificar.** Run: `npm test -- components/__tests__/ProductosPorPublicar.test.tsx components/__tests__/ProductosAdmin.test.tsx components/__tests__/ProductosTypes.test.tsx components/__tests__/ProductosPhotos.test.tsx components/__tests__/ProductAdminSheet.test.tsx` → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(productos): lista Por publicar con reemplazo de fotos y Publicar"`

---

### Task 3: Tarjeta del catálogo: sin "Agotado" y tallas tachadas sin cifras — G25

**Files:**
- Modify: `components/virtual-store/CatalogGrid.tsx` (rama `p.sizes.length > 0 && p.sizes.every((s) => !s.available) ? <span …>Agotado</span> : …`, hoy líneas 48–49)
- Test: `components/__tests__/CatalogGrid.test.tsx`

- [ ] **Step 1: Tests:** `"no muestra la palabra Agotado en ninguna tarjeta"` (prenda con una talla disponible y una no); `"la talla sin stock se muestra tachada y sin cifras"` (`getByLabelText("M, agotada")` con `line-through`).
- [ ] **Step 2: Run** `npm test -- components/__tests__/CatalogGrid.test.tsx` → FAIL.
- [ ] **Step 3: Implementar:** quitar el ternario y dejar solo los chips.
- [ ] **Step 4: Run** el mismo comando → PASS.
- [ ] **Step 5: Commit.** `git commit -m "fix(catalogo): sin etiqueta Agotado en tarjetas; tallas tachadas"`

---

### Task 4: Quitar el CTA de WhatsApp detrás de una constante — G25

**Files:**
- Modify: `lib/public/whatsapp.ts` (agregar `export const SHOW_WHATSAPP_CTA = false;`; `NO_WHATSAPP_TEXT` se conserva exportado)
- Modify: `components/virtual-store/ProductHotspotModal.tsx` (línea `const waLink = number ? whatsAppLink(…) : null;` → `SHOW_WHATSAPP_CTA && number ? … : null`)
- Modify: `components/products/ProductCard3D.tsx` (quitar el `else` que pinta `NO_WHATSAPP_TEXT`; el `<a>` queda dentro de `{waLink ? (…) : null}`)
- Test: `components/__tests__/ProductCard3D.test.tsx` (nuevo)

- [ ] **Step 1: Tests:** `"sin waLink no renderiza ningún CTA ni el texto de respaldo"`; `"con waLink muestra Consultar por WhatsApp como enlace"`; `"SHOW_WHATSAPP_CTA es false"`.
- [ ] **Step 2: Run** `npm test -- components/__tests__/ProductCard3D.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** con el comentario `// Pendiente de confirmar con el dueño (spec paleta §5). Poner true para revertir.`
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(catalogo): CTA de WhatsApp oculto con SHOW_WHATSAPP_CTA"`

---

### Task 5: Almacén de favoritos (funciones puras sobre `localStorage`) — G26

**Files:** Create `lib/public/favorites.ts`; Test `lib/public/__tests__/favorites.test.ts`.

**Interfaces (Produces):**
- `export const FAVORITES_KEY = "loloshop.favoritos.v1";`
- `export function getLocalStorage(): Storage | null` (null sin `window` o si acceder lanza)
- `export function readFavorites(storage: Storage | null): string[]` (nunca lanza; JSON corrupto o no-arreglo → `[]`; solo strings; sin duplicados)
- `export function writeFavorites(storage: Storage | null, ids: string[]): boolean`
- `export function toggleFavorite(ids: string[], id: string): string[]`

- [ ] **Step 1: Tests** (Storage falso en memoria): `"lee lista vacía si no hay nada guardado"`; `"ignora JSON corrupto y devuelve []"`; `"ignora un valor que no es arreglo"`; `"descarta elementos que no son string y los duplicados"`; `"si getItem lanza, readFavorites devuelve [] sin romper"`; `"si setItem lanza, writeFavorites devuelve false"`; `"writeFavorites con storage null devuelve false"`; `"toggleFavorite agrega si falta y quita si está"`; `"lo guardado son solo IDs de texto, nada más"`.
- [ ] **Step 2: Run** `npm test -- lib/public/__tests__/favorites.test.ts` → FAIL.
- [ ] **Step 3: Implementar** con `try/catch` en cada acceso, `Array.isArray`, filtro `typeof x === "string"` y `Set`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(favoritos): almacenamiento local con lecturas seguras"`

---

### Task 6: Hook `useFavorites` y botón `FavoriteButton` — G26

**Files:** Create `components/favorites/useFavorites.ts`, `components/favorites/FavoriteButton.tsx`; Test `components/__tests__/FavoriteButton.test.tsx`.

**Interfaces (Produces):**
- `useFavorites(): { ready: boolean; storageOk: boolean; ids: string[]; isSaved(id: string): boolean; toggle(id: string): void }`. Lee en `useEffect`, nunca en render.
- `FavoriteButton({ productId: string; title: string; saved: boolean; disabled: boolean; onToggle: () => void })`. Texto "Guardar en favoritos" / "En favoritos", `aria-pressed={saved}`; deshabilitado muestra "Tu navegador no permite guardar favoritos."; `e.stopPropagation()` antes de `onToggle`. Clases con `buttonClasses("primary", { disabled })`.

- [ ] **Step 1: Tests:** `"muestra Guardar en favoritos cuando no está guardada"`; `"muestra En favoritos con aria-pressed true cuando está guardada"`; `"al tocar llama onToggle y no propaga el clic"`; `"deshabilitada muestra el texto explicativo y no llama onToggle"`; `"useFavorites no lee localStorage durante el render del servidor"` (`renderToString`); `"useFavorites: si localStorage lanza, storageOk es false y el toggle no rompe"`.
- [ ] **Step 2: Run** `npm test -- components/__tests__/FavoriteButton.test.tsx` → FAIL.
- [ ] **Step 3: Implementar.** Si `writeFavorites` devuelve false: `storageOk = false`, estado en memoria para la sesión.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(favoritos): hook y botón con respaldo si el almacenamiento falla"`

---

### Task 7: Tarjeta del catálogo con favorito principal y "Ver prenda" en contorno — G26

**Files:** Modify `components/virtual-store/CatalogGrid.tsx`; Test `components/__tests__/CatalogGrid.test.tsx`.

**Interfaces:** props de `CatalogGrid` sin cambio (`{ products, onSelect }`).

- [ ] **Step 1: Tests:** `"cada tarjeta tiene el favorito como botón principal y Ver prenda como segunda acción"`; `"Ver prenda llama onSelect con la prenda"`; `"el favorito no llama onSelect"`; `"la tarjeta no contiene 'Consultar por WhatsApp' ni enlaces wa.me"`.
- [ ] **Step 2: Run** `npm test -- components/__tests__/CatalogGrid.test.tsx` → FAIL.
- [ ] **Step 3: Implementar:** `<button>` de apertura con imagen, textos y precio (sin botones anidados) y fila `flex gap-2 pt-2` con `FavoriteButton` (`flex-1`) y `<Button variant="outline" className="flex-1">Ver prenda</Button>`; un solo `useFavorites()` por grilla.
- [ ] **Step 4: Run** `npm test -- components/__tests__/CatalogGrid.test.tsx components/__tests__/CatalogA11y.test.tsx` → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(catalogo): favorito como acción principal y Ver prenda en contorno"`

---

### Task 8: Pantalla `/favoritos` — G26

**Files:**
- Create: `app/favoritos/page.tsx` (servidor: `fetchPublicProductsAction()`, `export const dynamic = "force-dynamic"`)
- Create: `components/favorites/FavoritesClient.tsx`
- Modify: `middleware.ts` (**hoy protege `/favoritos`**: el `matcher` excluye `login|catalogo|api/auth|…`; agregar `favoritos` a la exclusión)
- Test: `components/__tests__/FavoritesClient.test.tsx`; `app/__tests__/middleware-matcher.test.ts` (nuevo: `"el matcher deja pasar /favoritos y /catalogo y protege /productos"`, probando la expresión del `config.matcher`)

**Interfaces:** `FavoritesClient({ products: PublicProduct[]; loadError?: boolean })`. Guardadas que siguen en `products`: imagen, marca, título, precio y "Ver prenda" (enlace a `/catalogo#p-<id>`). Guardadas que ya no están: "Ya no disponible" y "Quitar" (`Button variant="danger"`) con confirmación en pantalla ("¿Quitar de favoritos?", "Sí, quitar", "Cancelar"). Texto fijo: "Tus favoritos se guardan solo en este navegador. Si cambias de dispositivo o borras los datos del navegador, se pierden."

- [ ] **Step 1: Tests:** `"lista solo las guardadas que siguen en el catálogo"`; `"marca Ya no disponible las guardadas que ya no están en el catálogo"`; `"quitar una prenda ya no disponible pide confirmación dentro de la pantalla"`; `"cancelar la confirmación no quita la prenda"`; `"sin favoritos muestra un estado vacío con enlace al catálogo"`; `"muestra la leyenda de que los favoritos son solo de este navegador"`; `"no envía IDs al servidor: no hay fetch de escritura"`; más la prueba del matcher.
- [ ] **Step 2: Run** `npm test -- components/__tests__/FavoritesClient.test.tsx app/__tests__/middleware-matcher.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** Mientras `!ready`, esqueleto `bg-niebla`. Si la carga falla: `products=[]`, `loadError` y "No pudimos cargar tus favoritos. Intenta de nuevo."
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(favoritos): pantalla de guardadas con estados disponible y ya no disponible"`

---

### Task 9: Verificación integral — G26 (cierre de C)

- [ ] **Step 1:** `npm test && npm run test:db` → todo en verde; reportar el número de pruebas `test:db` **ejecutadas**.
- [ ] **Step 2:** `npm run lint && npm run build` → sin errores nuevos.
- [ ] **Step 3:** `grep -rn "Consultar por WhatsApp\|Agotado\"\|bg-\[#22B8B8\]\|text-\[#16302F\]\|#0C7C7C\|#9A3B2E\|fondo blanco" components/virtual-store components/products components/favorites app/catalogo app/favoritos` → solo la rama de `ProductCard3D` detrás de `waLink`; ningún hex fijo nuevo (los de `ProductAdminSheet.tsx` previos los quita B T7).
- [ ] **Step 4: Preview (`ventas-prueba`).** Colaborador: alta en catálogo con dos fotos cualesquiera (sin fondo blanco) → "Listo para catálogo" y la nota de "Por publicar"; no ve "Por publicar" ni "Sitio web". Owner: "Por publicar" la muestra; "Abrir foto" abre la imagen; "Reemplazar foto de frente" desde la galería; "Publicar" con el aviso de personas y precios → aparece en `/catalogo` y por código en el bot. Vender la última pieza → desaparece del sitio. `/favoritos` sin sesión abre sin redirigir a `/login`.
- [ ] **Step 5: Revisión visual a 375 px** de `/catalogo`, `/favoritos` y "Por publicar": sin desplazamiento horizontal; botones de 44 px.

---

## Preguntas abiertas

1. **Fotos editadas por el dueño (decisión pendiente, ver cronograma §8).** "Reemplazar foto" abre la galería, conserva el recorte 1:1 y el tamaño máximo de 1080 px, y **no** aplica auto-niveles (`levels: false`) para no alterar su edición. ¿Sus fotos editadas son cuadradas?
2. **Llave de favoritos:** `id` (no `publicCode`, que puede ser null). Una unión deja el favorito como "Ya no disponible".
3. **Destino de "Ver prenda":** `/catalogo/p/[slug]` no existe; se abre la ficha actual (`ProductHotspotModal`) con `#p-<id>`.
4. **CTA de WhatsApp y favoritos:** reversibles con `SHOW_WHATSAPP_CTA`; confirmación del dueño pendiente (cronograma §8).
5. **Orden del catálogo:** se queda `createdAt` desc, `id` asc.
6. **Reemplazar una foto de un producto ya publicado:** sigue publicado (quien reemplaza es owner o manager). Si el dueño prefiere despublicar al reemplazar, es una línea en `PublishControl`/acciones.

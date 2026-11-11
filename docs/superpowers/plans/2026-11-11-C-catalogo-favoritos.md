# Subsistema C: sitio web (catálogo público) con elegibilidad y "Publicar", sin CTA de WhatsApp y favoritos locales — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El sitio web (`/catalogo` y el recorrido 3D) muestra solo prendas **elegibles y publicadas**: elegible = foto de frente y de atrás blancas revisadas (`catalogPhotosCheckedAt`), descripción y existencias en una tienda pública; publicada = owner o manager tocó "Publicar" en la ficha. Sin el CTA de WhatsApp, con favoritos guardados en el navegador y una pantalla `/favoritos`.

**Architecture:** C no crea migraciones: consume `Location.isPublic`, `Product.isPublished` y `Product.catalogPhotosCheckedAt` de H (ya mapeados al dominio por H Task 1). Una función pura (`lib/domain/catalog-eligibility.ts`) decide la elegibilidad; la usan la proyección pública y la acción "Publicar". La proyección pública (`lib/data/public-projection.ts`) sigue siendo la única fuente del sitio: solo cuenta tiendas `type = store` e `isPublic`, y exige elegible y publicado. `setProductPublishedAction` (owner y manager, rol releído de la base) vive en `lib/products/actions.ts` junto a las demás acciones de la ficha. Los favoritos son una lista de IDs en `localStorage` leída por un hook cliente; no hay llamadas al servidor para guardarlos. La pantalla `/favoritos` recibe el catálogo público ya proyectado y cruza esa lista en el cliente, de modo que el servidor nunca recibe qué guarda la persona.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Prisma (PostgreSQL), Vitest + React Testing Library, Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-11-paleta-botones-catalogo-design.md` (§4–§6, §8.1 para el dueño), `docs/superpowers/specs/2026-11-11-alta-producto-tienda-design.md` (§3 "Publicar", §8 catálogo automático, C16), `docs/superpowers/specs/2026-11-05-sitio-publico-ux-design.md` (§2.2 y §5.8 cambian aquí; §5.5 y §5.7 solo como referencia). Decisiones: `.superpowers/sdd/2026-11-11-version-final/decisiones.md` (1, 3 y 5).

**Orden de mezcla (cronograma §3):** séptimo, después de B base, A, las migraciones, G, D y E. B T9 (colores del catálogo) se aplica después de C.

## Global Constraints

- Botones y colores **solo** con `Button`/`buttonClasses` y los tokens de B base (`bg-turquesa`, `text-tinta`, `text-turquesa-texto`, `border-agotado`…), ya en `main`. Sin hex fijos (`bg-[#22B8B8]`, `text-[#16302F]`, `border-[#0C7C7C]`, `#9A3B2E`) en código nuevo; el barrido de B T10 falla si aparecen.
- Botón: altura mínima 44 px (`min-h-11` de `buttonClasses`); deshabilitado y peligro según `buttonClasses` (paleta §3).
- Sin cifras de stock en ninguna pantalla pública: solo booleanos por talla (paleta §4; ER §2.7).
- `PublicProduct` no gana campos. Sin SKU, barcode, `inventory`, `locationId` ni conteos (`lib/data/public-projection.ts`).
- Favoritos: solo `localStorage`, lectura y escritura dentro de `try/catch`, sin cuenta, sin llamadas al servidor para guardar (paleta §6).
- **Sin migraciones en C.** Las columnas las crea H (`<timestamp>_catalog_color_visibility`). Pruebas `*.db.test.ts` con `npm run test:db` (las excluye `npm test`).
- Publicar solo owner y manager, comprobado en el servidor con el rol releído de la base; el colaborador no ve el botón ni puede llamar la acción.
- Elegible y publicado se exige en **lectura** (proyección), no solo al publicar: si una prenda pierde existencias o su descripción, sale del sitio sin intervención.
- Texto en español de México, tuteo.

## Review Focus

1. Almacenamiento bloqueado o lleno (modo privado, cuota agotada): la app no se rompe; el corazón se deshabilita con texto. Test en Task 5 y Task 6.
2. JSON corrupto o de otra forma en `localStorage`: se ignora y se trata como lista vacía. Test en Task 5.
3. Favorito de una prenda que dejó de existir (vendida, dada de baja o unida): la pantalla muestra "Ya no disponible" y se puede quitar. Test en Task 8.
4. Render en servidor sin `window`: el hook no lee `localStorage` hasta montar; sin error de hidratación. Test en Task 6.
5. Tienda con `isPublic = false` o sin tiendas públicas: el catálogo queda vacío sin error y sin filtrar bodegas. Test en Task 2.
6. Colaborador con sesión vieja de owner llama `setProductPublishedAction`: `FORBIDDEN` con el rol de la base. Test en Task 2b.
7. Producto publicado que se queda sin existencias o con fotos viejas (exclusión por CSV): desaparece del sitio sin despublicar a mano. Test en Task 2a.

---

### Task 1: Lectura de `Location.isPublic` (consume H)

**Files:**
- Test: `lib/data/__tests__/prisma-locations.db.test.ts` (nuevo, usa el patrón `hasTestDb` de `public-contract.db.test.ts`)
- Modify (solo si H no lo dejó): `lib/data/fixture-source.ts` (`createLocation` con `isPublic: data.isPublic ?? true`)

**Interfaces:**
- Consumes: columna `Location.isPublic Boolean @default(true)` y `Location.isPublic?: boolean` en el dominio (H Task 1, ya en `main`).
- Produces: ninguna nueva. Fija con pruebas el contrato que usa Task 2.

- [ ] **Step 1: Confirmar que H está en la rama.** `grep -n "isPublic" prisma/schema.prisma lib/domain/types.ts lib/data/prisma-source.ts` muestra la columna y su mapeo. Si no, detenerse y rebasar sobre `main`. **No** correr `prisma migrate`.

- [ ] **Step 2: Escribir el test**

Test `"tiendas nuevas son públicas por defecto y el valor se lee en getLocations"` en `prisma-locations.db.test.ts`: crea una `Location` tipo `store` sin `isPublic`, llama `getLocations()` y espera `isPublic === true`; crea otra con `isPublic: false` y espera `false`. Añadir también `"bodegas no se filtran aquí: getLocations devuelve type warehouse con su isPublic"`.

- [ ] **Step 3: Ejecutar**

Run: `npm run test:db -- lib/data/__tests__/prisma-locations.db.test.ts`
Expected: PASS si H dejó el mapeo (queda como regresión); si falla, el hueco es de H Task 1: corregirlo en el mapeo de `prisma-source.ts` en este mismo commit y anotarlo. Sin `TEST_DATABASE_URL` las pruebas se saltan: anotarlo en el reporte y no darlo por verificado.

- [ ] **Step 4: Commit**

```bash
git add lib/data/__tests__/prisma-locations.db.test.ts lib/data/fixture-source.ts
git commit -m "test(db): contrato de Location.isPublic para el sitio público"
```

---

### Task 2: Proyección: solo tiendas públicas y solo prendas con alguna talla disponible (C16)

**Files:**
- Modify: `lib/data/public-projection.ts` (líneas 57–66 y 80–85; extraer helper)
- Test: `lib/data/__tests__/public-projection.test.ts` (agregar `describe("stock sincronizado con el catálogo", ...)`)

**Interfaces:**
- Consumes: `Location.isPublic?: boolean` (H, Task 1).
- Produces: `export function publicStoreIds(locations: Location[]): Set<string>` en `public-projection.ts`. Cuenta `type === "store"` y `isPublic !== false`. `getPublicCatalog` y `findPublicByCode` la usan.

- [ ] **Step 1: Escribir los tests que fallan**

En `public-projection.test.ts`, con los mismos fixtures que el bloque existente:

- `"tienda con isPublic false no cuenta para la disponibilidad"`: una talla con stock solo en tienda `isPublic: false` → `sizes[0].available === false`.
- `"bodega pública no cuenta: solo type store"`: stock solo en `warehouse` con `isPublic: true` → `available === false`.
- `"sin tiendas públicas, getPublicCatalog devuelve [] sin lanzar"`.
- `"una prenda con todas sus tallas sin stock no aparece en getPublicCatalog"`.
- `"una prenda con una talla con stock aparece y las demás conservan available false"`: `sizes` incluye ambas tallas.
- `"publicStoreIds excluye bodegas y tiendas con isPublic false"`.
- `"C16: producto con fotos y sin existencias no entra al catálogo público"` (criterio C16 de la spec de alta; antes en D Task 5): con fotos y stock 0 no aparece; con stock 1 en una tienda pública, sí.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npm test -- lib/data/__tests__/public-projection.test.ts`
Expected: FAIL en los tests nuevos.

- [ ] **Step 3: Implementar**

Agregar `publicStoreIds` y usarla en `getPublicCatalog` y `findPublicByCode`. Cambiar el filtro final de `getPublicCatalog` de `p.sizes.length > 0` a `p.sizes.some((s) => s.available)`. `findPublicByCode` usa `publicStoreIds`; su regla de elegibilidad completa llega en Task 2a (pregunta 4 resuelta).

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npm test -- lib/data/__tests__/public-projection.test.ts && npm run test:db -- lib/data/__tests__/public-contract.db.test.ts`
Expected: PASS. El contrato de claves (`public-contract.db.test.ts`) no cambia porque `PublicProduct` no gana campos.

- [ ] **Step 5: Commit**

```bash
git add lib/data/public-projection.ts lib/data/__tests__/public-projection.test.ts
git commit -m "feat(catalogo): show only products with stock in public stores"
```

---

### Task 2a: Elegibilidad del sitio y filtro de publicación

**Files:**
- Create: `lib/domain/catalog-eligibility.ts`
- Test: `lib/domain/__tests__/catalog-eligibility.test.ts` (nuevo)
- Modify: `lib/data/prisma-source.ts` (`getCatalogProducts`: `where` gana `isPublished: true`, `catalogPhotosCheckedAt: { not: null }`, `description: { not: null }`), `lib/data/fixture-source.ts` (mismo filtro), `lib/data/source.ts` (comentario de `getCatalogProducts`)
- Modify: `lib/data/public-projection.ts` (`getPublicCatalog` y `findPublicByCode` aplican `catalogEligibility` y `isPublished`)
- Test: `lib/data/__tests__/public-projection.test.ts` (ampliar), `lib/data/__tests__/public-contract.db.test.ts` (ampliar)

**Interfaces:**
- Consumes: `Product.isPublished`, `Product.catalogPhotosCheckedAt`, `Product.description`, `imageUrl`, `backImageUrl` (dominio, H Task 1); `publicStoreIds` (Task 2).
- Produces:
  ```ts
  export type EligibilityGap = "FOTO_FRENTE" | "FOTO_ATRAS" | "FOTOS_SIN_REVISAR" | "DESCRIPCION" | "EXISTENCIAS";
  export const ELIGIBILITY_GAP_TEXT: Readonly<Record<EligibilityGap, string>>;
  // FOTO_FRENTE: "Falta la foto de frente."
  // FOTO_ATRAS: "Falta la foto de atrás."
  // FOTOS_SIN_REVISAR: "Toma de nuevo las fotos de frente y atrás sobre fondo blanco."
  // DESCRIPCION: "Falta la descripción."
  // EXISTENCIAS: "No hay piezas en una tienda pública."
  export function catalogEligibility(p: {
    imageUrl: string | null; backImageUrl: string | null; catalogPhotosCheckedAt: string | null;
    description: string | null; hasStockInPublicStore: boolean;
  }): { eligible: boolean; gaps: EligibilityGap[] }; // gaps en el orden del tipo; eligible = gaps.length === 0
  export function hasStockInPublicStore(p: Product, storeIds: Set<string>): boolean; // alguna variante activa con available > 0 en storeIds
  ```
  Pura, sin Prisma; corre en cliente y servidor (la ficha la usa en Task 2b). "Listo para catálogo" de D (`productPhotoStatus`) es el estado interno; `catalogEligibility` es la regla del sitio (agrega descripción y fotos revisadas).
- Regla del sitio: `getPublicCatalog` y `findPublicByCode` devuelven un producto solo si `isPublished === true` **y** `catalogEligibility(...).eligible`. `findPublicByCode` deja de devolver prendas sin existencias (pregunta 4 resuelta: el sitio y el bot quedan alineados).

- [ ] **Step 1: Escribir los tests que fallan**

`catalog-eligibility.test.ts`:
- `"producto completo es elegible"`
- `"sin foto de atrás: FOTO_ATRAS"`
- `"fotos sin revisar (catalogPhotosCheckedAt null): FOTOS_SIN_REVISAR"`
- `"descripción solo espacios: DESCRIPCION"`
- `"sin existencias en tienda pública: EXISTENCIAS"`
- `"varios huecos salen en orden fijo"`

`public-projection.test.ts`:
- `"producto elegible sin publicar no aparece en el sitio"`
- `"producto publicado con fotos sin revisar no aparece"` (caso de las fotos de tienda excluidas por CSV)
- `"producto publicado que se queda sin existencias desaparece sin despublicar"`
- `"findPublicByCode no devuelve un producto sin publicar ni uno sin existencias"`

`public-contract.db.test.ts`: `"getCatalogProducts solo trae publicados con fotos revisadas y descripción"`.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npm test -- lib/domain/__tests__/catalog-eligibility.test.ts lib/data/__tests__/public-projection.test.ts && npm run test:db -- lib/data/__tests__/public-contract.db.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** según Files e Interfaces. El filtro de Prisma es una optimización; la regla de verdad es `catalogEligibility` en la proyección (cubre descripción vacía y existencias).

- [ ] **Step 4: Ejecutar y verificar que pasan** (mismo comando). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/catalog-eligibility.ts lib/domain/__tests__/catalog-eligibility.test.ts lib/data/ 
git commit -m "feat(catalogo): el sitio muestra solo prendas elegibles y publicadas"
```

---

### Task 2b: Acción "Publicar" (owner y manager) y botón en la ficha

**Files:**
- Modify: `lib/data/source.ts`, `lib/data/prisma-source.ts`, `lib/data/fixture-source.ts` (`setProductPublished(productId: string, published: boolean): Promise<void>`; `getProductForPublish(productId: string): Promise<Product | null>` con variantes e inventario, activo y sin unir)
- Modify: `lib/products/actions.ts` (nueva `setProductPublishedAction`)
- Modify: `components/products/ProductAdminSheet.tsx` (sección "Sitio web": estado, huecos y botón)
- Test: `lib/products/__tests__/actions.test.ts` (ampliar), `components/__tests__/ProductAdminSheet.test.tsx` (ampliar), `lib/data/__tests__/prisma-publish.db.test.ts` (nuevo)

**Interfaces:**
- Consumes: `catalogEligibility`, `hasStockInPublicStore`, `publicStoreIds`, `ELIGIBILITY_GAP_TEXT` (Tasks 2 y 2a); `gate()` y `ProductAdminResult` de `lib/products/actions.ts` (rol releído de la base con `currentUserOrNull`); `Button` de B base.
- Produces:
  - `setProductPublishedAction(productId: string, published: boolean): Promise<ProductAdminResult>`. `gate()` con `["owner", "manager"]` (el colaborador recibe `FORBIDDEN`; sin sesión, `SESSION`). Producto inexistente, inactivo o unido → `NOT_FOUND`. `published: true` relee el producto y las tiendas, calcula `catalogEligibility`; si no es elegible → `{ ok: false, code: "INVALID", message: <texto del primer hueco> }` sin escribir. `published: false` siempre se permite. Al escribir: `revalidatePath("/catalogo")` y `revalidatePath("/productos")`.
  - Ficha (`ProductAdminSheet`), solo owner y manager: sección "Sitio web" con "Publicado en el sitio" / "No publicado"; si no es elegible, la lista de huecos con `ELIGIBILITY_GAP_TEXT` y el botón "Publicar" deshabilitado; si es elegible, `Button` "Publicar"; si está publicado, `Button variant="outline"` "Quitar del sitio". El colaborador no ve la sección.

- [ ] **Step 1: Escribir los tests que fallan**

`lib/products/__tests__/actions.test.ts`:
- `"setProductPublishedAction: colaborador → FORBIDDEN y no escribe"`
- `"setProductPublishedAction: sesión vieja de owner con rol colaborador en la base → FORBIDDEN"`
- `"setProductPublishedAction: sin sesión → SESSION"`
- `"setProductPublishedAction: producto no elegible → INVALID con el texto del primer hueco"`
- `"setProductPublishedAction: manager publica un producto elegible"`
- `"setProductPublishedAction: despublicar no exige elegibilidad"`

`prisma-publish.db.test.ts`: `"setProductPublished cambia solo isPublished"`; `"getProductForPublish no devuelve productos unidos ni inactivos"`.

`ProductAdminSheet.test.tsx`:
- `"owner ve Publicar cuando el producto es elegible"`
- `"producto no elegible muestra los huecos y Publicar deshabilitado"`
- `"el colaborador no ve la sección Sitio web"`
- `"Quitar del sitio llama setProductPublishedAction con false"`

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npm test -- lib/products/__tests__/actions.test.ts components/__tests__/ProductAdminSheet.test.tsx && npm run test:db -- lib/data/__tests__/prisma-publish.db.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** según Files e Interfaces. La UI decide el botón; el servidor decide el permiso y la elegibilidad.

- [ ] **Step 4: Ejecutar y verificar que pasan** (mismo comando), más `npm test -- components/__tests__/ProductosAdmin.test.tsx components/__tests__/ProductosTypes.test.tsx` (regresión de A, G y D).

- [ ] **Step 5: Commit**

```bash
git add lib/data/ lib/products/actions.ts lib/products/__tests__/actions.test.ts components/products/ProductAdminSheet.tsx components/__tests__/ProductAdminSheet.test.tsx
git commit -m "feat(catalogo): botón Publicar para owner y manager con elegibilidad en el servidor"
```

---

### Task 3: Tarjeta del catálogo: sin "Agotado" y tallas tachadas sin cifras

**Files:**
- Modify: `components/virtual-store/CatalogGrid.tsx:48-49` (eliminar la rama "Agotado")
- Test: `components/__tests__/CatalogGrid.test.tsx` (existente; agregar casos)

**Interfaces:**
- Consumes: `PublicProduct` sin cambios.
- Produces: ninguna nueva.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar en `CatalogGrid.test.tsx`:

- `"no muestra la palabra Agotado en ninguna tarjeta"`: producto con todas las tallas `available: false` no se usa aquí porque la proyección ya lo excluye; el test renderiza una prenda con una talla disponible y una no, y espera `queryByText("Agotado")` nulo.
- `"la talla sin stock se muestra tachada y sin cifras"`: `getByLabelText("M, agotada")` tiene clase `line-through`; no existe ningún texto con dígitos distintos a la talla.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npm test -- components/__tests__/CatalogGrid.test.tsx`
Expected: FAIL en "no muestra la palabra Agotado" si el fixture usa todas agotadas; ajustar el fixture a una prenda parcial para que el test sea significativo.

- [ ] **Step 3: Implementar**

Eliminar el ternario `p.sizes.length > 0 && p.sizes.every(...)` de `CatalogGrid.tsx` y dejar solo el bloque de chips.

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm test -- components/__tests__/CatalogGrid.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/virtual-store/CatalogGrid.tsx components/__tests__/CatalogGrid.test.tsx
git commit -m "fix(catalogo): drop sold-out label from cards, keep struck sizes"
```

---

### Task 4: Quitar el CTA de WhatsApp detrás de una constante

**Files:**
- Modify: `lib/public/whatsapp.ts` (agregar constante exportada)
- Modify: `components/virtual-store/ProductHotspotModal.tsx:35-36` (waLink condicionado)
- Modify: `components/products/ProductCard3D.tsx:116-131` (eliminar el bloque del botón y el texto `NO_WHATSAPP_TEXT`)
- Test: `components/__tests__/ProductCard3D.test.tsx` (nuevo)

**Interfaces:**
- Consumes: ninguna.
- Produces: `export const SHOW_WHATSAPP_CTA = false;` en `lib/public/whatsapp.ts`. C es dueño de los botones de la tarjeta pública: "Ver prenda" vive en `CatalogGrid` (Task 7), no en `ProductCard3D`; B T9 solo cambia colores y no agrega botones. `ProductHotspotModal` pasa `waLink = SHOW_WHATSAPP_CTA && number ? whatsAppLink(...) : null`. `ProductCard3D` no renderiza ningún CTA cuando `waLink` es null.

- [ ] **Step 1: Escribir los tests que fallan**

En `ProductCard3D.test.tsx`:

- `"sin waLink no renderiza ningún CTA ni el texto de respaldo"`: `queryByRole("link")` es nulo y no hay texto "Consultar disponibilidad en tienda".
- `"con waLink muestra Consultar por WhatsApp como enlace"`: `getByRole("link", { name: "Consultar por WhatsApp" })` tiene `href` igual al `waLink`.
- `"SHOW_WHATSAPP_CTA es false"`: `expect(SHOW_WHATSAPP_CTA).toBe(false)`.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npm test -- components/__tests__/ProductCard3D.test.tsx`
Expected: FAIL (la constante no existe y el texto de respaldo sí aparece).

- [ ] **Step 3: Implementar**

Agregar la constante con un comentario de una línea: `// Pendiente de confirmar con el dueño (spec paleta §5). Poner true para revertir.` En `ProductHotspotModal`, condicionar `waLink`. En `ProductCard3D`, eliminar el `else` que renderiza `NO_WHATSAPP_TEXT` y el bloque `<a>` completo cuando `waLink` es null; el `<a>` se conserva tal cual para revertir.

Nota: el `<a>` se mantiene dentro de `{waLink ? (...) : null}`. No borrar el SVG; la reversión debe ser solo cambiar la constante.

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm test -- components/__tests__/ProductCard3D.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/public/whatsapp.ts components/virtual-store/ProductHotspotModal.tsx components/products/ProductCard3D.tsx components/__tests__/ProductCard3D.test.tsx
git commit -m "feat(catalogo): hide WhatsApp CTA behind SHOW_WHATSAPP_CTA"
```

---

### Task 5: Almacén de favoritos (funciones puras sobre `localStorage`)

**Files:**
- Create: `lib/public/favorites.ts`
- Test: `lib/public/__tests__/favorites.test.ts`

**Interfaces:**
- Consumes: ninguna.
- Produces:
  - `export const FAVORITES_KEY = "loloshop.favoritos.v1";`
  - `export function getLocalStorage(): Storage | null` (devuelve `null` si `window` no existe o si acceder a `localStorage` lanza).
  - `export function readFavorites(storage: Storage | null): string[]` (nunca lanza; JSON corrupto o no-arreglo → `[]`; descarta elementos que no sean string; sin duplicados).
  - `export function writeFavorites(storage: Storage | null, ids: string[]): boolean` (`false` si lanza o `storage` es null).
  - `export function toggleFavorite(ids: string[], id: string): string[]` (pura).

- [ ] **Step 1: Escribir los tests que fallan**

En `favorites.test.ts`, con un `Storage` falso en memoria:

- `"lee lista vacía si no hay nada guardado"`
- `"ignora JSON corrupto y devuelve []"`: valor `"{roto"`.
- `"ignora un valor que no es arreglo"`: valor `'{"a":1}'`.
- `"descarta elementos que no son string y los duplicados"`: `'["a", 1, null, "a", "b"]'` → `["a","b"]`.
- `"si getItem lanza, readFavorites devuelve [] sin romper"`.
- `"si setItem lanza, writeFavorites devuelve false"`.
- `"writeFavorites con storage null devuelve false"`.
- `"toggleFavorite agrega si falta y quita si está"`.
- `"lo guardado son solo IDs de texto, nada más"`: tras `writeFavorites(s, ["x"])`, `s.getItem(FAVORITES_KEY) === '["x"]'`.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npm test -- lib/public/__tests__/favorites.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

Usar `try/catch` en cada acceso a `storage`. `readFavorites` parsea con `JSON.parse` dentro de `try`, valida con `Array.isArray` y filtra con `typeof x === "string"`, y deduplica con `Set`.

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm test -- lib/public/__tests__/favorites.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/public/favorites.ts lib/public/__tests__/favorites.test.ts
git commit -m "feat(favoritos): local-only storage helpers with safe reads"
```

---

### Task 6: Hook `useFavorites` y botón `FavoriteButton`

**Files:**
- Create: `components/favorites/useFavorites.ts`
- Create: `components/favorites/FavoriteButton.tsx`
- Test: `components/__tests__/FavoriteButton.test.tsx`

**Interfaces:**
- Consumes: `getLocalStorage`, `readFavorites`, `writeFavorites`, `toggleFavorite` (Task 5).
- Produces:
  - `useFavorites(): { ready: boolean; storageOk: boolean; ids: string[]; isSaved(id: string): boolean; toggle(id: string): void }`. Lee en `useEffect` (nunca durante el render). `storageOk` es `false` si `writeFavorites` devuelve `false` al primer intento de escritura o si `getLocalStorage()` es null.
  - `FavoriteButton({ productId: string; title: string; saved: boolean; disabled: boolean; onToggle: () => void })`. Texto visible: "Guardar en favoritos" o "En favoritos". Usa `aria-pressed={saved}`. Cuando `disabled`, muestra el texto "Tu navegador no permite guardar favoritos." en un `<p>` debajo. El `onClick` llama `e.stopPropagation()` antes de `onToggle`.

- [ ] **Step 1: Escribir los tests que fallan**

En `FavoriteButton.test.tsx`:

- `"muestra Guardar en favoritos cuando no está guardada"`
- `"muestra En favoritos con aria-pressed true cuando está guardada"`
- `"al tocar llama onToggle y no propaga el clic"`: se usa un contenedor con `onClick` espía; el espía no se llama.
- `"deshabilitada muestra el texto explicativo y no llama onToggle"`
- `"useFavorites no lee localStorage durante el render del servidor"`: renderiza con `renderToString` y comprueba que no lanza y que `ready` es `false` en el HTML inicial (usar `vi.stubGlobal` para que `localStorage` lance al leer).
- `"useFavorites: si localStorage lanza, storageOk es false y el toggle no rompe"`.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npm test -- components/__tests__/FavoriteButton.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

El hook guarda `ids` en estado; en `useEffect` de montaje lee con `readFavorites(getLocalStorage())`, fija `ready = true`. `toggle` calcula `next = toggleFavorite(ids, id)`, llama `writeFavorites` y, si devuelve `false`, pone `storageOk = false` y deja el estado en memoria para la sesión. Esto evita que un fallo de escritura deje la UI mintiendo: si `storageOk` es false, el botón se deshabilita en el siguiente render. Clases del botón: `buttonClasses("primary", { disabled })` de B (relleno `bg-turquesa`, texto `text-tinta`, `min-h-11`) cuando guardada o no. El estado "En favoritos" usa el mismo relleno con icono de corazón relleno.

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm test -- components/__tests__/FavoriteButton.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/favorites/useFavorites.ts components/favorites/FavoriteButton.tsx components/__tests__/FavoriteButton.test.tsx
git commit -m "feat(favoritos): hook and heart button with safe storage fallback"
```

---

### Task 7: Tarjeta del catálogo con favorito principal y "Ver prenda" en contorno

**Files:**
- Modify: `components/virtual-store/CatalogGrid.tsx` (estructura de `<li>`: bloque visual como botón de apertura + fila de acciones)
- Test: `components/__tests__/CatalogGrid.test.tsx` (agregar casos)

**Interfaces:**
- Consumes: `useFavorites`, `FavoriteButton` (Task 6); `PublicProduct` (sin cambios).
- Produces: sin cambios en las props de `CatalogGrid` (`{ products, onSelect }`).

- [ ] **Step 1: Escribir los tests que fallan**

- `"cada tarjeta tiene el favorito como botón principal y Ver prenda como segunda acción"`: `getByRole("button", { name: "Guardar en favoritos" })` y `getByRole("button", { name: "Ver prenda" })`.
- `"Ver prenda llama onSelect con la prenda"`.
- `"el favorito no llama onSelect"`.
- `"la tarjeta no contiene 'Consultar por WhatsApp' ni enlaces wa.me"`: `container.querySelector('a[href*="wa.me"]')` es nulo.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npm test -- components/__tests__/CatalogGrid.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Cambiar el `<button>` de toda la tarjeta a un `<button>` que contiene solo la imagen y textos (sin anidar botones), seguido de una fila `<div className="flex gap-2 pt-2">` con `FavoriteButton` (relleno, `flex-1`) y `<Button variant="outline" className="flex-1">Ver prenda</Button>` (contorno `turquesa-texto` y 44 px los pone `buttonClasses`). `FavoriteButton` recibe `saved={isSaved(p.id)}`, `disabled={!storageOk}` y `onToggle={() => toggle(p.id)}`. Usar `useFavorites()` dentro de `CatalogGrid` (un solo hook por grilla).

El texto de la prenda y el precio siguen dentro del botón de apertura.

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm test -- components/__tests__/CatalogGrid.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/virtual-store/CatalogGrid.tsx components/__tests__/CatalogGrid.test.tsx
git commit -m "feat(catalogo): favorite as primary card action, Ver prenda outline"
```

---

### Task 8: Pantalla `/favoritos`

**Files:**
- Create: `app/favoritos/page.tsx` (servidor: llama `fetchPublicProductsAction()`, `export const dynamic = "force-dynamic"`)
- Create: `components/favorites/FavoritesClient.tsx`
- Test: `components/__tests__/FavoritesClient.test.tsx`

**Interfaces:**
- Consumes: `useFavorites` (Task 6); `PublicProduct` (sin cambios); `fetchPublicProductsAction` de `@/lib/actions`.
- Produces: `FavoritesClient({ products: PublicProduct[] })`. Lista las guardadas que existen en `products` (con stock), con imagen, marca, título, precio y "Ver prenda" (enlace a `/catalogo` con el id como hash `#p-<id>`; no existe `/catalogo/p/[slug]`, ver pregunta 3). Las guardadas que no están en `products` aparecen con el texto "Ya no disponible" y un botón "Quitar" (`Button variant="danger"`, contorno `agotado`) que abre confirmación dentro de la misma pantalla ("¿Quitar de favoritos?" con "Sí, quitar" y "Cancelar"). Un texto fijo explica: "Tus favoritos se guardan solo en este navegador. Si cambias de dispositivo o borras los datos del navegador, se pierden."

- [ ] **Step 1: Escribir los tests que fallan**

- `"lista solo las guardadas que siguen en el catálogo"`: `localStorage` con dos IDs, `products` con uno; se ve uno y no el otro sin el texto "Ya no disponible" en la tarjeta del visible.
- `"marca Ya no disponible las guardadas que ya no están en el catálogo"`.
- `"quitar una prenda ya no disponible pide confirmación dentro de la pantalla"`: tras el primer clic aparece "¿Quitar de favoritos?"; tras "Sí, quitar" desaparece del `localStorage`.
- `"cancelar la confirmación no quita la prenda"`.
- `"sin favoritos muestra un estado vacío con enlace al catálogo"`.
- `"muestra la leyenda de que los favoritos son solo de este navegador"`.
- `"no envía IDs al servidor: no hay fetch de escritura"`: `vi.spyOn(global, "fetch")` no se llama.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npm test -- components/__tests__/FavoritesClient.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`FavoritesClient` calcula `visibles = products.filter(p => ids.includes(p.id))` y `gone = ids.filter(id => !products.some(p => p.id === id))`, con `ready` del hook: mientras `!ready` muestra un esqueleto `niebla`. Ordenar: visibles primero en el orden de `products`, luego las "Ya no disponible".

En `app/favoritos/page.tsx`, envolver la llamada como en `app/catalogo/page.tsx`: si falla, pasar `products=[]` y `loadError`; mostrar "No pudimos cargar tus favoritos. Intenta de nuevo." (el listado de guardadas no depende del servidor, así que el usuario puede quitarlas igual; ver pregunta 2).

Verificar que el middleware/proxy de auth no protege `/favoritos` (buscar `middleware.ts` o `proxy.ts` en la raíz y su `matcher`). Si lo protege, agregar la excepción en el mismo cambio.

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm test -- components/__tests__/FavoritesClient.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/favoritos components/favorites/FavoritesClient.tsx components/__tests__/FavoritesClient.test.tsx
git commit -m "feat(favoritos): saved items screen with stock and gone states"
```

---

### Task 9: Verificación integral

**Files:** ninguno nuevo.

**Interfaces:** ninguna.

- [ ] **Step 1: Suite completa**

Run: `npm test && npm run test:db`
Expected: todas las pruebas pasan. `npm test` excluye `*.db.test.ts`; `npm run test:db` debe mostrar las pruebas **ejecutadas** (sin `TEST_DATABASE_URL` se saltan en silencio, y eso se reporta explícitamente).

- [ ] **Step 2: Lint y build**

Run: `npm run lint && npm run build`
Expected: sin errores nuevos. El build necesita `DATABASE_URL` válido o el cliente generado.

- [ ] **Step 3: Búsqueda de restos del CTA**

Run: `grep -rn "Consultar por WhatsApp\|Agotado\"\|bg-\[#22B8B8\]\|text-\[#16302F\]\|#0C7C7C\|#9A3B2E" components/virtual-store components/products components/favorites app/catalogo app/favoritos`
Expected: solo la rama dentro de `ProductCard3D` detrás de `waLink` (no renderizada con `SHOW_WHATSAPP_CTA = false`); ningún hex fijo de la paleta.

- [ ] **Step 3b: Publicar de punta a punta (preview, `ventas-prueba`)**

Owner: abre una prenda con fotos revisadas, descripción y piezas → "Publicar" → aparece en `/catalogo`. Vende la última pieza → desaparece del sitio sin despublicar. Colaborador: no ve "Sitio web" en la ficha.

- [ ] **Step 4: Revisión visual a 375 px**

Abrir `/catalogo` y `/favoritos` a 375×640 (herramienta de navegador disponible en la sesión). Verificar: sin desplazamiento horizontal; corazón y "Ver prenda" a 44 px; estado "En favoritos" con `aria-pressed`.

- [ ] **Step 5: Commit**

Sin cambios de código en esta tarea salvo correcciones de lint; si las hay, `git commit -m "chore(catalogo): fix lint after favoritos"`.

---

## Preguntas abiertas (la spec no las responde)

1. ~~Valor por defecto de `isPublic`.~~ **Resuelta (decisión 3):** `@default(true)`; las dos tiendas actuales son públicas; sin pantalla para cambiarlo.
2. **Llave de favoritos:** la spec dice `publicCode` o `slug`. El plan usa `id`, porque `publicCode` puede ser null y ya viaja en `PublicProduct`; con `id`, una unión de producto deja el favorito como "Ya no disponible". ¿Confirmar?
3. **Destino de "Ver prenda":** `/catalogo/p/[slug]` (spec §5.5) no existe en `app/`. El plan abre la ficha actual (`ProductHotspotModal`). La ruta queda después de la demo.
4. ~~Bot de WhatsApp.~~ **Resuelta:** `findPublicByCode` aplica la misma regla que el sitio (publicado y elegible, Task 2a).
5. **Dueño:** la eliminación del CTA y la pantalla de favoritos (spec §8.1) se confirman en el ensayo del 18; el plan las deja reversibles con `SHOW_WHATSAPP_CTA`.
6. **Archivo equivocado en la brief:** `components/products/ProductCard.tsx` es la tarjeta interna de `/productos` (muestra conteos), no la pública. Se deja sin cambios. La tarjeta pública es `CatalogGrid` y `ProductCard3D`, que pertenecen al ámbito de visual-3d según el reparto de agentes.
7. **Orden del catálogo:** se queda el actual (`createdAt` desc, `id` asc, en `getCatalogProducts`); sin tarea. El dueño lo confirma en el ensayo.
8. ~~¿Qué es "catálogo" y qué es "sitio web"?~~ **Resuelta (decisión 1):** sitio web = `/catalogo` y recorrido 3D (elegible y publicado); "Listo para catálogo" = estado interno de `/productos` (plan D).

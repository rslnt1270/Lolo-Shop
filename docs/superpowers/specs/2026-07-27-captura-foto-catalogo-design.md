# Captura de foto en alta de producto — inventario ↔ catálogo unificados

**Fecha:** 2026-07-27
**Estado:** Aprobado (diseño)

## Problema

El flujo **escanear → alta → catálogo** ya existe de punta a punta salvo por la imagen:

- `Product.imageUrl` existe en el esquema Prisma y en el tipo de dominio.
- `CreateProductData.imageUrl` ya es aceptado por la interfaz.
- `PrismaDataSource.createProduct` ya escribe `imageUrl`.
- El catálogo (`app/catalogo/page.tsx` → `ProductCard3D`) ya pinta `imageUrl` (con placeholder si falta).

Lo que falta es el eslabón que **captura, edita y sube** la imagen y coloca su URL pública en `Product.imageUrl`. Hoy el `NewProductForm` solo manda título/marca/SKU/precio.

## Objetivo

Al dar de alta un producto (tras escanear un código nuevo), permitir capturar una foto que se **edita automáticamente en el navegador** para mejorar calidad/consistencia visual, se **sube a Vercel Blob**, y su URL queda en `Product.imageUrl` — de modo que el producto aparece completo en el catálogo en el mismo acto de registro. La foto es **opcional** y puede agregarse después.

## Decisiones tomadas

- **Edición:** auto ligero 100% en el navegador (Canvas API). Sin IA ni servicios externos, sin costo, instantáneo.
- **Hosting:** Vercel Blob (nativo, URLs CDN públicas, capa gratis).
- **Fuente de la foto:** cámara **o** galería (`<input type="file" accept="image/*" capture="environment">`).
- **Obligatoriedad:** opcional en el alta; se puede agregar/cambiar después.

## Regla inviolable

El `InventoryDataSource` permanece **solo-datos**: guarda un `string` URL en `imageUrl`. La subida a Vercel Blob vive en la capa de **actions** (infraestructura), nunca dentro del data source. El data source no conoce Blob.

## Arquitectura

### 1. Pipeline de imagen (cliente, Canvas API)

Nuevo componente **`components/products/ProductPhotoCapture.tsx`**:

- Entrada vía `<input type="file" accept="image/*" capture="environment">` — en móvil ofrece cámara o galería sin UI de cámara propia.
- Al elegir foto, procesa en un `<canvas>` fuera de pantalla:
  1. **Recorte centrado 1:1** (uniformidad del catálogo).
  2. **Redimensiona** a máx. 1080×1080.
  3. **Auto-niveles**: estiramiento de histograma de luminancia (auto-brillo/contraste suave).
  4. **Exporta JPEG** calidad ~0.8 → `Blob` de ~150–300 KB.
- Muestra preview con botones **"Retomar"** y **"Quitar"**.
- Expone el `Blob` procesado al formulario contenedor.

Lógica pura y testeable aislada en **`lib/image/process.ts`**:

- `computeSquareCrop(width, height): { sx, sy, size }` — rectángulo de recorte centrado.
- `autoLevels(data: Uint8ClampedArray): void` — estiramiento de histograma sobre píxeles RGBA.

Estas funciones no dependen del DOM/canvas real y se prueban con arreglos de píxeles pequeños. El componente las usa sobre el `ImageData` del canvas.

### 2. Subida y almacenamiento (Vercel Blob, server-side)

- El formulario de alta envía **FormData** (campos del producto + el `Blob` ya editado) a la server action.
- La action llama a `put()` de `@vercel/blob` **en el servidor**; el token `BLOB_READ_WRITE_TOKEN` nunca llega al cliente. La imagen ya viene comprimida (cientos de KB), sin problemas de tamaño de body.
- La action obtiene la URL pública CDN y la pasa como `imageUrl` a `createProduct` (o a `updateProductImage`).
- Se consultará la API vigente de Vercel Blob (skill `vercel:vercel-storage`) al implementar.

**Variable de entorno nueva:** `BLOB_READ_WRITE_TOKEN` — crear el Blob store y añadirla en `.env` local (gitignored) y en Vercel (Production/Preview). Documentar en `.env.example`.

### 3. "Agregar foto después"

Como la foto es opcional, en la vista **`/productos`** cada producto muestra:
- **"Agregar foto"** si `imageUrl` es null.
- **"Cambiar foto"** si ya tiene.

Ambos abren el **mismo** `ProductPhotoCapture` y llaman a `updateProductImageAction(productId, blob)`. Un solo componente reutilizado en alta y en gestión.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `components/products/ProductPhotoCapture.tsx` | **Nuevo** — captura + edición + preview; expone `Blob`. |
| `lib/image/process.ts` | **Nuevo** — `computeSquareCrop`, `autoLevels` (puras, testeables). |
| `components/products/NewProductForm.tsx` | Integra el capture; submit vía FormData con la imagen. |
| `lib/actions.ts` | `createProductAction` sube a Blob antes de crear; **+ `updateProductImageAction`**. |
| `lib/data/source.ts` | **+ `updateProductImage(productId, imageUrl)`** en la interfaz. |
| `lib/data/prisma-source.ts` | Implementa `updateProductImage`. |
| `lib/data/fixture-source.ts` | Implementa `updateProductImage`. |
| `app/productos/page.tsx` (y componente de tarjeta de gestión) | Botón "Agregar/Cambiar foto". |
| `.env.example` | Documentar `BLOB_READ_WRITE_TOKEN`. |

**Sin cambios de esquema Prisma** (`imageUrl` ya existe).

## Flujo de datos

```
Captura (cámara/galería)
  → ProductPhotoCapture: recorte 1:1 + resize + autoLevels + export JPEG (cliente)
    → FormData(product fields + blob)
      → server action: put() en Vercel Blob → URL pública (server-side, token secreto)
        → createProduct/updateProductImage(imageUrl)  [InventoryDataSource]
          → Product.imageUrl en Postgres
            → catálogo renderiza la imagen
```

## Manejo de errores

- **Foto omitida:** alta procede con `imageUrl = null`; catálogo usa placeholder existente.
- **Fallo de subida a Blob:** la action lanza error; el form muestra mensaje y **no** crea el producto a medias (subir primero, crear después; si la subida falla, no se crea). Para `updateProductImage`, si la subida falla no se toca la BD.
- **Archivo inválido / no imagen:** el capture valida el tipo y muestra error sin romper el flujo.
- **Token ausente en runtime:** la action falla con mensaje claro (mismo patrón que `BOT_API_KEY`).

## Pruebas (Vitest, TDD)

- `lib/image/process.ts`:
  - `computeSquareCrop` con dimensiones landscape/portrait/cuadrado → rectángulo centrado correcto.
  - `autoLevels` sobre arreglos de píxeles pequeños → estira el rango esperado; no rompe con imagen ya plana.
- `lib/actions.ts` (mock de `@vercel/blob` `put`):
  - `createProductAction` con imagen → `imageUrl` (URL mockeada) fluye a `createProduct`.
  - `createProductAction` sin imagen → `imageUrl` null.
  - `updateProductImageAction` → sube y llama a `updateProductImage`.
- `lib/data/fixture-source.ts`:
  - `updateProductImage` actualiza el `imageUrl` del producto correcto.

## Fuera de alcance (YAGNI)

- Quitar fondo / edición con IA.
- Editor manual (recorte/rotación a mano).
- Múltiples imágenes por producto (galería) — hoy un `imageUrl` por producto.
- Subida directa cliente→Blob con token efímero (se puede migrar después si el volumen lo pide; por ahora vía server action es más simple y seguro).

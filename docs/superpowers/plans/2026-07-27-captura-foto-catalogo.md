# Captura de foto en alta de producto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar una foto al dar de alta un producto, editarla automáticamente en el navegador (recorte 1:1, resize, auto-niveles), subirla a Vercel Blob y guardar su URL en `Product.imageUrl`, de modo que el producto aparezca completo en el catálogo — foto opcional y también agregable después.

**Architecture:** La edición ocurre 100% en el cliente con Canvas API; la matemática pura vive en `lib/image/process.ts` (testeable sin DOM). La subida a Vercel Blob vive en `lib/image/upload.ts` (server, mockeable) y se invoca desde server actions thin. El `InventoryDataSource` solo guarda el `string` URL — nunca conoce Blob. El esquema Prisma no cambia (`imageUrl` ya existe).

**Tech Stack:** Next.js App Router (server actions), TypeScript, `@vercel/blob`, Canvas API, Prisma/Postgres, Vitest + jsdom.

## Global Constraints

- Repo **PÚBLICO** — **PROHIBIDO** commitear secretos. `BLOB_READ_WRITE_TOKEN` solo en `.env` (gitignored) y en Vercel; en el repo solo se documenta en `.env.example`.
- **Regla inviolable:** toda la lógica de datos pasa por la interfaz `InventoryDataSource`. La subida a Blob NO va dentro del data source.
- Commits: Conventional Commits.
- Tests: Vitest, archivos en carpetas `__tests__/` junto al código, alias `@` → raíz del repo. Correr con `npm test`.
- Sin cambios de esquema Prisma (`Product.imageUrl` ya existe).
- Verificación de UI (componentes sin unit test): `npm run build` debe pasar.

---

### Task 1: Funciones puras de procesamiento de imagen

**Files:**
- Create: `lib/image/process.ts`
- Test: `lib/image/__tests__/process.test.ts`

**Interfaces:**
- Consumes: nada (base).
- Produces:
  - `computeSquareCrop(width: number, height: number): { sx: number; sy: number; size: number }`
  - `autoLevels(data: Uint8ClampedArray): void` — muta el arreglo RGBA in-place.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/image/__tests__/process.test.ts
import { describe, it, expect } from "vitest";
import { computeSquareCrop, autoLevels } from "@/lib/image/process";

describe("computeSquareCrop", () => {
  it("recorta al centro en landscape (más ancho que alto)", () => {
    expect(computeSquareCrop(200, 100)).toEqual({ sx: 50, sy: 0, size: 100 });
  });
  it("recorta al centro en portrait (más alto que ancho)", () => {
    expect(computeSquareCrop(100, 200)).toEqual({ sx: 0, sy: 50, size: 100 });
  });
  it("no recorta cuando ya es cuadrado", () => {
    expect(computeSquareCrop(100, 100)).toEqual({ sx: 0, sy: 0, size: 100 });
  });
});

describe("autoLevels", () => {
  it("estira el rango de luminancia a 0..255", () => {
    // dos píxeles gris: luminancia 50 y 150
    const data = new Uint8ClampedArray([50, 50, 50, 255, 150, 150, 150, 255]);
    autoLevels(data);
    expect(Array.from(data)).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });
  it("no altera una imagen plana (rango cero)", () => {
    const data = new Uint8ClampedArray([120, 120, 120, 255]);
    autoLevels(data);
    expect(Array.from(data)).toEqual([120, 120, 120, 255]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- process`
Expected: FAIL — "Failed to resolve import '@/lib/image/process'".

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/image/process.ts

/** Rectángulo de recorte centrado 1:1 para dimensiones dadas. */
export function computeSquareCrop(
  width: number,
  height: number
): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height);
  return {
    sx: Math.floor((width - size) / 2),
    sy: Math.floor((height - size) / 2),
    size,
  };
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Auto-brillo/contraste: estira el histograma de luminancia de modo que
 * la luminancia mínima mapee a 0 y la máxima a 255. Muta `data` (RGBA) in-place.
 */
export function autoLevels(data: Uint8ClampedArray): void {
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  if (max - min < 1) return; // imagen plana: nada que estirar
  const scale = 255 / (max - min);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp((data[i] - min) * scale);
    data[i + 1] = clamp((data[i + 1] - min) * scale);
    data[i + 2] = clamp((data[i + 2] - min) * scale);
    // alfa (i+3) sin tocar
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- process`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/image/process.ts lib/image/__tests__/process.test.ts
git commit -m "feat(image): funciones puras de recorte 1:1 y auto-niveles"
```

---

### Task 2: Helper de subida a Vercel Blob

**Files:**
- Create: `lib/image/upload.ts`
- Test: `lib/image/__tests__/upload.test.ts`
- Modify: `package.json` (dependencia `@vercel/blob`)
- Modify: `.env.example` (documentar `BLOB_READ_WRITE_TOKEN`)

**Interfaces:**
- Consumes: nada.
- Produces: `uploadImage(file: File): Promise<string>` — sube a Blob y devuelve la URL pública.

- [ ] **Step 1: Instalar la dependencia**

Run: `npm install @vercel/blob`
Expected: `@vercel/blob` aparece en `package.json` → `dependencies`.

- [ ] **Step 2: Documentar el env en `.env.example`**

Añadir al final de `.env.example`:

```
# Vercel Blob — hosting de imágenes de producto (crear store en Vercel)
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_xxx"
```

- [ ] **Step 3: Write the failing test**

```typescript
// lib/image/__tests__/upload.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const putMock = vi.fn();
vi.mock("@vercel/blob", () => ({ put: putMock }));

import { uploadImage } from "@/lib/image/upload";

describe("uploadImage", () => {
  beforeEach(() => {
    putMock.mockReset();
    putMock.mockResolvedValue({ url: "https://blob.example/productos/abc.jpg" });
  });

  it("sube el archivo como público y devuelve la URL", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "photo.jpg", { type: "image/jpeg" });
    const url = await uploadImage(file);

    expect(url).toBe("https://blob.example/productos/abc.jpg");
    expect(putMock).toHaveBeenCalledOnce();
    const [name, body, opts] = putMock.mock.calls[0];
    expect(name).toMatch(/^productos\//);
    expect(body).toBe(file);
    expect(opts).toMatchObject({ access: "public" });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- upload`
Expected: FAIL — "Failed to resolve import '@/lib/image/upload'".

- [ ] **Step 5: Write minimal implementation**

```typescript
// lib/image/upload.ts
import { put } from "@vercel/blob";

/**
 * Sube una imagen de producto a Vercel Blob y devuelve su URL pública CDN.
 * El token BLOB_READ_WRITE_TOKEN se lee del entorno server-side (nunca en cliente).
 */
export async function uploadImage(file: File): Promise<string> {
  const ext = file.type === "image/png" ? "png" : "jpg";
  const name = `productos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await put(name, file, {
    access: "public",
    addRandomSuffix: false,
    contentType: file.type,
  });
  return blob.url;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- upload`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/image/upload.ts lib/image/__tests__/upload.test.ts package.json package-lock.json .env.example
git commit -m "feat(image): helper uploadImage con Vercel Blob"
```

---

### Task 3: `updateProductImage` en la capa de datos

**Files:**
- Modify: `lib/data/source.ts` (interfaz)
- Modify: `lib/data/fixture-source.ts`
- Modify: `lib/data/prisma-source.ts`
- Test: `lib/data/__tests__/fixture-source.test.ts` (añadir casos)

**Interfaces:**
- Consumes: `InventoryDataSource`, `Product` (existentes).
- Produces: `InventoryDataSource.updateProductImage(productId: string, imageUrl: string): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Añadir a `lib/data/__tests__/fixture-source.test.ts` (dentro del `describe` existente o uno nuevo). Primero crea un producto para tener un `productId` real:

```typescript
import { describe, it, expect } from "vitest";
import { FixtureDataSource } from "@/lib/data/fixture-source";

describe("FixtureDataSource.updateProductImage", () => {
  it("actualiza el imageUrl del producto indicado", async () => {
    const ds = new FixtureDataSource();
    const { product } = await ds.createProduct({
      barcode: "TEST-IMG-001",
      title: "Producto Test Imagen",
      brand: "TestBrand",
      price: 100,
      locationId: "loc-1",
    });

    await ds.updateProductImage(product.id, "https://blob.example/x.jpg");

    const all = await ds.getProducts();
    const updated = all.find((p) => p.id === product.id);
    expect(updated?.imageUrl).toBe("https://blob.example/x.jpg");
  });

  it("lanza si el producto no existe", async () => {
    const ds = new FixtureDataSource();
    await expect(
      ds.updateProductImage("no-existe", "https://blob.example/x.jpg")
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fixture-source`
Expected: FAIL — `ds.updateProductImage is not a function`.

- [ ] **Step 3: Añadir el método a la interfaz**

En `lib/data/source.ts`, dentro de `interface InventoryDataSource`, añadir tras `createProduct`:

```typescript
  updateProductImage(productId: string, imageUrl: string): Promise<void>;
```

- [ ] **Step 4: Implementar en FixtureDataSource**

En `lib/data/fixture-source.ts`, añadir método a la clase (usa el `fixtureProducts` importado):

```typescript
  async updateProductImage(productId: string, imageUrl: string): Promise<void> {
    const product = fixtureProducts.find((p) => p.id === productId);
    if (!product) throw new Error("Producto no encontrado");
    product.imageUrl = imageUrl;
  }
```

- [ ] **Step 5: Implementar en PrismaDataSource**

En `lib/data/prisma-source.ts`, añadir método a la clase:

```typescript
  async updateProductImage(productId: string, imageUrl: string): Promise<void> {
    await prisma.product.update({
      where: { id: productId },
      data: { imageUrl },
    });
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- fixture-source`
Expected: PASS. Luego `npm test` completo → todo verde.

- [ ] **Step 7: Commit**

```bash
git add lib/data/source.ts lib/data/fixture-source.ts lib/data/prisma-source.ts lib/data/__tests__/fixture-source.test.ts
git commit -m "feat(data): updateProductImage en InventoryDataSource (fixture + prisma)"
```

---

### Task 4: Server actions de imagen

**Files:**
- Modify: `lib/actions.ts`

**Interfaces:**
- Consumes: `uploadImage` (Task 2), `getDataSource().updateProductImage` (Task 3), `requireSession` (existente en el archivo), `revalidatePath` (ya importado).
- Produces:
  - `uploadProductImageAction(formData: FormData): Promise<string>` — sube la imagen `formData.get("image")` y devuelve la URL.
  - `updateProductImageAction(productId: string, formData: FormData): Promise<void>` — sube y persiste en el producto.

- [ ] **Step 1: Implementar las actions**

En `lib/actions.ts`, añadir el import al inicio (junto a los demás):

```typescript
import { uploadImage } from "./image/upload";
```

Y al final del archivo, añadir:

```typescript
export async function uploadProductImageAction(formData: FormData): Promise<string> {
  await requireSession();
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("No se recibió una imagen válida.");
  }
  return await uploadImage(file);
}

export async function updateProductImageAction(
  productId: string,
  formData: FormData
): Promise<void> {
  await requireSession();
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("No se recibió una imagen válida.");
  }
  const url = await uploadImage(file);
  await getDataSource().updateProductImage(productId, url);
  revalidatePath("/catalogo");
  revalidatePath("/productos");
}
```

- [ ] **Step 2: Verificar tipos y build**

Run: `npm run build`
Expected: compila sin errores de tipos. (Las actions thin no llevan unit test; su lógica de subida ya está cubierta por `uploadImage` en Task 2.)

- [ ] **Step 3: Commit**

```bash
git add lib/actions.ts
git commit -m "feat(actions): uploadProductImageAction y updateProductImageAction"
```

---

### Task 5: Componente `ProductPhotoCapture`

**Files:**
- Create: `components/products/ProductPhotoCapture.tsx`

**Interfaces:**
- Consumes: `computeSquareCrop`, `autoLevels` (Task 1).
- Produces: componente React cliente

```typescript
interface ProductPhotoCaptureProps {
  onCapture: (file: File) => void; // File JPEG ya editado (1:1, ~1080px)
  onClear: () => void;
}
```

- [ ] **Step 1: Crear el componente**

```tsx
// components/products/ProductPhotoCapture.tsx
"use client";
import { useRef, useState } from "react";
import { computeSquareCrop, autoLevels } from "@/lib/image/process";

const MAX_SIZE = 1080;

interface ProductPhotoCaptureProps {
  onCapture: (file: File) => void;
  onClear: () => void;
}

export function ProductPhotoCapture({ onCapture, onClear }: ProductPhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const process = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const bitmap = await createImageBitmap(file);
      const { sx, sy, size } = computeSquareCrop(bitmap.width, bitmap.height);
      const out = Math.min(size, MAX_SIZE);

      const canvas = document.createElement("canvas");
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas no disponible");
      ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, out, out);

      const imageData = ctx.getImageData(0, 0, out, out);
      autoLevels(imageData.data);
      ctx.putImageData(imageData, 0, 0);

      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob falló"))),
          "image/jpeg",
          0.8
        )
      );
      const edited = new File([blob], "producto.jpg", { type: "image/jpeg" });

      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(edited));
      onCapture(edited);
    } catch {
      setError("No se pudo procesar la imagen. Intenta con otra foto.");
    } finally {
      setBusy(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("El archivo debe ser una imagen.");
      return;
    }
    void process(file);
  };

  const clear = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
    onClear();
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="hidden"
        id="product-photo-input"
      />
      {preview ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Vista previa" className="w-32 h-32 rounded-lg object-cover border" />
          <div className="flex gap-3 text-sm">
            <button type="button" onClick={() => inputRef.current?.click()} className="text-loloteal">
              Retomar
            </button>
            <button type="button" onClick={clear} className="text-gray-500">
              Quitar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full rounded-md border border-dashed border-gray-300 py-3 text-sm text-gray-600 hover:border-loloteal disabled:opacity-50"
        >
          {busy ? "Procesando…" : "📷 Tomar o subir foto"}
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: compila sin errores. (Componente con Canvas/`createImageBitmap` no se unit-testea en jsdom; se valida en build + prueba manual en Task 8.)

- [ ] **Step 3: Commit**

```bash
git add components/products/ProductPhotoCapture.tsx
git commit -m "feat(ui): ProductPhotoCapture con edición en navegador (crop 1:1 + auto-niveles)"
```

---

### Task 6: Integrar foto en el alta (`NewProductForm`)

**Files:**
- Modify: `components/products/NewProductForm.tsx`

**Interfaces:**
- Consumes: `ProductPhotoCapture` (Task 5), `uploadProductImageAction` (Task 4), `createProductAction` (existente, ya acepta `imageUrl?`).
- Produces: nada nuevo (integración de UI).

- [ ] **Step 1: Añadir estado de imagen y el capture**

En `components/products/NewProductForm.tsx`:

1. Añadir imports:

```typescript
import { createProductAction, uploadProductImageAction } from "@/lib/actions";
import { ProductPhotoCapture } from "./ProductPhotoCapture";
```
(reemplaza el import existente de `createProductAction`.)

2. Añadir estado dentro del componente, junto a los `useState` existentes:

```typescript
  const [photo, setPhoto] = useState<File | null>(null);
```

3. Insertar el capture en el JSX, justo antes del bloque de botones (`<div className="flex flex-col gap-2 pt-2">`):

```tsx
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Foto del producto <span className="text-gray-400">(opcional)</span>
          </label>
          <ProductPhotoCapture onCapture={setPhoto} onClear={() => setPhoto(null)} />
        </div>
```

- [ ] **Step 2: Subir la foto antes de crear el producto**

Reemplazar el cuerpo del `try` en `handleSubmit` por:

```typescript
    try {
      let imageUrl: string | undefined;
      if (photo) {
        const fd = new FormData();
        fd.append("image", photo);
        imageUrl = await uploadProductImageAction(fd);
      }

      await createProductAction({
        barcode: scannedCode,
        title: formData.title,
        brand: formData.brand,
        price: parseFloat(formData.price),
        sku: formData.sku,
        locationId,
        imageUrl,
      });

      onSuccess("Producto dado de alta exitosamente.");
    } catch (err) {
      console.error(err);
      setError("No se pudo dar de alta el producto. Revisa los datos e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: compila sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/products/NewProductForm.tsx
git commit -m "feat(ui): capturar y subir foto al dar de alta un producto"
```

---

### Task 7: Agregar/cambiar foto en `/productos`

**Files:**
- Create: `components/products/ProductPhotoButton.tsx`
- Modify: `app/productos/page.tsx`

**Interfaces:**
- Consumes: `ProductPhotoCapture` (Task 5), `updateProductImageAction` (Task 4).
- Produces: componente `ProductPhotoButton` con props `{ productId: string; hasImage: boolean; onUpdated?: () => void }`.

- [ ] **Step 1: Crear el botón de foto**

```tsx
// components/products/ProductPhotoButton.tsx
"use client";
import { useState } from "react";
import { ProductPhotoCapture } from "./ProductPhotoCapture";
import { updateProductImageAction } from "@/lib/actions";

interface ProductPhotoButtonProps {
  productId: string;
  hasImage: boolean;
  onUpdated?: () => void;
}

export function ProductPhotoButton({ productId, hasImage, onUpdated }: ProductPhotoButtonProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const save = async (file: File) => {
    setSaving(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("image", file);
      await updateProductImageAction(productId, fd);
      setMsg("Foto actualizada.");
      setOpen(false);
      onUpdated?.();
    } catch {
      setMsg("No se pudo guardar la foto.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-loloteal hover:underline"
      >
        {hasImage ? "Cambiar foto" : "Agregar foto"}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <ProductPhotoCapture onCapture={save} onClear={() => {}} />
      {saving && <p className="text-sm text-gray-500">Guardando…</p>}
      {msg && <p className="text-sm text-gray-600">{msg}</p>}
      <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-500">
        Cerrar
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Renderizar el botón bajo cada producto**

En `app/productos/page.tsx`:

1. Añadir import:

```typescript
import { ProductPhotoButton } from "@/components/products/ProductPhotoButton";
```

2. Reemplazar el map de productos por una versión que envuelva la tarjeta y el botón, y que refresque tras actualizar:

```tsx
        {visible.map((p) => (
          <div key={p.id} className="space-y-1">
            <ProductCard product={p} />
            <ProductPhotoButton
              productId={p.id}
              hasImage={!!p.imageUrl}
              onUpdated={() => fetchProductsAction().then(setProducts)}
            />
          </div>
        ))}
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: compila sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/products/ProductPhotoButton.tsx app/productos/page.tsx
git commit -m "feat(ui): agregar/cambiar foto de producto desde /productos"
```

---

### Task 8: Verificación end-to-end y configuración de Blob

**Files:** ninguno (configuración + prueba manual).

- [ ] **Step 1: Crear el Blob store y token**

En el dashboard de Vercel (o `vercel` CLI): crear un Blob store para el proyecto `lolo-shop`. Copiar `BLOB_READ_WRITE_TOKEN`.

- [ ] **Step 2: Configurar el env**

- Local: añadir `BLOB_READ_WRITE_TOKEN="..."` a `.env` (gitignored — NO commitear).
- Vercel: `vercel env add BLOB_READ_WRITE_TOKEN` para Production y Preview (o vía dashboard). *(Si el Blob store se crea desde el dashboard del proyecto, Vercel suele inyectar el token automáticamente — verificar con `vercel env ls`.)*

- [ ] **Step 3: Suite completa verde**

Run: `npm test`
Expected: todos los tests pasan (incluye los nuevos de `process`, `upload`, `fixture-source`).

Run: `npm run build`
Expected: build de producción OK.

- [ ] **Step 4: Prueba manual del flujo**

Run: `npm run dev`
1. Login como colaborador → `/escanear`.
2. Escanear/introducir un código nuevo → aparece `NewProductForm`.
3. Tomar/subir una foto → ver preview cuadrada → dar de alta.
4. Ir a `/catalogo` → el producto aparece con la imagen.
5. En `/productos`, elegir un producto sin foto → "Agregar foto" → confirmar → aparece en catálogo.

- [ ] **Step 5: Marcar el spec y notas de proyecto**

Actualizar `docs/superpowers/specs/2026-07-27-captura-foto-catalogo-design.md` con una nota de estado "Implementado (YYYY-MM-DD)" al final.

```bash
git add docs/superpowers/specs/2026-07-27-captura-foto-catalogo-design.md
git commit -m "docs: marcar captura de foto como implementada"
```

---

## Notas de verificación por tarea

- Tasks 1–3: cubiertas por unit tests (Vitest).
- Tasks 4–7: capa thin de actions + UI con Canvas; se verifican con `npm run build` y la prueba manual de Task 8 (jsdom no implementa canvas/`createImageBitmap`).
- Task 8: configuración de infraestructura (Blob) + validación end-to-end.

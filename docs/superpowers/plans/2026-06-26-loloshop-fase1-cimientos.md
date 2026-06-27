# LoloShop Fase 1 — Cimientos + Inventario (lectura) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir una PWA instalable con login por roles que muestra productos y stock por tienda, construida sobre una capa de datos con fixtures que se prueba sin token de Shopify.

**Architecture:** Next.js 14 (App Router) + TypeScript. Toda la lógica de inventario depende de la interfaz `InventoryDataSource`. En Fase 1 esa interfaz la implementa `FixtureDataSource` (datos en memoria). En Fase 2+ se implementa `ShopifyDataSource` detrás de la misma interfaz, sin tocar UI ni servicios. Lógica pura (SKU, agregaciones de stock) separada de React para testear sin DOM.

**Tech Stack:** Next.js 14, TypeScript, Vitest, React Testing Library, NextAuth.js, next-pwa, Tailwind CSS.

## Global Constraints

- Node.js >= 18.18 (requisito de Next.js 14).
- TypeScript en modo `strict`.
- Toda lógica de inventario consume la interfaz `InventoryDataSource` — nunca llama a Shopify directamente.
- Roles válidos exactos: `owner`, `manager`, `collaborator`.
- Tiendas (locations) identificadas por id string: `loc-1` (Tienda 1), `loc-2` (Tienda 2) en fixtures.
- Categorías iniciales exactas: `Playeras`, `Pantalones`, `Hoodies`, `Tenis`, `Accesorios`, `Perfumes`, `Raquetas de Padel`.
- Formato SKU: `LS-{CAT}-{MARCA}-{TALLA}-{COLOR}` (ver Task 3 para reglas exactas).
- Idioma de la UI: español.
- Commits en español, prefijo convencional (`feat:`, `test:`, `chore:`).

---

### Task 1: Scaffold del proyecto Next.js + testing

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`, `.gitignore`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `tailwind.config.ts`, `postcss.config.mjs`
- Test: `lib/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: proyecto compilable, comando `npm test` funcional con Vitest.

- [ ] **Step 1: Crear package.json**

```json
{
  "name": "loloshop",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.4.6",
    "@testing-library/react": "16.0.0",
    "@types/node": "20.14.9",
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "@vitejs/plugin-react": "4.3.1",
    "autoprefixer": "10.4.19",
    "jsdom": "24.1.0",
    "postcss": "8.4.39",
    "tailwindcss": "3.4.4",
    "typescript": "5.5.3",
    "vitest": "1.6.0"
  }
}
```

- [ ] **Step 2: Crear tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Crear archivos de configuración**

`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

`tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { loloteal: "#3CBFBF" },
    },
  },
  plugins: [],
};
export default config;
```

`postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

`vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

`.gitignore`:
```
node_modules
.next
.env*.local
coverage
*.log
```

- [ ] **Step 4: Crear app base**

`app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`app/layout.tsx`:
```tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LoloShop",
  description: "Gestión de inventario LoloShop",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
```

`app/page.tsx`:
```tsx
export default function Page() {
  return <main className="p-6 text-xl">LoloShop</main>;
}
```

- [ ] **Step 5: Escribir test de humo**

`lib/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("entorno de pruebas", () => {
  it("ejecuta Vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Instalar y correr**

Run: `npm install && npm test`
Expected: PASS, 1 test pasa ("ejecuta Vitest").

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold de proyecto Next.js con Vitest y Tailwind"
```

---

### Task 2: Configuración PWA (instalable)

**Files:**
- Create: `public/manifest.json`, `public/icons/icon-192.png`, `public/icons/icon-512.png`
- Modify: `app/layout.tsx`, `next.config.mjs`, `package.json`
- Test: `public/__tests__/manifest.test.ts`

**Interfaces:**
- Consumes: app base de Task 1.
- Produces: app instalable como PWA (manifest válido + service worker via next-pwa).

- [ ] **Step 1: Escribir test del manifest**

`public/__tests__/manifest.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import manifest from "../manifest.json";

describe("manifest PWA", () => {
  it("tiene los campos requeridos para ser instalable", () => {
    expect(manifest.name).toBe("LoloShop");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    expect(manifest.icons.some((i) => i.sizes === "512x512")).toBe(true);
  });
});
```

- [ ] **Step 2: Correr test (falla)**

Run: `npx vitest run public/__tests__/manifest.test.ts`
Expected: FAIL — `Cannot find module '../manifest.json'`.

- [ ] **Step 3: Crear manifest.json**

`public/manifest.json`:
```json
{
  "name": "LoloShop",
  "short_name": "LoloShop",
  "description": "Gestión de inventario LoloShop",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3CBFBF",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 4: Correr test (pasa)**

Run: `npx vitest run public/__tests__/manifest.test.ts`
Expected: PASS.

- [ ] **Step 5: Generar iconos placeholder**

Run:
```bash
mkdir -p public/icons
# Genera dos PNG sólidos color teal como placeholder (reemplazar con logo real luego)
node -e "const fs=require('fs');const png=(s)=>{const {PNG}=require('pngjs');};" 2>/dev/null || true
```
Si `pngjs` no está disponible, crear los iconos copiando cualquier PNG temporal:
```bash
printf '\x89PNG\r\n\x1a\n' > /dev/null
```
Nota para el implementador: coloca aquí `icon-192.png` y `icon-512.png` con el logo de LoloShop (la imagen de la carita con pulgares). Por ahora cualquier PNG cuadrado de esas dimensiones sirve para que la PWA instale.

- [ ] **Step 6: Configurar next-pwa**

Run: `npm install next-pwa`

`next.config.mjs`:
```js
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {};
export default withPWA(nextConfig);
```

Agregar a `.gitignore`:
```
public/sw.js
public/workbox-*.js
```

- [ ] **Step 7: Enlazar manifest en layout**

En `app/layout.tsx`, agregar al objeto `metadata`:
```tsx
export const metadata: Metadata = {
  title: "LoloShop",
  description: "Gestión de inventario LoloShop",
  manifest: "/manifest.json",
  themeColor: "#3CBFBF",
};
```

- [ ] **Step 8: Verificar build**

Run: `npm run build`
Expected: build exitoso, genera `public/sw.js`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: configurar PWA instalable con manifest y service worker"
```

---

### Task 3: Tipos de dominio + generador de SKU

**Files:**
- Create: `lib/domain/types.ts`, `lib/domain/sku.ts`
- Test: `lib/domain/__tests__/sku.test.ts`

**Interfaces:**
- Consumes: nada del dominio aún.
- Produces:
  - Tipos: `Role`, `Location`, `InventoryLevel`, `Variant`, `Product`.
  - `generateSku(input: SkuInput): string` donde
    `SkuInput = { category: string; brand: string; size: string; color: string }`.

- [ ] **Step 1: Definir tipos de dominio**

`lib/domain/types.ts`:
```ts
export type Role = "owner" | "manager" | "collaborator";

export interface Location {
  id: string;
  name: string;
}

export interface InventoryLevel {
  locationId: string;
  available: number;
}

export interface Variant {
  id: string;
  sku: string;
  title: string; // "M / Negro"
  size: string;
  color: string;
  price: number;
  barcode: string | null;
  inventory: InventoryLevel[];
}

export interface Product {
  id: string;
  title: string;
  category: string;
  brand: string;
  imageUrl: string | null;
  variants: Variant[];
}
```

- [ ] **Step 2: Escribir tests del generador de SKU**

`lib/domain/__tests__/sku.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { generateSku } from "../sku";

describe("generateSku", () => {
  it("genera SKU con prefijo LS y tres primeras letras en mayúscula", () => {
    expect(
      generateSku({ category: "Playeras", brand: "Guess", size: "M", color: "Blanco" })
    ).toBe("LS-PLA-GUE-M-BLA");
  });

  it("normaliza acentos a letras ASCII", () => {
    expect(
      generateSku({ category: "Pantalones", brand: "Adídas", size: "L", color: "Café" })
    ).toBe("LS-PAN-ADI-L-CAF");
  });

  it("ignora espacios al tomar las iniciales", () => {
    expect(
      generateSku({ category: "Raquetas de Padel", brand: "Head", size: "Única", color: "Negro" })
    ).toBe("LS-RAQ-HEA-UNI-NEG");
  });

  it("rellena con X cuando el texto es más corto que 3", () => {
    expect(
      generateSku({ category: "Tenis", brand: "K", size: "8", color: "Az" })
    ).toBe("LS-TEN-KXX-8-AZX");
  });

  it("convierte todo a mayúsculas", () => {
    expect(
      generateSku({ category: "hoodies", brand: "ny", size: "xl", color: "rojo" })
    ).toBe("LS-HOO-NYX-XL-ROJ");
  });
});
```

- [ ] **Step 3: Correr tests (fallan)**

Run: `npx vitest run lib/domain/__tests__/sku.test.ts`
Expected: FAIL — `Cannot find module '../sku'`.

- [ ] **Step 4: Implementar generador de SKU**

`lib/domain/sku.ts`:
```ts
export interface SkuInput {
  category: string;
  brand: string;
  size: string;
  color: string;
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Toma las primeras `len` letras/dígitos (sin espacios), en mayúsculas,
 *  rellenando con "X" si faltan caracteres. */
function code(value: string, len: number): string {
  const clean = stripAccents(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.padEnd(len, "X").slice(0, len);
}

export function generateSku(input: SkuInput): string {
  const cat = code(input.category, 3);
  const brand = code(input.brand, 3);
  const size = code(input.size, input.size.trim().length >= 3 ? 3 : input.size.trim().length || 1);
  const color = code(input.color, 3);
  return `LS-${cat}-${brand}-${size}-${color}`;
}
```

Nota: la talla conserva su longitud natural (p.ej. `M`, `XL`, `8`, `UNI`) hasta 3 caracteres; las demás partes siempre son 3.

- [ ] **Step 5: Correr tests (pasan)**

Run: `npx vitest run lib/domain/__tests__/sku.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/domain
git commit -m "feat: tipos de dominio y generador de SKU automático"
```

---

### Task 4: Interfaz de datos + implementación con fixtures

**Files:**
- Create: `lib/data/source.ts`, `lib/data/fixtures.ts`, `lib/data/fixture-source.ts`
- Test: `lib/data/__tests__/fixture-source.test.ts`

**Interfaces:**
- Consumes: tipos de Task 3 (`Product`, `Variant`, `Location`).
- Produces:
  - `interface InventoryDataSource` con métodos:
    - `getLocations(): Promise<Location[]>`
    - `getProducts(): Promise<Product[]>`
    - `getProductByVariantId(variantId: string): Promise<VariantMatch | null>`
    - donde `VariantMatch = { product: Product; variant: Variant }`.
  - `FixtureDataSource` (implementa la interfaz, datos en memoria).
  - `fixtureLocations: Location[]`, `fixtureProducts: Product[]`.

- [ ] **Step 1: Definir la interfaz**

`lib/data/source.ts`:
```ts
import type { Location, Product, Variant } from "@/lib/domain/types";

export interface VariantMatch {
  product: Product;
  variant: Variant;
}

export interface InventoryDataSource {
  getLocations(): Promise<Location[]>;
  getProducts(): Promise<Product[]>;
  getProductByVariantId(variantId: string): Promise<VariantMatch | null>;
}
```

- [ ] **Step 2: Crear fixtures**

`lib/data/fixtures.ts`:
```ts
import type { Location, Product } from "@/lib/domain/types";

export const fixtureLocations: Location[] = [
  { id: "loc-1", name: "Tienda 1" },
  { id: "loc-2", name: "Tienda 2" },
];

export const fixtureProducts: Product[] = [
  {
    id: "prod-1",
    title: "Hoodie NY Yankees",
    category: "Hoodies",
    brand: "NY Yankees",
    imageUrl: null,
    variants: [
      {
        id: "var-1",
        sku: "LS-HOO-NYY-M-NEG",
        title: "M / Negro",
        size: "M",
        color: "Negro",
        price: 450,
        barcode: null,
        inventory: [
          { locationId: "loc-1", available: 3 },
          { locationId: "loc-2", available: 5 },
        ],
      },
      {
        id: "var-2",
        sku: "LS-HOO-NYY-L-NEG",
        title: "L / Negro",
        size: "L",
        color: "Negro",
        price: 450,
        barcode: null,
        inventory: [
          { locationId: "loc-1", available: 1 },
          { locationId: "loc-2", available: 0 },
        ],
      },
    ],
  },
  {
    id: "prod-2",
    title: "Playera Guess",
    category: "Playeras",
    brand: "Guess",
    imageUrl: null,
    variants: [
      {
        id: "var-3",
        sku: "LS-PLA-GUE-M-BLA",
        title: "M / Blanco",
        size: "M",
        color: "Blanco",
        price: 320,
        barcode: "7501234567890",
        inventory: [
          { locationId: "loc-1", available: 8 },
          { locationId: "loc-2", available: 2 },
        ],
      },
    ],
  },
];
```

- [ ] **Step 3: Escribir tests de FixtureDataSource**

`lib/data/__tests__/fixture-source.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { FixtureDataSource } from "../fixture-source";

describe("FixtureDataSource", () => {
  const ds = new FixtureDataSource();

  it("devuelve las dos tiendas", async () => {
    const locs = await ds.getLocations();
    expect(locs.map((l) => l.id)).toEqual(["loc-1", "loc-2"]);
  });

  it("devuelve todos los productos", async () => {
    const products = await ds.getProducts();
    expect(products).toHaveLength(2);
  });

  it("encuentra producto y variante por variantId", async () => {
    const match = await ds.getProductByVariantId("var-3");
    expect(match?.product.title).toBe("Playera Guess");
    expect(match?.variant.sku).toBe("LS-PLA-GUE-M-BLA");
  });

  it("devuelve null si el variantId no existe", async () => {
    const match = await ds.getProductByVariantId("inexistente");
    expect(match).toBeNull();
  });
});
```

- [ ] **Step 4: Correr tests (fallan)**

Run: `npx vitest run lib/data/__tests__/fixture-source.test.ts`
Expected: FAIL — `Cannot find module '../fixture-source'`.

- [ ] **Step 5: Implementar FixtureDataSource**

`lib/data/fixture-source.ts`:
```ts
import type { Location, Product } from "@/lib/domain/types";
import type { InventoryDataSource, VariantMatch } from "./source";
import { fixtureLocations, fixtureProducts } from "./fixtures";

export class FixtureDataSource implements InventoryDataSource {
  async getLocations(): Promise<Location[]> {
    return fixtureLocations;
  }

  async getProducts(): Promise<Product[]> {
    return fixtureProducts;
  }

  async getProductByVariantId(variantId: string): Promise<VariantMatch | null> {
    for (const product of fixtureProducts) {
      const variant = product.variants.find((v) => v.id === variantId);
      if (variant) return { product, variant };
    }
    return null;
  }
}
```

- [ ] **Step 6: Correr tests (pasan)**

Run: `npx vitest run lib/data/__tests__/fixture-source.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/data
git commit -m "feat: interfaz InventoryDataSource e implementación con fixtures"
```

---

### Task 5: Servicio de inventario (agregaciones puras)

**Files:**
- Create: `lib/services/inventory.ts`
- Test: `lib/services/__tests__/inventory.test.ts`

**Interfaces:**
- Consumes: tipos de Task 3.
- Produces:
  - `variantStock(variant: Variant, locationId?: string): number`
  - `productStock(product: Product, locationId?: string): number`
  - `lowStockVariants(products: Product[], threshold: number, locationId?: string): LowStockEntry[]`
    donde `LowStockEntry = { product: Product; variant: Variant; available: number }`.

- [ ] **Step 1: Escribir tests del servicio**

`lib/services/__tests__/inventory.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { variantStock, productStock, lowStockVariants } from "../inventory";
import { fixtureProducts } from "@/lib/data/fixtures";

const hoodie = fixtureProducts[0];

describe("variantStock", () => {
  it("suma stock de todas las tiendas sin filtro", () => {
    expect(variantStock(hoodie.variants[0])).toBe(8); // 3 + 5
  });
  it("filtra por tienda", () => {
    expect(variantStock(hoodie.variants[0], "loc-1")).toBe(3);
  });
  it("devuelve 0 si la tienda no tiene nivel", () => {
    expect(variantStock(hoodie.variants[0], "loc-999")).toBe(0);
  });
});

describe("productStock", () => {
  it("suma stock de todas las variantes y tiendas", () => {
    // var-1: 3+5=8, var-2: 1+0=1 => 9
    expect(productStock(hoodie)).toBe(9);
  });
  it("suma stock del producto en una tienda", () => {
    // loc-1: 3 + 1 = 4
    expect(productStock(hoodie, "loc-1")).toBe(4);
  });
});

describe("lowStockVariants", () => {
  it("lista variantes en o por debajo del umbral", () => {
    const low = lowStockVariants(fixtureProducts, 1);
    const skus = low.map((e) => e.variant.sku);
    expect(skus).toContain("LS-HOO-NYY-L-NEG"); // total 1
    expect(skus).not.toContain("LS-PLA-GUE-M-BLA"); // total 10
  });
  it("respeta el filtro por tienda", () => {
    const low = lowStockVariants(fixtureProducts, 0, "loc-2");
    // var-2 en loc-2 = 0 => incluida
    expect(low.map((e) => e.variant.id)).toContain("var-2");
  });
});
```

- [ ] **Step 2: Correr tests (fallan)**

Run: `npx vitest run lib/services/__tests__/inventory.test.ts`
Expected: FAIL — `Cannot find module '../inventory'`.

- [ ] **Step 3: Implementar el servicio**

`lib/services/inventory.ts`:
```ts
import type { Product, Variant } from "@/lib/domain/types";

export interface LowStockEntry {
  product: Product;
  variant: Variant;
  available: number;
}

export function variantStock(variant: Variant, locationId?: string): number {
  return variant.inventory
    .filter((lvl) => !locationId || lvl.locationId === locationId)
    .reduce((sum, lvl) => sum + lvl.available, 0);
}

export function productStock(product: Product, locationId?: string): number {
  return product.variants.reduce(
    (sum, v) => sum + variantStock(v, locationId),
    0
  );
}

export function lowStockVariants(
  products: Product[],
  threshold: number,
  locationId?: string
): LowStockEntry[] {
  const result: LowStockEntry[] = [];
  for (const product of products) {
    for (const variant of product.variants) {
      const available = variantStock(variant, locationId);
      if (available <= threshold) {
        result.push({ product, variant, available });
      }
    }
  }
  return result;
}
```

- [ ] **Step 4: Correr tests (pasan)**

Run: `npx vitest run lib/services/__tests__/inventory.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/services
git commit -m "feat: servicio de inventario con agregaciones de stock"
```

---

### Task 6: Autenticación con roles (NextAuth)

**Files:**
- Create: `lib/auth/users.ts`, `lib/auth/options.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/login/page.tsx`, `middleware.ts`, `types/next-auth.d.ts`
- Modify: `app/layout.tsx`, `.env.local` (instrucción)
- Test: `lib/auth/__tests__/users.test.ts`

**Interfaces:**
- Consumes: `Role` de Task 3.
- Produces:
  - `findUser(username: string, password: string): AppUser | null`
    donde `AppUser = { id: string; name: string; role: Role; locationId: string | null }`.
  - Sesión NextAuth con `session.user.role` y `session.user.locationId`.

- [ ] **Step 1: Escribir tests del directorio de usuarios**

`lib/auth/__tests__/users.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { findUser } from "../users";

describe("findUser", () => {
  it("autentica al dueño con rol owner y sin tienda fija", () => {
    const u = findUser("lolo", "lolo123");
    expect(u?.role).toBe("owner");
    expect(u?.locationId).toBeNull();
  });

  it("autentica colaborador con su tienda asignada", () => {
    const u = findUser("colab1", "colab123");
    expect(u?.role).toBe("collaborator");
    expect(u?.locationId).toBe("loc-1");
  });

  it("rechaza contraseña incorrecta", () => {
    expect(findUser("lolo", "malo")).toBeNull();
  });

  it("rechaza usuario inexistente", () => {
    expect(findUser("nadie", "x")).toBeNull();
  });
});
```

- [ ] **Step 2: Correr tests (fallan)**

Run: `npx vitest run lib/auth/__tests__/users.test.ts`
Expected: FAIL — `Cannot find module '../users'`.

- [ ] **Step 3: Implementar directorio de usuarios**

`lib/auth/users.ts`:
```ts
import type { Role } from "@/lib/domain/types";

export interface AppUser {
  id: string;
  username: string;
  password: string;
  name: string;
  role: Role;
  locationId: string | null;
}

// Fase 1: usuarios estáticos. Fase 2+: mover a almacenamiento real.
const USERS: AppUser[] = [
  { id: "u1", username: "lolo", password: "lolo123", name: "Dueño", role: "owner", locationId: null },
  { id: "u2", username: "encargado", password: "enc123", name: "Encargado", role: "manager", locationId: null },
  { id: "u3", username: "colab1", password: "colab123", name: "Colaborador Tienda 1", role: "collaborator", locationId: "loc-1" },
  { id: "u4", username: "colab2", password: "colab123", name: "Colaborador Tienda 2", role: "collaborator", locationId: "loc-2" },
];

export function findUser(username: string, password: string): Omit<AppUser, "password"> | null {
  const user = USERS.find((u) => u.username === username && u.password === password);
  if (!user) return null;
  const { password: _pw, ...safe } = user;
  return safe;
}
```

- [ ] **Step 4: Correr tests (pasan)**

Run: `npx vitest run lib/auth/__tests__/users.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Configurar NextAuth**

Run: `npm install next-auth@4.24.7`

`lib/auth/options.ts`:
```ts
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { findUser } from "./users";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      authorize(credentials) {
        if (!credentials) return null;
        const user = findUser(credentials.username, credentials.password);
        if (!user) return null;
        return { id: user.id, name: user.name, role: user.role, locationId: user.locationId };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.locationId = (user as { locationId: string | null }).locationId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
        session.user.locationId = (token.locationId as string | null) ?? null;
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
};
```

`types/next-auth.d.ts`:
```ts
import type { Role } from "@/lib/domain/types";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      role: Role;
      locationId: string | null;
    };
  }
  interface User {
    role: Role;
    locationId: string | null;
  }
}
```

`app/api/auth/[...nextauth]/route.ts`:
```ts
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/options";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

- [ ] **Step 6: Crear página de login**

`app/login/page.tsx`:
```tsx
"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await signIn("credentials", { username, password, redirect: false });
    if (res?.error) setError("Usuario o contraseña incorrectos");
    else router.push("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-center">LoloShop</h1>
        <input className="w-full rounded border p-2" placeholder="Usuario"
          value={username} onChange={(e) => setUsername(e.target.value)} />
        <input className="w-full rounded border p-2" type="password" placeholder="Contraseña"
          value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded bg-loloteal p-2 font-semibold text-white" type="submit">
          Entrar
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 7: Proteger rutas con middleware**

`middleware.ts`:
```ts
export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/((?!login|api/auth|manifest.json|icons|sw.js|workbox|_next).*)"],
};
```

- [ ] **Step 8: Envolver app con SessionProvider**

Crear `app/providers.tsx`:
```tsx
"use client";
import { SessionProvider } from "next-auth/react";
export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

Modificar `app/layout.tsx` para envolver `children`:
```tsx
import Providers from "./providers";
// ...
      <body><Providers>{children}</Providers></body>
```

- [ ] **Step 9: Documentar variable de entorno**

Crear `.env.local` (NO commitear — ya está en .gitignore):
```
NEXTAUTH_SECRET=genera-uno-con-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000
```
Instrucción al implementador: corre `openssl rand -base64 32` y pega el valor en `NEXTAUTH_SECRET`.

- [ ] **Step 10: Verificar suite completa y build**

Run: `npm test && npm run build`
Expected: todos los tests PASS; build exitoso.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: autenticación con roles y rutas protegidas (NextAuth)"
```

---

### Task 7: Pantalla de Productos (lista + búsqueda + filtro)

**Files:**
- Create: `lib/data/get-source.ts`, `app/productos/page.tsx`, `components/ProductCard.tsx`, `components/SearchFilter.tsx`
- Test: `components/__tests__/SearchFilter.test.tsx`, `lib/data/__tests__/filter.test.ts`, `lib/data/filter.ts`

**Interfaces:**
- Consumes: `FixtureDataSource` (Task 4), `productStock` (Task 5), sesión (Task 6).
- Produces:
  - `getDataSource(): InventoryDataSource` (factory; Fase 1 devuelve `FixtureDataSource`).
  - `filterProducts(products: Product[], query: string, category: string | null): Product[]`.

- [ ] **Step 1: Escribir tests del filtro**

`lib/data/__tests__/filter.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { filterProducts } from "../filter";
import { fixtureProducts } from "../fixtures";

describe("filterProducts", () => {
  it("sin query ni categoría devuelve todo", () => {
    expect(filterProducts(fixtureProducts, "", null)).toHaveLength(2);
  });
  it("filtra por texto en título (case-insensitive)", () => {
    const r = filterProducts(fixtureProducts, "guess", null);
    expect(r.map((p) => p.id)).toEqual(["prod-2"]);
  });
  it("filtra por marca", () => {
    const r = filterProducts(fixtureProducts, "yankees", null);
    expect(r.map((p) => p.id)).toEqual(["prod-1"]);
  });
  it("filtra por SKU de variante", () => {
    const r = filterProducts(fixtureProducts, "LS-PLA", null);
    expect(r.map((p) => p.id)).toEqual(["prod-2"]);
  });
  it("filtra por categoría", () => {
    const r = filterProducts(fixtureProducts, "", "Hoodies");
    expect(r.map((p) => p.id)).toEqual(["prod-1"]);
  });
});
```

- [ ] **Step 2: Correr tests (fallan)**

Run: `npx vitest run lib/data/__tests__/filter.test.ts`
Expected: FAIL — `Cannot find module '../filter'`.

- [ ] **Step 3: Implementar el filtro**

`lib/data/filter.ts`:
```ts
import type { Product } from "@/lib/domain/types";

export function filterProducts(
  products: Product[],
  query: string,
  category: string | null
): Product[] {
  const q = query.trim().toLowerCase();
  return products.filter((p) => {
    if (category && p.category !== category) return false;
    if (!q) return true;
    const haystack = [
      p.title,
      p.brand,
      p.category,
      ...p.variants.map((v) => v.sku),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
```

- [ ] **Step 4: Correr tests (pasan)**

Run: `npx vitest run lib/data/__tests__/filter.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Crear factory de datasource**

`lib/data/get-source.ts`:
```ts
import type { InventoryDataSource } from "./source";
import { FixtureDataSource } from "./fixture-source";

// Fase 1: fixtures. Fase 2+: si existe SHOPIFY_ACCESS_TOKEN, devolver ShopifyDataSource.
export function getDataSource(): InventoryDataSource {
  return new FixtureDataSource();
}
```

- [ ] **Step 6: Escribir test del componente SearchFilter**

`components/__tests__/SearchFilter.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchFilter } from "../SearchFilter";

describe("SearchFilter", () => {
  it("emite el texto escrito", () => {
    const onQuery = vi.fn();
    render(<SearchFilter onQuery={onQuery} onCategory={() => {}} categories={["Hoodies"]} />);
    fireEvent.change(screen.getByPlaceholderText("Buscar producto..."), {
      target: { value: "guess" },
    });
    expect(onQuery).toHaveBeenCalledWith("guess");
  });

  it("emite la categoría seleccionada", () => {
    const onCategory = vi.fn();
    render(<SearchFilter onQuery={() => {}} onCategory={onCategory} categories={["Hoodies"]} />);
    fireEvent.change(screen.getByLabelText("Categoría"), { target: { value: "Hoodies" } });
    expect(onCategory).toHaveBeenCalledWith("Hoodies");
  });
});
```

- [ ] **Step 7: Correr test (falla)**

Run: `npx vitest run components/__tests__/SearchFilter.test.tsx`
Expected: FAIL — `Cannot find module '../SearchFilter'`.

- [ ] **Step 8: Implementar SearchFilter y ProductCard**

`components/SearchFilter.tsx`:
```tsx
"use client";

interface Props {
  categories: string[];
  onQuery: (q: string) => void;
  onCategory: (c: string | null) => void;
}

export function SearchFilter({ categories, onQuery, onCategory }: Props) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        className="flex-1 rounded border p-2"
        placeholder="Buscar producto..."
        onChange={(e) => onQuery(e.target.value)}
      />
      <select
        aria-label="Categoría"
        className="rounded border p-2"
        onChange={(e) => onCategory(e.target.value || null)}
      >
        <option value="">Todas</option>
        {categories.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}
```

`components/ProductCard.tsx`:
```tsx
import type { Product } from "@/lib/domain/types";
import { productStock } from "@/lib/services/inventory";

export function ProductCard({ product, locationId }: { product: Product; locationId?: string }) {
  return (
    <div className="rounded-lg border p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{product.title}</h3>
        <span className="rounded bg-loloteal/10 px-2 py-1 text-sm text-loloteal">
          {productStock(product, locationId)} en stock
        </span>
      </div>
      <p className="text-sm text-gray-500">{product.brand} · {product.category}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {product.variants.map((v) => (
          <li key={v.id} className="flex justify-between">
            <span>{v.title}</span>
            <span className="text-gray-600">${v.price}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 9: Correr test (pasa)**

Run: `npx vitest run components/__tests__/SearchFilter.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 10: Crear página de productos (client component con estado)**

`app/productos/page.tsx`:
```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/domain/types";
import { getDataSource } from "@/lib/data/get-source";
import { filterProducts } from "@/lib/data/filter";
import { SearchFilter } from "@/components/SearchFilter";
import { ProductCard } from "@/components/ProductCard";

const CATEGORIES = [
  "Playeras", "Pantalones", "Hoodies", "Tenis", "Accesorios", "Perfumes", "Raquetas de Padel",
];

export default function ProductosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    getDataSource().getProducts().then(setProducts);
  }, []);

  const visible = useMemo(
    () => filterProducts(products, query, category),
    [products, query, category]
  );

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-xl font-bold">Productos</h1>
      <SearchFilter categories={CATEGORIES} onQuery={setQuery} onCategory={setCategory} />
      <div className="grid gap-3">
        {visible.map((p) => <ProductCard key={p.id} product={p} />)}
        {visible.length === 0 && <p className="text-gray-500">Sin resultados.</p>}
      </div>
    </main>
  );
}
```

- [ ] **Step 11: Verificar suite y build**

Run: `npm test && npm run build`
Expected: todos PASS; build exitoso.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: pantalla de productos con búsqueda y filtro por categoría"
```

---

### Task 8: Dashboard (Home) con stock por tienda y alertas

**Files:**
- Create: `app/page.tsx` (reemplaza el placeholder), `components/StockSummary.tsx`, `components/LowStockList.tsx`, `components/NavBar.tsx`
- Modify: `app/layout.tsx` (incluir NavBar)
- Test: `components/__tests__/StockSummary.test.tsx`

**Interfaces:**
- Consumes: `getDataSource` (Task 7), `productStock` y `lowStockVariants` (Task 5), sesión (Task 6).
- Produces: Home funcional. Fin de Fase 1.

- [ ] **Step 1: Escribir test de StockSummary**

`components/__tests__/StockSummary.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StockSummary } from "../StockSummary";
import { fixtureProducts, fixtureLocations } from "@/lib/data/fixtures";

describe("StockSummary", () => {
  it("muestra el total por tienda", () => {
    render(<StockSummary products={fixtureProducts} locations={fixtureLocations} />);
    // Tienda 1: hoodie loc-1 (3+1=4) + playera loc-1 (8) = 12
    expect(screen.getByTestId("stock-loc-1")).toHaveTextContent("12");
    // Tienda 2: hoodie loc-2 (5+0=5) + playera loc-2 (2) = 7
    expect(screen.getByTestId("stock-loc-2")).toHaveTextContent("7");
  });
});
```

- [ ] **Step 2: Correr test (falla)**

Run: `npx vitest run components/__tests__/StockSummary.test.tsx`
Expected: FAIL — `Cannot find module '../StockSummary'`.

- [ ] **Step 3: Implementar StockSummary y LowStockList**

`components/StockSummary.tsx`:
```tsx
import type { Location, Product } from "@/lib/domain/types";
import { productStock } from "@/lib/services/inventory";

export function StockSummary({ products, locations }: { products: Product[]; locations: Location[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {locations.map((loc) => {
        const total = products.reduce((sum, p) => sum + productStock(p, loc.id), 0);
        return (
          <div key={loc.id} className="rounded-lg border p-4 text-center">
            <p className="text-sm text-gray-500">{loc.name}</p>
            <p data-testid={`stock-${loc.id}`} className="text-3xl font-bold text-loloteal">
              {total}
            </p>
            <p className="text-xs text-gray-400">unidades</p>
          </div>
        );
      })}
    </div>
  );
}
```

`components/LowStockList.tsx`:
```tsx
import type { Product } from "@/lib/domain/types";
import { lowStockVariants } from "@/lib/services/inventory";

export function LowStockList({ products, threshold }: { products: Product[]; threshold: number }) {
  const low = lowStockVariants(products, threshold);
  if (low.length === 0) return <p className="text-sm text-gray-500">Sin alertas de stock.</p>;
  return (
    <ul className="space-y-1">
      {low.map((e) => (
        <li key={e.variant.id} className="flex justify-between rounded bg-red-50 px-3 py-2 text-sm">
          <span>{e.product.title} — {e.variant.title}</span>
          <span className="font-semibold text-red-600">{e.available}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Correr test (pasa)**

Run: `npx vitest run components/__tests__/StockSummary.test.tsx`
Expected: PASS, 1 test.

- [ ] **Step 5: Crear NavBar**

`components/NavBar.tsx`:
```tsx
"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";

export function NavBar() {
  return (
    <nav className="flex items-center justify-between border-b bg-white px-4 py-3">
      <Link href="/" className="font-bold text-loloteal">LoloShop</Link>
      <div className="flex gap-4 text-sm">
        <Link href="/">Inicio</Link>
        <Link href="/productos">Productos</Link>
        <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-gray-500">
          Salir
        </button>
      </div>
    </nav>
  );
}
```

- [ ] **Step 6: Implementar Home**

`app/page.tsx` (reemplaza el placeholder):
```tsx
"use client";
import { useEffect, useState } from "react";
import type { Location, Product } from "@/lib/domain/types";
import { getDataSource } from "@/lib/data/get-source";
import { StockSummary } from "@/components/StockSummary";
import { LowStockList } from "@/components/LowStockList";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  useEffect(() => {
    const ds = getDataSource();
    ds.getProducts().then(setProducts);
    ds.getLocations().then(setLocations);
  }, []);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <section>
        <h2 className="mb-2 text-lg font-semibold">Stock por tienda</h2>
        <StockSummary products={products} locations={locations} />
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Alertas de stock bajo</h2>
        <LowStockList products={products} threshold={1} />
      </section>
    </main>
  );
}
```

- [ ] **Step 7: Incluir NavBar en layout**

Modificar `app/layout.tsx`, dentro de `<Providers>`:
```tsx
import { NavBar } from "@/components/NavBar";
// ...
      <body>
        <Providers>
          <NavBar />
          {children}
        </Providers>
      </body>
```

- [ ] **Step 8: Verificación final completa**

Run: `npm test && npm run build`
Expected: todos los tests PASS; build exitoso.

- [ ] **Step 9: Verificación manual**

Run: `npm run dev`
Verificar en `http://localhost:3000`:
1. Redirige a `/login`.
2. Login con `colab1` / `colab123` entra al dashboard.
3. Dashboard muestra stock de Tienda 1 (12) y Tienda 2 (7) y la alerta del hoodie L/Negro.
4. `/productos` lista los 2 productos, búsqueda "guess" filtra a 1.
5. "Salir" regresa a `/login`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: dashboard con stock por tienda, alertas y navegación"
```

---

## Fin de Fase 1

Entregable: PWA instalable, login por roles, dashboard con stock por tienda y alertas, pantalla de productos con búsqueda/filtro. Todo probado con fixtures, sin token de Shopify.

**Siguiente (Fase 2):** Implementar `ShopifyDataSource` detrás de `InventoryDataSource`, escaneo QR/barcode, registrar entrada (alta + SKU) y salida (descuento de stock). El factory `getDataSource()` cambiará para devolver `ShopifyDataSource` cuando exista `SHOPIFY_ACCESS_TOKEN`.

## Self-Review (completado)

- **Cobertura del spec:** Arquitectura PWA ✓ (T1-2), roles ✓ (T6), modelo de datos/tipos ✓ (T3-4), SKU automático ✓ (T3), pantalla Productos ✓ (T7), Home/dashboard con alertas ✓ (T8), sistema híbrido QR/barcode → variant.barcode modelado en tipos ✓ (uso real en Fase 2). Escaneo, entrada, salida, etiquetas QR y reportes → Fase 2/3 (fuera de alcance de este plan, declarado).
- **Placeholders:** los iconos PNG (T2 Step 5) son el único artefacto binario que el implementador debe sustituir con el logo real; documentado explícitamente, no bloquea el build.
- **Consistencia de tipos:** `InventoryDataSource`, `VariantMatch`, `Product`, `Variant`, `productStock`, `variantStock`, `lowStockVariants`, `filterProducts`, `getDataSource`, `findUser` usados con firmas idénticas entre tareas. ✓

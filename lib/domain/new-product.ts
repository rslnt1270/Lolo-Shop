import { isProductBlobUrl } from "@/lib/image/blob-url";

export const PRODUCT_CATEGORIES = [
  "Playeras", "Pantalones", "Hoodies", "Tenis", "Accesorios", "Perfumes", "Raquetas de Padel",
] as const;

export const MAX_TITLE_LENGTH = 120;
export const MAX_SIZE_LENGTH = 20;
/** Tope de `Variant.price` (Decimal(10,2)). */
export const MAX_PRICE = 99_999_999.99;
export const DEFAULT_SIZE = "U";
export const MAX_DESCRIPTION_LENGTH = 500;
export const CATALOG_PHOTOS_MESSAGE = "Para el catálogo se necesitan las dos fotos: frente y atrás.";

/** "stock": solo inventario/venta, sin fotos. "catalog": exige foto de frente y de atrás. */
export type EntryMode = "stock" | "catalog";

export interface NewProductInput {
  title: string;
  /** Marca canónica elegida o creada en el combo (`Brand.id`). */
  brandId: string;
  /** Departamento obligatorio en altas nuevas (ER §2.3, A3). */
  departmentId: string;
  category: string;
  price: number;
  initialStock: number;
  size?: string;
  /** Por defecto "stock". */
  mode?: EntryMode;
  description?: string | null;
  imageUrl?: string | null;
  backImageUrl?: string | null;
}

export interface NormalizedNewProduct {
  title: string;
  brandId: string;
  departmentId: string;
  category: string;
  price: number;
  initialStock: number;
  size: string;
  mode: EntryMode;
  description: string | null;
  /** Null en modo stock (las fotos se ignoran). */
  imageUrl: string | null;
  backImageUrl: string | null;
}

/** Redondea a centavos sin el error binario de `x * 100` (10.005 → 10.01). */
export function roundToCents(value: number): number {
  const s = String(value);
  if (s.includes("e")) return Math.round(value * 100) / 100;
  return Number(`${Math.round(Number(`${s}e2`))}e-2`);
}

/**
 * Valida el alta y devuelve los datos normalizados (textos recortados, precio
 * a centavos, talla por defecto "U"). Lanza un Error con el mensaje para el
 * operador si el alta no es válida.
 */
export function validateNewProduct(input: NewProductInput): NormalizedNewProduct {
  const title = (input.title ?? "").trim();
  const brandId = (input.brandId ?? "").trim();
  const departmentId = (input.departmentId ?? "").trim();
  if (!title || !brandId) {
    throw new Error("Título y marca son obligatorios.");
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(`El título no puede pasar de ${MAX_TITLE_LENGTH} caracteres.`);
  }
  if (!departmentId) {
    throw new Error("Elige el departamento.");
  }
  if (!(PRODUCT_CATEGORIES as readonly string[]).includes(input.category)) {
    throw new Error("Elige una categoría válida.");
  }
  if (typeof input.price !== "number" || !Number.isFinite(input.price)) {
    throw new Error("El precio debe ser un número mayor a cero.");
  }
  const price = roundToCents(input.price);
  if (price <= 0) {
    throw new Error("El precio debe ser un número mayor a cero.");
  }
  if (price > MAX_PRICE) {
    throw new Error("El precio no puede pasar de $99,999,999.99.");
  }
  if (!Number.isInteger(input.initialStock) || input.initialStock < 0) {
    throw new Error("El stock inicial debe ser un número entero mayor o igual a cero.");
  }
  const size = (input.size ?? "").trim() || DEFAULT_SIZE;
  if (size.length > MAX_SIZE_LENGTH) {
    throw new Error(`La talla no puede pasar de ${MAX_SIZE_LENGTH} caracteres.`);
  }
  const description = (typeof input.description === "string" ? input.description : "").trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`La descripción no puede pasar de ${MAX_DESCRIPTION_LENGTH} caracteres.`);
  }
  const mode: EntryMode = input.mode === "catalog" ? "catalog" : "stock";
  let imageUrl: string | null = null;
  let backImageUrl: string | null = null;
  if (mode === "catalog") {
    if (!input.imageUrl || !input.backImageUrl) throw new Error(CATALOG_PHOTOS_MESSAGE);
    if (!isProductBlobUrl(input.imageUrl) || !isProductBlobUrl(input.backImageUrl)) {
      throw new Error("La foto no se subió correctamente. Tómala de nuevo.");
    }
    imageUrl = input.imageUrl;
    backImageUrl = input.backImageUrl;
  }
  return {
    title, brandId, departmentId, category: input.category, price, initialStock: input.initialStock, size,
    mode, description: description || null, imageUrl, backImageUrl,
  };
}

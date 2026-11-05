export const PRODUCT_CATEGORIES = [
  "Playeras", "Pantalones", "Hoodies", "Tenis", "Accesorios", "Perfumes", "Raquetas de Padel",
] as const;

export const MAX_TITLE_LENGTH = 120;
export const MAX_BRAND_LENGTH = 60;
export const MAX_SIZE_LENGTH = 20;
/** Tope de `Variant.price` (Decimal(10,2)). */
export const MAX_PRICE = 99_999_999.99;
export const DEFAULT_SIZE = "U";

export interface NewProductInput {
  title: string;
  brand: string;
  category: string;
  price: number;
  initialStock: number;
  size?: string;
}

export interface NormalizedNewProduct {
  title: string;
  brand: string;
  category: string;
  price: number;
  initialStock: number;
  size: string;
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
  const brand = (input.brand ?? "").trim();
  if (!title || !brand) {
    throw new Error("Título y marca son obligatorios.");
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(`El título no puede pasar de ${MAX_TITLE_LENGTH} caracteres.`);
  }
  if (brand.length > MAX_BRAND_LENGTH) {
    throw new Error(`La marca no puede pasar de ${MAX_BRAND_LENGTH} caracteres.`);
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
  return { title, brand, category: input.category, price, initialStock: input.initialStock, size };
}

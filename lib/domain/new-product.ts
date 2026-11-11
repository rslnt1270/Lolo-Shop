import { isProductBlobUrl } from "@/lib/image/blob-url";
import { canonicalCode, isValidGtin } from "./barcode";
import { normalizeSize, UNIQUE_SIZE } from "./sizes";
import { isAudience, MSG_AUDIENCE_INVALID, MSG_PICK_TYPE } from "./product-taxonomy";

/** @deprecated se retira en G (Task 7) cuando los consumidores usen productTypeId */
export const PRODUCT_CATEGORIES = [
  "Playeras", "Pantalones", "Hoodies", "Tenis", "Accesorios", "Perfumes", "Raquetas de Padel",
] as const;

export const MAX_TITLE_LENGTH = 120;
export const MAX_SIZE_LENGTH = 20;
/** Tope de `Variant.price` (Decimal(10,2)). */
export const MAX_PRICE = 99_999_999.99;
export const DEFAULT_SIZE = UNIQUE_SIZE;
/** Tallas por alta (1 a 12). */
export const MAX_SIZES = 12;
export const MAX_BARCODE_LENGTH = 64;
export const MAX_DESCRIPTION_LENGTH = 500;
export const CATALOG_PHOTOS_MESSAGE = "Para el catálogo se necesitan las dos fotos: frente y atrás.";

/** "stock": solo inventario/venta, sin fotos. "catalog": exige foto de frente y de atrás. */
export type EntryMode = "stock" | "catalog";

/** Una talla del alta: código escaneado (null = "Sin código"), precio y piezas contadas. */
export interface SizeRowInput {
  size: string;
  barcode: string | null;
  price: number;
  initialStock: number;
}

/** Talla normalizada; `barcode` canónico (alfanuméricos en mayúsculas) o null. */
export type NormalizedSizeRow = SizeRowInput;

export interface NewProductInput {
  title: string;
  /** Marca canónica elegida o creada en el combo (`Brand.id`). */
  brandId: string;
  /** Departamento obligatorio en altas nuevas (ER §2.3, A3). */
  departmentId: string;
  /** Tipo global elegido (`ProductType.id`); el servidor deriva `category` de él. */
  productTypeId?: string;
  /** @deprecated se retira en G (Task 7) cuando los consumidores usen productTypeId */
  category?: string;
  /** Estilo (slug de `STYLE_OPTIONS[tipo]`); vacío = sin estilo. */
  style?: string | null;
  /** «Para» (solo Calzado): dama, caballero o nino. */
  audience?: string | null;
  /** Una fila por talla (1 a 12); sustituye `price`, `size` e `initialStock` sueltos. */
  sizes: SizeRowInput[];
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
  /** Null solo en el camino legado con `category`. */
  productTypeId: string | null;
  /** @deprecated se retira en G (Task 7) cuando los consumidores usen productTypeId */
  category: string;
  style: string | null;
  audience: string | null;
  sizes: NormalizedSizeRow[];
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
 * Valida una talla y la devuelve normalizada (talla en mayúsculas o "U", precio
 * a centavos, código canónico). Lanza un Error con el mensaje para el operador;
 * `label` antepone la talla cuando hay varias filas.
 */
export function validateSizeRow(row: SizeRowInput, label = ""): NormalizedSizeRow {
  if (!row || typeof row !== "object") throw new Error("Faltan los datos de la talla.");
  const pre = label ? `${label}: ` : "";
  const size = normalizeSize(typeof row.size === "string" ? row.size : "");
  if (size.length > MAX_SIZE_LENGTH) {
    throw new Error(`${pre}La talla no puede pasar de ${MAX_SIZE_LENGTH} caracteres.`);
  }
  if (typeof row.price !== "number" || !Number.isFinite(row.price)) {
    throw new Error(`${pre}El precio debe ser un número mayor a cero.`);
  }
  const price = roundToCents(row.price);
  if (price <= 0) throw new Error(`${pre}El precio debe ser un número mayor a cero.`);
  if (price > MAX_PRICE) throw new Error(`${pre}El precio no puede pasar de $99,999,999.99.`);
  if (!Number.isInteger(row.initialStock) || row.initialStock < 0) {
    throw new Error(`${pre}El stock inicial (piezas) debe ser un número entero mayor o igual a cero.`);
  }
  let barcode: string | null = null;
  if (row.barcode !== null) {
    barcode = canonicalCode(typeof row.barcode === "string" ? row.barcode : "");
    if (!barcode) throw new Error(`${pre}Escanea o escribe el código de la etiqueta, o marca «Sin código».`);
    if (barcode.length > MAX_BARCODE_LENGTH) throw new Error(`${pre}El código es demasiado largo. Vuelve a escanearlo.`);
    if (!isValidGtin(barcode)) {
      throw new Error(`${pre}El código ${barcode} no es válido (falla el dígito verificador). Vuelve a escanearlo.`);
    }
  }
  return { size, barcode, price, initialStock: row.initialStock };
}

/**
 * Valida de 1 a 12 tallas: sin códigos repetidos ni tallas repetidas sin código
 * dentro del mismo envío (dos M con códigos distintos sí: son dos etiquetas).
 */
export function validateSizeRows(rows: SizeRowInput[]): NormalizedSizeRow[] {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Agrega al menos una talla.");
  if (rows.length > MAX_SIZES) throw new Error(`Un producto puede tener hasta ${MAX_SIZES} tallas por alta.`);
  const out = rows.map((r) =>
    validateSizeRow(r, rows.length > 1 ? `Talla ${normalizeSize(typeof r?.size === "string" ? r.size : "")}` : ""),
  );
  const codes = new Set<string>();
  const sizesWithoutCode = new Set<string>();
  for (const r of out) {
    if (r.barcode !== null) {
      if (codes.has(r.barcode)) throw new Error(`El código ${r.barcode} está en dos tallas. Cada etiqueta va una sola vez.`);
      codes.add(r.barcode);
    } else {
      if (sizesWithoutCode.has(r.size)) {
        throw new Error(`La talla ${r.size} está repetida sin código. Deja una sola fila y suma las piezas.`);
      }
      sizesWithoutCode.add(r.size);
    }
  }
  return out;
}

/**
 * Valida el alta y devuelve los datos normalizados (textos recortados y
 * tallas con `validateSizeRows`). Lanza un Error con el mensaje para el
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
  const productTypeId = typeof input.productTypeId === "string" ? input.productTypeId.trim() : "";
  // Camino legado (transición): quien manda `category` sin tipo se valida como antes.
  const legacy = !productTypeId && input.category !== undefined;
  if (legacy) {
    if (!(PRODUCT_CATEGORIES as readonly string[]).includes(input.category as string)) {
      throw new Error("Elige una categoría válida.");
    }
  } else if (!productTypeId) {
    throw new Error(MSG_PICK_TYPE);
  }
  const style = typeof input.style === "string" && input.style.trim() ? input.style.trim() : null;
  const hasAudience = input.audience !== undefined && input.audience !== null && input.audience !== "";
  if (hasAudience && !isAudience(input.audience)) throw new Error(MSG_AUDIENCE_INVALID);
  const audience = hasAudience ? (input.audience as string) : null;
  const sizes = validateSizeRows(input.sizes);
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
    title, brandId, departmentId, productTypeId: productTypeId || null, category: legacy ? (input.category as string) : "", style, audience, sizes,
    mode, description: description || null, imageUrl, backImageUrl,
  };
}

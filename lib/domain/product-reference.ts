/** Referencia del producto (color, título sugerido, estado fotográfico). Lógica pura: cliente y servidor. */

export const BASE_COLORS: readonly string[] = [
  "Negro", "Blanco", "Gris", "Azul", "Rojo", "Rosa",
  "Verde", "Café", "Beige", "Naranja", "Amarillo", "Morado",
];

export const NO_COLOR_DEPARTMENT_SLUGS: readonly string[] = ["accesorios"];
export const NO_COLOR_TYPE_SLUGS: readonly string[] = ["perfume"];

export const MAX_COLOR_LENGTH = 40;

export function colorApplies(input: {
  departmentSlug: string | null;
  typeSlug: string | null;
}): boolean {
  if (input.departmentSlug && NO_COLOR_DEPARTMENT_SLUGS.includes(input.departmentSlug)) return false;
  if (input.typeSlug && NO_COLOR_TYPE_SLUGS.includes(input.typeSlug)) return false;
  return true;
}

/** Quita marcado y símbolos: deja letras (con acentos), dígitos y espacios simples. */
function sanitizeColorText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/<[^>]*>/g, " ")
    .replace(/[^\p{L}\p{N}\p{M} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Singular aproximado de una palabra ya sin acentos: "grises"→"gris", "rosas"→"rosa", "gris" se queda. */
function singularWord(w: string): string {
  if (w.length > 4 && w.endsWith("es")) return singularWord2(w.slice(0, -2));
  if (w.length > 4 && w.endsWith("s")) w = w.slice(0, -1);
  return singularWord2(w);
}

/** Quita la "e" final de palabras largas ("café"/"cafés" → "caf", "verde" → "verd"). */
function singularWord2(w: string): string {
  return w.length > 3 && w.endsWith("e") ? w.slice(0, -1) : w;
}

/** Clave de comparación por palabra: sin acentos, minúsculas, solo [a-z0-9 ], singular aproximado. */
export function normalizeColorKey(raw: string): string {
  return sanitizeColorText(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .map(singularWord)
    .join(" ");
}

export function displayColor(raw: string): string {
  const t = sanitizeColorText(raw).toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function buildSuggestedTitle(parts: {
  typeName: string;
  brand: string;
  color: string | null;
}): string {
  return [parts.typeName, parts.brand, parts.color?.toLowerCase()].filter(Boolean).join(" ");
}

export function validateReference(input: {
  brand: string;
  color: string | null;
  departmentSlug: string | null;
  typeSlug: string | null;
}): { color: string | null } {
  if (!input.brand || !input.brand.trim()) throw new Error("Elige la marca.");
  if (!colorApplies(input)) return { color: null };
  if (!input.color || !normalizeColorKey(input.color)) return { color: null };
  const color = displayColor(input.color);
  if (color.length > MAX_COLOR_LENGTH) throw new Error("El color puede tener máximo 40 caracteres.");
  return { color };
}

export type PhotoStatus =
  | "Solo stock"
  | "Falta completar registro fotográfico"
  | "Fotos completas, sin existencias"
  | "Listo para catálogo";

export function productPhotoStatus(input: {
  hasFront: boolean;
  hasBack: boolean;
  hasStock: boolean;
}): PhotoStatus {
  if (!input.hasFront && !input.hasBack) return "Solo stock";
  if (!(input.hasFront && input.hasBack)) return "Falta completar registro fotográfico";
  return input.hasStock ? "Listo para catálogo" : "Fotos completas, sin existencias";
}

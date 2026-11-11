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

/** Clave de comparación: sin acentos, minúsculas, solo [a-z0-9 ], singular aproximado. */
export function normalizeColorKey(raw: string): string {
  let k = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/ +/g, " ")
    .trim();
  if (k.length > 3 && k.endsWith("s")) k = k.slice(0, -1);
  if (k.length > 3 && k.endsWith("e")) k = k.slice(0, -1);
  return k;
}

export function displayColor(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ").toLowerCase();
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

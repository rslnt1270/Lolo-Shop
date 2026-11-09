import { slugify } from "./slug";

export const MAX_BRAND_LENGTH = 60;

/** Recorta y colapsa espacios internos ("  Psycho   Bunny " → "Psycho Bunny"). */
export function normalizeBrandName(raw: string): string {
  return (typeof raw === "string" ? raw : "").replace(/\s+/g, " ").trim();
}

export type BrandNameCheck =
  | { ok: true; name: string; slug: string }
  | { ok: false; message: string };

/** Normaliza el nombre y calcula el slug; rechaza vacíos, demasiado largos o sin letras ni dígitos. */
export function checkBrandName(raw: string): BrandNameCheck {
  const name = normalizeBrandName(raw);
  if (!name) return { ok: false, message: "Escribe el nombre de la marca." };
  if (name.length > MAX_BRAND_LENGTH) {
    return { ok: false, message: `La marca no puede pasar de ${MAX_BRAND_LENGTH} caracteres.` };
  }
  const slug = slugify(name);
  if (!slug) return { ok: false, message: "El nombre de la marca necesita letras o números." };
  return { ok: true, name, slug };
}

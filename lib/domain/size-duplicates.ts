import type { Product } from "./types";
import { UNIQUE_SIZE, normalizeSize, sortSizes } from "./sizes";

export interface DuplicateGroup {
  key: string;
  products: Product[];
  suggestedTargetId: string;
}

/** Tallas que se reconocen al final de un título: letras, números o "unitalla". */
const SIZE_TOKEN = "(?:xxs|xs|s|m|l|xl|xxl|xxxl|ch|g|xg|u|unitalla|\\d{1,3}(?:[.,]\\d)?)";
/**
 * Con un solo espacio ("Polo Nautica M") solo cuentan tallas de letras: "U" y "unitalla"
 * exigen " - " o " talla ", y los números sueltos ("Air Max 90", "Jordan 1", "Pack de 3",
 * "Levi's 501") son modelo o cantidad, no talla: las numéricas piden " - " o " talla ".
 */
const SPACE_SIZE_TOKEN = "(?:xxs|xs|s|m|l|xl|xxl|xxxl|ch|g|xg)";
const TRAILING_SIZE = new RegExp(
  `(?:(?:\\s+-\\s+|\\s+talla\\s+)(${SIZE_TOKEN})|\\s+(${SPACE_SIZE_TOKEN}))$`,
);

function baseTitle(title: string): string {
  return String(title ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Minúsculas, sin acentos, espacios colapsados y sin la talla final (" - M", " talla M", " M"). */
export function normalizeTitleKey(title: string): string {
  return baseTitle(title).replace(TRAILING_SIZE, "").trim();
}

/**
 * Talla escrita al final del título ("Polo - M" → "M"), ya normalizada. `null` si no hay
 * una talla reconocible o si es la talla única ("- U", "unitalla"): no aporta nada.
 */
export function trailingSize(title: string): string | null {
  const m = baseTitle(title).match(TRAILING_SIZE);
  const raw = m ? (m[1] ?? m[2]) : undefined;
  if (!raw || raw === "u" || raw === "unitalla") return null;
  return normalizeSize(raw);
}

/**
 * Título sin la talla final reconocida ("Polo - M" → "Polo"), conservando mayúsculas y acentos.
 * Si no hay talla reconocible o es la talla única, lo devuelve igual (recortado).
 */
export function stripTrailingSize(title: string): string {
  const t = String(title ?? "").trim().replace(/\s+/g, " ");
  if (trailingSize(t) === null) return t;
  const stripped = t.replace(new RegExp(TRAILING_SIZE.source, "i"), "").trim();
  return stripped || t;
}

const hasBothPhotos = (p: Product) => !!p.imageUrl && !!p.backImageUrl;
const created = (p: Product) => (p.createdAt ? Date.parse(p.createdAt) : Number.MAX_SAFE_INTEGER);

/** Producto sugerido para quedarse: el de las dos fotos y, si empatan, el más antiguo. */
function suggest(products: Product[]): string {
  return [...products].sort((a, b) => {
    const photos = Number(hasBothPhotos(b)) - Number(hasBothPhotos(a));
    if (photos !== 0) return photos;
    const age = created(a) - created(b);
    if (age !== 0) return age;
    return a.id.localeCompare(b.id);
  })[0].id;
}

/**
 * Posibles duplicados por talla: misma marca, mismo departamento (o ambos sin él) y mismo título sin la talla.
 * Solo grupos de 2 o más productos activos y sin unir.
 */
export function findSizeDuplicateGroups(products: Product[]): DuplicateGroup[] {
  const byKey = new Map<string, Product[]>();
  for (const p of products) {
    if (p.isActive === false || p.mergedIntoId) continue;
    if (!p.brandId) continue;
    const title = normalizeTitleKey(p.title);
    if (!title) continue;
    // Datos viejos sin departamento: se agrupan entre sí, nunca con los que sí tienen.
    const key = `${p.brandId}|${title}|${p.departmentId ?? "sin-departamento"}`;
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  return [...byKey]
    .filter(([, list]) => list.length >= 2)
    .map(([key, list]) => ({ key, products: list, suggestedTargetId: suggest(list) }));
}

/** Talla con la que queda una variante al unir: si es "U" y el título trae talla, la del título. */
export function sizeAfterMerge(variantSize: string, productTitle: string): string {
  return variantSize === UNIQUE_SIZE ? (trailingSize(productTitle) ?? variantSize) : variantSize;
}

/** Tallas activas que quedarían repetidas al unir estos productos, con cuántas veces (orden de exhibición). */
export function sizeClashes(products: Product[]): { size: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of products) {
    for (const v of p.variants) {
      if (v.isActive === false) continue;
      const size = sizeAfterMerge(v.size, p.title);
      counts.set(size, (counts.get(size) ?? 0) + 1);
    }
  }
  return sortSizes([...counts].filter(([, n]) => n > 1).map(([s]) => s)).map((size) => ({ size, count: counts.get(size)! }));
}

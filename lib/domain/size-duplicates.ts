import type { Product } from "./types";

export interface DuplicateGroup {
  key: string;
  products: Product[];
  suggestedTargetId: string;
}

/** Tallas que se reconocen al final de un título: letras, números o "unitalla". */
const SIZE_TOKEN = "(?:xxs|xs|s|m|l|xl|xxl|xxxl|ch|g|xg|u|unitalla|\\d{1,3}(?:[.,]\\d)?)";
const TRAILING_SIZE = new RegExp(`(?:\\s+-\\s+|\\s+talla\\s+)${SIZE_TOKEN}$`);

/** Minúsculas, sin acentos, espacios colapsados y sin la talla final (" - M", " talla M"). */
export function normalizeTitleKey(title: string): string {
  const base = String(title ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return base.replace(TRAILING_SIZE, "").trim();
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
 * Posibles duplicados por talla: misma marca, mismo departamento y mismo título sin la talla.
 * Solo grupos de 2 o más productos activos y sin unir.
 */
export function findSizeDuplicateGroups(products: Product[]): DuplicateGroup[] {
  const byKey = new Map<string, Product[]>();
  for (const p of products) {
    if (p.isActive === false || p.mergedIntoId) continue;
    if (!p.brandId || !p.departmentId) continue;
    const title = normalizeTitleKey(p.title);
    if (!title) continue;
    const key = `${p.brandId}|${title}|${p.departmentId}`;
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  return [...byKey]
    .filter(([, list]) => list.length >= 2)
    .map(([key, list]) => ({ key, products: list, suggestedTargetId: suggest(list) }));
}

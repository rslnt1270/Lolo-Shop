/** Tallas de una prenda: normalización y orden de exhibición. Puro, usable en cliente y servidor. */

export const UNIQUE_SIZE = "U";

/**
 * Rango de las tallas con letra. Internacional (XXS…XXXL) y mexicana (CH, M, G,
 * XG) comparten escala: CH≈S, G≈L, XG≈XL; los empates van alfabéticos.
 */
const LETTER_RANK: Record<string, number> = {
  XXS: 0, XS: 1, S: 2, CH: 2, M: 3, L: 4, G: 4, XL: 5, XG: 5, XXL: 6, XXXL: 7,
};

const NUMERIC_RE = /^\d+(?:[.,]\d+)?$/;

/** Recorta, colapsa espacios y pasa letras a mayúsculas; vacío → "U". */
export function normalizeSize(raw: string): string {
  const size = String(raw ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  return size || UNIQUE_SIZE;
}

function group(size: string): number {
  const s = size.toUpperCase();
  if (s === UNIQUE_SIZE) return 3;
  if (s in LETTER_RANK) return 0;
  if (NUMERIC_RE.test(s)) return 1;
  return 2;
}

/**
 * Orden de exhibición: letras (XXS…XXXL y CH, M, G, XG), luego numéricas
 * ascendentes, luego otras alfabéticas y "U" al final. No muta la entrada.
 */
export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ga = group(a);
    const gb = group(b);
    if (ga !== gb) return ga - gb;
    if (ga === 0) {
      const d = LETTER_RANK[a.toUpperCase()] - LETTER_RANK[b.toUpperCase()];
      if (d !== 0) return d;
    }
    if (ga === 1) {
      const d = Number(a.replace(",", ".")) - Number(b.replace(",", "."));
      if (d !== 0) return d;
    }
    return a.localeCompare(b, "es");
  });
}

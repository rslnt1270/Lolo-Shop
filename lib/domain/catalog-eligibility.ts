import type { Product } from "./types";

/**
 * Elegibilidad del sitio web (decisión del dueño, 2026-11-12): sin requisito de fondo blanco.
 * Elegible = foto de frente y de atrás, descripción y existencias en una tienda pública.
 * `catalogPhotosCheckedAt` es solo informativa: aquí nunca se lee.
 */
export type EligibilityGap = "FOTO_FRENTE" | "FOTO_ATRAS" | "DESCRIPCION" | "EXISTENCIAS";

export const ELIGIBILITY_GAP_TEXT: Readonly<Record<EligibilityGap, string>> = {
  FOTO_FRENTE: "Falta la foto de frente.",
  FOTO_ATRAS: "Falta la foto de atrás.",
  DESCRIPCION: "Falta la descripción.",
  EXISTENCIAS: "No hay piezas en una tienda pública.",
};

export function catalogEligibility(p: {
  imageUrl: string | null;
  backImageUrl?: string | null;
  description?: string | null;
  hasStockInPublicStore: boolean;
}): { eligible: boolean; gaps: EligibilityGap[] } {
  const gaps: EligibilityGap[] = [];
  if (!p.imageUrl) gaps.push("FOTO_FRENTE");
  if (!p.backImageUrl) gaps.push("FOTO_ATRAS");
  if (!p.description || !p.description.trim()) gaps.push("DESCRIPCION");
  if (!p.hasStockInPublicStore) gaps.push("EXISTENCIAS");
  return { eligible: gaps.length === 0, gaps };
}

/** Alguna variante activa con available > 0 en una de las tiendas dadas. */
export function hasStockInPublicStore(
  p: { variants: { isActive?: boolean; inventory: { locationId: string; available: number }[] }[] },
  storeIds: ReadonlySet<string>,
): boolean {
  return p.variants.some(
    (v) => v.isActive !== false && v.inventory.some((l) => storeIds.has(l.locationId) && l.available > 0),
  );
}

/**
 * "Por publicar": activo, sin unir, con frente y atrás, con existencias en tienda pública
 * y aún sin publicar. La descripción no es condición: si falta, la fila lo muestra como hueco.
 */
export function isPendingPublication(p: Product, storeIds: ReadonlySet<string>): boolean {
  return (
    p.isActive !== false &&
    !p.mergedIntoId &&
    !!p.imageUrl &&
    !!p.backImageUrl &&
    hasStockInPublicStore(p, storeIds) &&
    p.isPublished !== true
  );
}

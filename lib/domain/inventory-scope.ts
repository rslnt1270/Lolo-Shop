import type { InventoryLevel, Role } from "./types";

export interface InventoryViewer {
  role: Role;
  locationId: string | null;
}

/**
 * Recorte de stock por rol (decisión 4): el colaborador solo ve las filas de su
 * tienda (ninguna si no tiene tienda); owner y manager ven todo. Puras: no
 * mutan la entrada.
 */
export function scopeInventory<T extends { variants: { inventory: InventoryLevel[] }[] }>(
  product: T,
  viewer: InventoryViewer,
): T {
  if (viewer.role !== "collaborator") return product;
  return { ...product, variants: product.variants.map((v) => scopeVariant(v, viewer)) };
}

function scopeVariant<V extends { inventory: InventoryLevel[] }>(variant: V, viewer: InventoryViewer): V {
  if (viewer.role !== "collaborator") return variant;
  return {
    ...variant,
    inventory: viewer.locationId ? variant.inventory.filter((l) => l.locationId === viewer.locationId) : [],
  };
}

export function scopeVariantMatch<
  M extends { product: { variants: { inventory: InventoryLevel[] }[] }; variant: { inventory: InventoryLevel[] } },
>(match: M, viewer: InventoryViewer): M {
  if (viewer.role !== "collaborator") return match;
  return { ...match, product: scopeInventory(match.product, viewer), variant: scopeVariant(match.variant, viewer) };
}

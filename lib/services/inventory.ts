import type { Product, Variant } from "@/lib/domain/types";

export interface LowStockEntry {
  product: Product;
  variant: Variant;
  available: number;
}

export function variantStock(variant: Variant, locationId?: string): number {
  return variant.inventory
    .filter((lvl) => !locationId || lvl.locationId === locationId)
    .reduce((sum, lvl) => sum + lvl.available, 0);
}

export function productStock(product: Product, locationId?: string): number {
  return product.variants.reduce(
    (sum, v) => sum + variantStock(v, locationId),
    0
  );
}

export function lowStockVariants(
  products: Product[],
  threshold: number,
  locationId?: string
): LowStockEntry[] {
  const result: LowStockEntry[] = [];
  for (const product of products) {
    for (const variant of product.variants) {
      const available = variantStock(variant, locationId);
      if (available <= threshold) {
        result.push({ product, variant, available });
      }
    }
  }
  return result;
}

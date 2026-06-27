import type { Location, Product } from "@/lib/domain/types";
import type { InventoryDataSource, VariantMatch } from "./source";
import { fixtureLocations, fixtureProducts } from "./fixtures";

export class FixtureDataSource implements InventoryDataSource {
  async getLocations(): Promise<Location[]> {
    return fixtureLocations;
  }

  async getProducts(): Promise<Product[]> {
    return fixtureProducts;
  }

  async getProductByVariantId(variantId: string): Promise<VariantMatch | null> {
    for (const product of fixtureProducts) {
      const variant = product.variants.find((v) => v.id === variantId);
      if (variant) return { product, variant };
    }
    return null;
  }
}

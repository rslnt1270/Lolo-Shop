import type { Location, Product } from "@/lib/domain/types";
import type { InventoryDataSource, VariantMatch, CreateProductData } from "./source";
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

  async getProductByBarcode(barcode: string): Promise<VariantMatch | null> {
    for (const product of fixtureProducts) {
      const variant = product.variants.find((v) => v.barcode === barcode);
      if (variant) return { product, variant };
    }
    return null;
  }

  async adjustInventory(variantId: string, locationId: string, delta: number): Promise<void> {
    const match = await this.getProductByVariantId(variantId);
    if (!match) throw new Error("Variante no encontrada");
    
    let level = match.variant.inventory.find(l => l.locationId === locationId);
    if (!level) {
      level = { locationId, available: 0 };
      match.variant.inventory.push(level);
    }
    level.available = Math.max(0, level.available + delta);
  }

  async createProduct(data: CreateProductData): Promise<VariantMatch> {
    const sku = data.sku || `SKU-${Date.now()}`;
    const newVariant = {
      id: `var-${Date.now()}`,
      productId: `prod-${Date.now()}`,
      title: data.title,
      sku: sku,
      barcode: data.barcode,
      price: data.price,
      inventory: [
        {
          locationId: data.locationId,
          available: 1
        }
      ]
    };

    const newProduct: Product = {
      id: newVariant.productId,
      title: data.title,
      category: "Uncategorized",
      brand: data.brand,
      imageUrl: null,
      variants: [newVariant as any] // Quick fix to bypass Variant type mismatch in fixtures
    };

    fixtureProducts.push(newProduct);

    return {
      product: newProduct,
      variant: newVariant as any
    };
  }
}

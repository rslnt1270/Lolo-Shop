import type { Location, Product, Variant } from "@/lib/domain/types";

export interface VariantMatch {
  product: Product;
  variant: Variant;
}

export interface CreateProductData {
  barcode: string;
  title: string;
  brand: string;
  price: number;
  sku?: string;
  locationId: string;
  imageUrl?: string;
}

export interface InventoryDataSource {
  getLocations(): Promise<Location[]>;
  getProducts(): Promise<Product[]>;
  getProductByVariantId(variantId: string): Promise<VariantMatch | null>;
  getProductByBarcode(barcode: string): Promise<VariantMatch | null>;
  adjustInventory(variantId: string, locationId: string, delta: number, userId?: string): Promise<void>;
  createProduct(data: CreateProductData): Promise<VariantMatch>;
}

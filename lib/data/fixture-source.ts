import type { Location, Product, Variant } from "@/lib/domain/types";
import type { InventoryDataSource, VariantMatch, CreateProductData, CreateLocationData } from "./source";
import { fixtureLocations, fixtureProducts } from "./fixtures";
import { codeCandidates } from "@/lib/domain/barcode";
import { DEFAULT_SIZE } from "@/lib/domain/new-product";
import { UniqueConstraintError } from "./errors";

function cloneProducts(products: Product[]): Product[] {
  return products.map((p) => ({
    ...p,
    variants: p.variants.map((v) => ({ ...v, inventory: v.inventory.map((l) => ({ ...l })) })),
  }));
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++seq}`;

/** Doble de prueba en memoria: cada instancia tiene su propia copia del estado. */
export class FixtureDataSource implements InventoryDataSource {
  private locations: Location[] = fixtureLocations.map((l) => ({ ...l }));
  private products: Product[] = cloneProducts(fixtureProducts);
  private publicCodes = new Set<string>();

  async getLocations(): Promise<Location[]> {
    return this.locations;
  }

  async createLocation(data: CreateLocationData): Promise<Location> {
    const name = data.name.trim();
    if (!name) throw new Error("El nombre de la tienda es obligatorio.");
    const loc: Location = { id: nextId("loc"), name, type: data.type ?? "store" };
    this.locations = [...this.locations, loc];
    return loc;
  }

  async getProducts(): Promise<Product[]> {
    return this.products;
  }

  async getProductByVariantId(variantId: string): Promise<VariantMatch | null> {
    for (const product of this.products) {
      const variant = product.variants.find((v) => v.id === variantId);
      if (variant) return { product, variant };
    }
    return null;
  }

  async getProductByBarcode(code: string): Promise<VariantMatch | null> {
    // Igual que Prisma: comparación sin mayúsculas (los numéricos no cambian).
    const candidates = codeCandidates(code).map((c) => c.toUpperCase());
    if (candidates.length === 0) return null;
    for (const product of this.products) {
      const variant = product.variants.find(
        (v) =>
          (v.barcode !== null && candidates.includes(v.barcode.toUpperCase())) ||
          candidates.includes(v.sku.toUpperCase()),
      );
      if (variant) return { product, variant };
    }
    return null;
  }

  async adjustInventory(variantId: string, locationId: string, delta: number): Promise<void> {
    const match = await this.getProductByVariantId(variantId);
    if (!match) throw new Error("Variante no encontrada");

    let level = match.variant.inventory.find((l) => l.locationId === locationId);
    if (!level) {
      level = { locationId, available: 0 };
      match.variant.inventory.push(level);
    }
    level.available = Math.max(0, level.available + delta);
  }

  async createProduct(data: CreateProductData): Promise<VariantMatch> {
    const variants = this.products.flatMap((p) => p.variants);
    if (data.barcode !== null && variants.some((v) => v.barcode === data.barcode)) {
      throw new UniqueConstraintError("barcode");
    }
    if (variants.some((v) => v.sku === data.sku)) {
      throw new UniqueConstraintError("sku");
    }
    if (this.publicCodes.has(data.publicCode)) {
      throw new UniqueConstraintError("publicCode");
    }
    this.publicCodes.add(data.publicCode);

    const productId = nextId("prod");
    const variant: Variant = {
      id: nextId("var"),
      title: data.title,
      sku: data.sku,
      barcode: data.barcode,
      size: data.size?.trim() || DEFAULT_SIZE,
      color: "General",
      price: data.price,
      inventory: [{ locationId: data.locationId, available: data.initialStock }],
    };
    const product: Product = {
      id: productId,
      title: data.title,
      category: data.category,
      brand: data.brand,
      imageUrl: data.imageUrl ?? null,
      publicCode: data.publicCode,
      variants: [variant],
    };
    this.products = [...this.products, product];
    return { product, variant };
  }

  async updateProductImage(productId: string, imageUrl: string): Promise<void> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) throw new Error("Producto no encontrado");
    product.imageUrl = imageUrl;
  }
}

import type { Location, Product, Variant } from "@/lib/domain/types";
import {
  MAX_SEARCH_RESULTS,
  type AddVariantData, type CreatedProduct, type CreateLocationData, type CreateProductData, type InventoryDataSource,
  type PriceChangeEntry, type ProductPatch, type ProductSearchHit, type RecordStockMovementData,
  type UpdateVariantPriceResult, type VariantMatch,
} from "./source";
import { fixtureLocations, fixtureProducts } from "./fixtures";
import { canonicalCode, codeCandidates } from "@/lib/domain/barcode";
import { normalizeSize, sortSizes } from "@/lib/domain/sizes";
import { normalizePublicCode } from "@/lib/domain/public-code";
import {
  InsufficientStockError, InventoryRuleError, ProductNotFoundError, StockTargetNotFoundError, UniqueConstraintError,
} from "./errors";

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
  /** Registro en memoria de los movimientos de stock (lo reutilizan las pruebas de otras tareas). */
  readonly movements: RecordStockMovementData[] = [];
  /** Historial de precios en memoria; `userName` es el id del usuario (el doble no tiene usuarios). */
  private readonly priceChanges: (PriceChangeEntry & { variantId: string })[] = [];

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

  async recordStockMovement(data: RecordStockMovementData): Promise<{ available: number; replayed: boolean }> {
    const { variantId, locationId, type, delta, notes, requestId, userId } = data;
    if (!Number.isInteger(delta) || delta === 0) {
      throw new Error("El movimiento de stock debe ser un entero distinto de cero.");
    }
    const match = await this.getProductByVariantId(variantId);
    if (!match) throw new StockTargetNotFoundError();
    if (!this.locations.some((l) => l.id === locationId)) throw new StockTargetNotFoundError();

    const level = match.variant.inventory.find((l) => l.locationId === locationId);
    if (this.movements.some((m) => m.requestId === requestId)) {
      return { available: level?.available ?? 0, replayed: true };
    }

    const current = level?.available ?? 0;
    if (delta < 0 && current < -delta) {
      // Sin fila o sin piezas suficientes: no se crea fila ni Movement.
      throw new InsufficientStockError(variantId, current, -delta);
    }
    if (level) {
      level.available += delta;
    } else {
      match.variant.inventory.push({ locationId, available: delta });
    }
    this.movements.push({ variantId, locationId, type, delta, notes, requestId, userId });
    return { available: current + delta, replayed: false };
  }

  /** Mismas reglas de unicidad que Prisma: barcode y sku únicos en toda la base (también dentro del envío). */
  private assertUnique(rows: { sku: string; barcode: string | null }[]): void {
    const existing = this.products.flatMap((p) => p.variants);
    const barcodes = new Set(existing.flatMap((v) => (v.barcode === null ? [] : [v.barcode.toUpperCase()])));
    const skus = new Set(existing.map((v) => v.sku));
    for (const r of rows) {
      if (r.barcode !== null) {
        if (barcodes.has(r.barcode.toUpperCase())) throw new UniqueConstraintError("barcode");
        barcodes.add(r.barcode.toUpperCase());
      }
      if (skus.has(r.sku)) throw new UniqueConstraintError("sku");
      skus.add(r.sku);
    }
  }

  private newVariant(r: { sku: string; barcode: string | null; size: string; price: number; initialStock: number }, locationId: string): Variant {
    return {
      id: nextId("var"),
      title: r.size,
      sku: r.sku,
      barcode: r.barcode,
      size: r.size,
      color: "General",
      price: r.price,
      isActive: true,
      inventory: [{ locationId, available: r.initialStock }],
    };
  }

  private recordAlta(variantId: string, locationId: string, userId: string, delta: number): void {
    if (delta <= 0) return;
    this.movements.push({ variantId, locationId, type: "RESTOCK", delta, notes: "alta", requestId: nextId("alta"), userId });
  }

  async createProduct(data: CreateProductData): Promise<CreatedProduct> {
    const rows = data.variants.map((v) => ({
      ...v,
      barcode: v.barcode === null ? null : canonicalCode(v.barcode),
      size: normalizeSize(v.size),
    }));
    // Todo o nada, como la transacción de Prisma: se valida antes de escribir.
    this.assertUnique(rows);
    if (this.publicCodes.has(data.publicCode)) {
      throw new UniqueConstraintError("publicCode");
    }
    this.publicCodes.add(data.publicCode);

    const variants = rows.map((r) => this.newVariant(r, data.locationId));
    const product: Product = {
      id: nextId("prod"),
      title: data.title,
      category: data.category,
      brand: data.brand,
      brandId: data.brandId,
      departmentId: data.departmentId,
      imageUrl: data.imageUrl ?? null,
      backImageUrl: data.backImageUrl ?? null,
      description: data.description ?? null,
      publicCode: data.publicCode,
      isActive: true,
      mergedIntoId: null,
      createdAt: new Date().toISOString(),
      variants,
    };
    this.products = [...this.products, product];
    rows.forEach((r, i) => this.recordAlta(variants[i].id, data.locationId, data.userId, r.initialStock));
    return { product, variants };
  }

  async addVariant(data: AddVariantData): Promise<VariantMatch> {
    const product = this.products.find((p) => p.id === data.productId);
    if (!product) throw new InventoryRuleError("El producto ya no existe. Búscalo de nuevo.");
    if (product.isActive === false || product.mergedIntoId) {
      throw new InventoryRuleError("Ese producto ya no está activo o se unió con otro. Búscalo de nuevo.");
    }
    const size = normalizeSize(data.size);
    const barcode = data.barcode === null ? null : canonicalCode(data.barcode);
    if (barcode === null && product.variants.some((v) => v.isActive !== false && v.size.toUpperCase() === size)) {
      throw new InventoryRuleError("Esa talla ya existe: suma piezas con Entrada");
    }
    this.assertUnique([{ sku: data.sku, barcode }]);
    const variant = this.newVariant({ ...data, size, barcode }, data.locationId);
    product.variants.push(variant);
    this.recordAlta(variant.id, data.locationId, data.userId, data.initialStock);
    return { product, variant };
  }

  async searchProducts(query: string): Promise<ProductSearchHit[]> {
    const q = String(query ?? "").trim().slice(0, 80);
    if (!q) return [];
    const live = this.products.filter((p) => p.isActive !== false && !p.mergedIntoId);
    // Igual que Prisma: primero el código público exacto, luego título o marca (más recientes primero) hasta 8.
    const code = normalizePublicCode(q);
    const exact = code ? live.find((p) => p.publicCode === code) : undefined;
    const needle = q.toLowerCase();
    const rest = live
      .filter((p) => p !== exact && (p.title.toLowerCase().includes(needle) || p.brand.toLowerCase().includes(needle)))
      .reverse()
      .slice(0, MAX_SEARCH_RESULTS - (exact ? 1 : 0));
    return [...(exact ? [exact] : []), ...rest].map((p) => ({
      productId: p.id,
      title: p.title,
      brand: p.brand,
      publicCode: p.publicCode ?? null,
      imageUrl: p.imageUrl,
      sizes: sortSizes([...new Set(p.variants.filter((v) => v.isActive !== false).map((v) => v.size))]),
    }));
  }

  async updateVariantPrice(
    variantId: string,
    expectedPrice: number,
    newPrice: number,
    userId: string,
    reason: string | null,
  ): Promise<UpdateVariantPriceResult> {
    void reason;
    const match = await this.getProductByVariantId(variantId);
    if (!match) throw new ProductNotFoundError("La talla ya no existe.");
    if (Math.round(match.variant.price * 100) !== Math.round(expectedPrice * 100)) {
      return { ok: false, currentPrice: match.variant.price };
    }
    const oldPrice = match.variant.price;
    match.variant.price = newPrice;
    this.priceChanges.push({ variantId, oldPrice, newPrice, userName: userId, createdAt: new Date().toISOString() });
    return { ok: true, price: newPrice };
  }

  async listPriceChanges(variantId: string, limit: number): Promise<PriceChangeEntry[]> {
    return this.priceChanges
      .filter((c) => c.variantId === variantId)
      .reverse()
      .slice(0, limit)
      .map(({ oldPrice, newPrice, userName, createdAt }) => ({ oldPrice, newPrice, userName, createdAt }));
  }

  async updateProduct(productId: string, patch: ProductPatch): Promise<void> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) throw new ProductNotFoundError();
    if (patch.title !== undefined) product.title = patch.title;
    if (patch.category !== undefined) product.category = patch.category;
    if (patch.brandId !== undefined) {
      product.brandId = patch.brandId;
      if (patch.brand !== undefined) product.brand = patch.brand;
    }
    if (patch.departmentId !== undefined) product.departmentId = patch.departmentId;
  }

  async setProductActive(productId: string, active: boolean): Promise<void> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) throw new ProductNotFoundError();
    if (active && product.mergedIntoId) {
      throw new InventoryRuleError("Este producto se unió con otro y no se puede reactivar.");
    }
    product.isActive = active;
  }

  async setVariantActive(variantId: string, active: boolean): Promise<void> {
    const match = await this.getProductByVariantId(variantId);
    if (!match) throw new ProductNotFoundError("La talla ya no existe.");
    if (
      active &&
      match.product.variants.some(
        (v) => v.id !== variantId && v.isActive !== false && v.size.toUpperCase() === match.variant.size.toUpperCase(),
      )
    ) {
      throw new InventoryRuleError("Ya hay otra talla activa con esa talla. Desactívala primero.");
    }
    match.variant.isActive = active;
  }

  async assignDepartment(productIds: string[], departmentId: string): Promise<number> {
    const ids = new Set(productIds);
    let count = 0;
    for (const p of this.products) {
      if (!ids.has(p.id)) continue;
      p.departmentId = departmentId;
      count++;
    }
    return count;
  }

  async updateProductImage(productId: string, imageUrl: string): Promise<void> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) throw new Error("Producto no encontrado");
    product.imageUrl = imageUrl;
  }

  async updateProductBackImage(productId: string, backImageUrl: string): Promise<void> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) throw new Error("Producto no encontrado");
    product.backImageUrl = backImageUrl;
  }
}

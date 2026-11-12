import type { Location, Product, Variant } from "@/lib/domain/types";
import {
  MAX_SEARCH_RESULTS,
  type AddVariantData, type CreatedProduct, type CreateLocationData, type CreateProductData, type InventoryDataSource, type MergeProductsResult,
  type AssignProductTypeResult, type StockByTypeRow,
  type PriceChangeEntry, type ProductPatch, type ProductSearchHit, type RecordStockMovementData,
  type UpdateVariantPriceResult, type VariantMatch, type StockAt, type VariantStockRow,
  MOVEMENT_PAGE_SIZE, type MovementPage, type MovementQuery, type MovementRow,
} from "./source";
import { MOVEMENT_TYPE_LABEL } from "@/lib/domain/types";
import { mexicoRangeToUtc } from "@/lib/domain/movement-scope";
import {
  FIXTURE_DEPARTMENTS, FIXTURE_DEPARTMENT_PRODUCT_TYPES, FIXTURE_PRODUCT_TYPES, fixtureLocations, fixtureProducts,
} from "./fixtures";
import { isAudience } from "@/lib/domain/product-taxonomy";
import { canonicalCode, codeCandidates } from "@/lib/domain/barcode";
import { UNIQUE_SIZE, normalizeSize, sortSizes } from "@/lib/domain/sizes";
import { stripTrailingSize, trailingSize } from "@/lib/domain/size-duplicates";
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

/** Departamento del doble por id; los ids desconocidos (p. ej. `dept-hombre`) quedan sin departamento. */
function departmentFor(id: string | null | undefined): Product["department"] {
  const d = FIXTURE_DEPARTMENTS.find((x) => x.id === id);
  return d ? { slug: d.slug, name: d.name, sortOrder: d.sortOrder, isActive: d.isActive } : null;
}

/** Movimiento del registro en memoria, con id y hora para el historial. */
export type FixtureMovement = RecordStockMovementData & { id: string; timestamp: Date; saleNumber?: number | null };

let seq = 0;
let movementSeq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++seq}`;

/** Doble de prueba en memoria: cada instancia tiene su propia copia del estado. */
export class FixtureDataSource implements InventoryDataSource {
  private locations: Location[] = fixtureLocations.map((l) => ({ ...l }));
  private products: Product[] = cloneProducts(fixtureProducts);
  private publicCodes = new Set<string>();
  /** Registro en memoria de los movimientos de stock (lo reutilizan las pruebas de otras tareas). */
  readonly movements: FixtureMovement[] = [];
  /** Historial de precios en memoria; `userName` es el id del usuario (el doble no tiene usuarios). */
  private readonly priceChanges: (PriceChangeEntry & { variantId: string })[] = [];

  /** Agrega al registro con id creciente (el desempate de `listMovements`) y la hora actual. */
  private log(...entries: RecordStockMovementData[]): void {
    for (const e of entries) {
      this.movements.push({ ...e, id: String(++movementSeq).padStart(10, "0"), timestamp: new Date() });
    }
  }

  async listMovements(q: MovementQuery): Promise<MovementPage> {
    const { gte, lt } = mexicoRangeToUtc(q.from, q.to);
    const sorted = this.movements
      .filter(
        (m) =>
          m.timestamp >= gte &&
          m.timestamp < lt &&
          (q.locationIds === "all" || q.locationIds.includes(m.locationId)) &&
          (!q.type || m.type === q.type) &&
          (!q.userId || m.userId === q.userId) &&
          (!q.variantId || m.variantId === q.variantId),
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime() || (a.id < b.id ? 1 : -1));
    const start = q.cursor ? sorted.findIndex((m) => m.id === q.cursor) + 1 : 0;
    const slice = sorted.slice(start, start + MOVEMENT_PAGE_SIZE + 1);
    const hasMore = slice.length > MOVEMENT_PAGE_SIZE;
    const page = hasMore ? slice.slice(0, MOVEMENT_PAGE_SIZE) : slice;
    const rows: MovementRow[] = page.map((m) => {
      const match = this.products.flatMap((p) => p.variants.map((v) => ({ p, v }))).find((x) => x.v.id === m.variantId);
      return {
        id: m.id,
        timestamp: m.timestamp.toISOString(),
        productTitle: match?.p.title ?? "",
        size: match?.v.size ?? "",
        locationName: this.locations.find((l) => l.id === m.locationId)?.name ?? "",
        type: m.type,
        typeLabel: MOVEMENT_TYPE_LABEL[m.type],
        delta: m.delta,
        userName: m.userId, // el doble no tiene usuarios
        notes: m.notes,
        saleNumber: m.saleNumber ?? null,
      };
    });
    return { rows, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  async listMovementActors(): Promise<{ id: string; name: string }[]> {
    return [...new Set(this.movements.map((m) => m.userId))].map((id) => ({ id, name: id }));
  }

  async getLocations(): Promise<Location[]> {
    return this.locations;
  }

  async createLocation(data: CreateLocationData): Promise<Location> {
    const name = data.name.trim();
    if (!name) throw new Error("El nombre de la tienda es obligatorio.");
    const loc: Location = { id: nextId("loc"), name, type: data.type ?? "store", isPublic: true };
    this.locations = [...this.locations, loc];
    return loc;
  }

  async getProducts(): Promise<Product[]> {
    return this.products;
  }

  async getCatalogProducts(): Promise<Product[]> {
    return this.products
      .filter((p) => p.isActive !== false && !p.mergedIntoId && p.isPublished === true && !!p.imageUrl && !!p.backImageUrl)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  async getProductByVariantId(variantId: string): Promise<VariantMatch | null> {
    for (const product of this.products) {
      const variant = product.variants.find((v) => v.id === variantId);
      if (variant) return { product, variant };
    }
    return null;
  }

  async getStockAt(variantId: string, locationId: string): Promise<StockAt> {
    const match = await this.getProductByVariantId(variantId);
    const level = match?.variant.inventory.find((l) => l.locationId === locationId);
    return { available: level?.available ?? 0, sold: false };
  }

  async listVariantStockAt(productId: string, locationId: string): Promise<VariantStockRow[]> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) return [];
    const rows = product.variants
      .filter((v) => v.isActive !== false)
      .map((v) => ({
        variantId: v.id,
        size: v.size,
        sku: v.sku,
        price: v.price,
        available: v.inventory.find((l) => l.locationId === locationId)?.available ?? 0,
      }));
    const order = sortSizes(rows.map((r) => r.size));
    return rows.sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size));
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
    this.log({ variantId, locationId, type, delta, notes, requestId, userId });
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
    this.log({ variantId, locationId, type: "RESTOCK", delta, notes: "alta", requestId: nextId("alta"), userId });
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
      department: departmentFor(data.departmentId),
      productTypeId: data.productTypeId ?? null,
      style: data.style ?? null,
      audience: data.audience ?? null,
      imageUrl: data.imageUrl ?? null,
      backImageUrl: data.backImageUrl ?? null,
      description: data.description ?? null,
      color: data.color ?? null,
      isPublished: false,
      catalogPhotosCheckedAt:
        data.photosChecked && data.imageUrl && data.backImageUrl ? new Date().toISOString() : null,
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
    if (patch.productTypeId !== undefined) product.productTypeId = patch.productTypeId;
    if (patch.style !== undefined) product.style = patch.style;
    if (patch.audience !== undefined) product.audience = patch.audience;
    if (patch.brandId !== undefined) {
      product.brandId = patch.brandId;
      if (patch.brand !== undefined) product.brand = patch.brand;
    }
    if (patch.departmentId !== undefined) {
      product.departmentId = patch.departmentId;
      product.department = departmentFor(patch.departmentId);
    }
  }

  async setProductActive(productId: string, active: boolean): Promise<void> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) throw new ProductNotFoundError();
    if (active && product.mergedIntoId) {
      throw new InventoryRuleError("Este producto se unió con otro y no se puede reactivar.");
    }
    product.isActive = active;
    if (!active) product.isPublished = false;
  }

  async setProductPublished(productId: string, published: boolean): Promise<void> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) throw new ProductNotFoundError();
    product.isPublished = published;
  }

  async getProductForPublish(productId: string): Promise<Product | null> {
    const p = this.products.find((x) => x.id === productId);
    return p && p.isActive !== false && !p.mergedIntoId ? p : null;
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
      p.department = departmentFor(departmentId);
      count++;
    }
    return count;
  }

  async assignProductType(
    productIds: string[],
    data: { productTypeId: string; category: string; allowedStyles: readonly string[] },
  ): Promise<AssignProductTypeResult> {
    const ids = new Set(productIds);
    const found = this.products.filter((p) => ids.has(p.id));
    const allowedDepts = new Set(
      FIXTURE_DEPARTMENT_PRODUCT_TYPES.filter((x) => x.productTypeId === data.productTypeId).map((x) => x.departmentId),
    );
    const invalid = found.filter((p) => p.departmentId && !allowedDepts.has(p.departmentId)).length;
    if (invalid > 0) {
      throw new InventoryRuleError(
        `«${data.category}» no aplica a ${invalid} de los productos elegidos. Quítalos de la selección.`,
      );
    }
    let styleCleared = 0;
    for (const p of found) {
      p.productTypeId = data.productTypeId;
      p.category = data.category;
      if (p.style && !data.allowedStyles.includes(p.style)) {
        p.style = null;
        styleCleared++;
      }
    }
    return { updated: found.length, styleCleared };
  }

  async getStockByType(filter: { locationId?: string | null }): Promise<StockByTypeRow[]> {
    const groups = new Map<string, StockByTypeRow & { _ids: Set<string> }>();
    for (const p of this.products) {
      if (p.isActive === false || p.mergedIntoId) continue;
      const dept = FIXTURE_DEPARTMENTS.find((d) => d.id === p.departmentId);
      const type = FIXTURE_PRODUCT_TYPES.find((t) => t.id === p.productTypeId);
      const audience = isAudience(p.audience) ? p.audience : null;
      for (const v of p.variants) {
        if (v.isActive === false) continue;
        for (const level of v.inventory) {
          if (filter.locationId && level.locationId !== filter.locationId) continue;
          const loc = this.locations.find((l) => l.id === level.locationId);
          if (!loc) continue;
          const key = [p.departmentId ?? "", p.productTypeId ?? "", audience ?? "", level.locationId].join("|");
          let g = groups.get(key);
          if (!g) {
            g = {
              departmentId: dept ? dept.id : (p.departmentId ?? null),
              departmentName: dept?.name ?? "Sin departamento",
              productTypeId: p.productTypeId ?? null,
              typeName: type?.name ?? "Sin tipo",
              typeActive: type?.isActive ?? true,
              audience,
              locationId: level.locationId,
              locationName: loc.name,
              pieces: 0,
              products: 0,
              _ids: new Set(),
            };
            groups.set(key, g);
          }
          g.pieces += level.available;
          if (level.available > 0) g._ids.add(p.id);
        }
      }
    }
    const order = (x: number | undefined) => x ?? Number.POSITIVE_INFINITY;
    return [...groups.values()]
      .filter((g) => g.pieces > 0)
      .map(({ _ids, ...row }) => ({ ...row, products: _ids.size }))
      .sort((a, b) => {
        const da = order(FIXTURE_DEPARTMENTS.find((d) => d.id === a.departmentId)?.sortOrder);
        const db = order(FIXTURE_DEPARTMENTS.find((d) => d.id === b.departmentId)?.sortOrder);
        const ta = order(FIXTURE_PRODUCT_TYPES.find((t) => t.id === a.productTypeId)?.sortOrder);
        const tb = order(FIXTURE_PRODUCT_TYPES.find((t) => t.id === b.productTypeId)?.sortOrder);
        return (
          da - db ||
          ta - tb ||
          (a.audience ?? "").localeCompare(b.audience ?? "") ||
          (a.locationName < b.locationName ? -1 : a.locationName > b.locationName ? 1 : 0)
        );
      });
  }

  async mergeProducts(targetId: string, sourceIds: string[], userId: string): Promise<MergeProductsResult> {
    const sources = [...new Set(sourceIds)];
    if (sources.length === 0) throw new InventoryRuleError("Elige al menos un producto para unir.");
    if (sources.includes(targetId)) throw new InventoryRuleError("El producto que se queda no puede ser también uno de los que se unen.");
    const target = this.products.find((p) => p.id === targetId);
    const found = sources.map((id) => this.products.find((p) => p.id === id));
    if (!target || found.some((p) => !p)) throw new InventoryRuleError("Alguno de los productos ya no existe. Actualiza la pantalla.");
    if (target.isActive === false || target.mergedIntoId) {
      throw new InventoryRuleError("El producto que se queda ya no está activo o se unió con otro.");
    }
    if (!target.brandId) throw new InventoryRuleError("El producto que se queda no tiene marca.");

    let alreadyMerged = 0;
    const toMove: Product[] = [];
    for (const src of found as Product[]) {
      if (src.mergedIntoId === targetId) {
        alreadyMerged++;
        continue;
      }
      if (src.mergedIntoId) throw new InventoryRuleError("Uno de los productos ya se unió con otro distinto.");
      if (src.brandId !== target.brandId) throw new InventoryRuleError("Solo se pueden unir productos de la misma marca.");
      toMove.push(src);
    }
    let movedVariants = 0;
    const moveIds = new Set(toMove.map((p) => p.id));
    if (toMove.length > 0 && (!target.imageUrl || !target.backImageUrl)) {
      const donor = toMove.find((s) => s.imageUrl && s.backImageUrl);
      if (donor) {
        target.imageUrl = donor.imageUrl;
        target.backImageUrl = donor.backImageUrl;
      }
    }
    for (const p of this.products) {
      if (p.mergedIntoId && moveIds.has(p.mergedIntoId)) p.mergedIntoId = targetId;
    }
    if (toMove.length > 0) {
      // Igual que Prisma: las variantes "U" toman la talla escrita al final del título de su producto.
      for (const p of [target, ...toMove]) {
        const size = trailingSize(p.title);
        if (!size) continue;
        for (const v of p.variants) {
          if (v.size === UNIQUE_SIZE) {
            v.size = size;
            v.title = size;
          }
        }
      }
    }
    if (toMove.length > 0) target.title = stripTrailingSize(target.title);
    for (const src of toMove) {
      movedVariants += src.variants.length;
      target.variants.push(...src.variants);
      src.variants = [];
      src.isActive = false;
      src.isPublished = false;
      src.mergedIntoId = targetId;
    }
    void userId;
    // El doble no guarda ventas: no hay renglones que mover.
    return { movedVariants, movedSaleLines: 0, alreadyMerged };
  }

  async getProductByPublicCode(code: string): Promise<Product | null> {
    const products = await this.getProducts();
    let p = products.find((x) => x.publicCode === code) ?? null;
    if (p?.mergedIntoId) p = products.find((x) => x.id === p!.mergedIntoId) ?? null;
    return p;
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

  async setCatalogPhotos(productId: string, photos: { imageUrl: string; backImageUrl: string }): Promise<void> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) throw new Error("Producto no encontrado");
    product.imageUrl = photos.imageUrl;
    product.backImageUrl = photos.backImageUrl;
    product.catalogPhotosCheckedAt = new Date().toISOString();
  }
}

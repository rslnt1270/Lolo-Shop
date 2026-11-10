import type { Location, LocationType, Product, Variant } from "@/lib/domain/types";

export interface VariantMatch {
  product: Product;
  variant: Variant;
}

/** Una variante (talla) del alta. */
export interface CreateVariantData {
  /** SKU interno generado en el servidor (`generateInternalSku`). */
  sku: string;
  /** Código de la etiqueta; el data source lo guarda canónico (mayúsculas). Null = sin código. */
  barcode: string | null;
  /** Talla normalizada; también es el `Variant.title`. */
  size: string;
  price: number;
  /** Piezas contadas en `locationId` (0 si aún no se cuentan). */
  initialStock: number;
}

export interface CreateProductData {
  title: string;
  /** Nombre canónico de la marca (se sigue guardando en `Product.brand` durante la transición, ER §2.3). */
  brand: string;
  brandId: string;
  departmentId: string;
  /** Código público corto (`generatePublicCode`); único, el llamador reintenta ante P2002. */
  publicCode: string;
  category: string;
  /** Una por talla (1 a 12); sustituye barcode, sku, price, size e initialStock sueltos. */
  variants: CreateVariantData[];
  locationId: string;
  imageUrl?: string | null;
  backImageUrl?: string | null;
  description?: string | null;
  /** Usuario que da de alta; queda en el Movement RESTOCK de cada talla con piezas. */
  userId: string;
}

export interface CreatedProduct {
  /** El producto con sus variantes recién creadas. */
  product: Product;
  /** Las variantes en el orden de `CreateProductData.variants`. */
  variants: Variant[];
}

export interface AddVariantData {
  productId: string;
  sku: string;
  size: string;
  barcode: string | null;
  price: number;
  initialStock: number;
  locationId: string;
  userId: string;
}

/** Resultado de la búsqueda interna de productos (staff): sin SKU, códigos de barras ni conteos. */
export interface ProductSearchHit {
  productId: string;
  title: string;
  brand: string;
  publicCode: string | null;
  /** Foto de frente. */
  imageUrl: string | null;
  /** Tallas activas, sin repetir y en orden de `sortSizes`. */
  sizes: string[];
}

/** Máximo de resultados de `searchProducts`. */
export const MAX_SEARCH_RESULTS = 8;

export interface CreateLocationData {
  name: string;
  type?: LocationType;
}

export type StockMovementType = "RESTOCK" | "DAMAGE" | "ADJUSTMENT";

export interface RecordStockMovementData {
  variantId: string;
  locationId: string;
  type: StockMovementType;
  /** Con signo: positivo suma, negativo resta. Nunca 0. */
  delta: number;
  notes: string | null;
  /** UUID de idempotencia: repetirlo no duplica el movimiento. */
  requestId: string;
  userId: string;
}

/** Una entrada del historial de precios de una talla. */
export interface PriceChangeEntry {
  oldPrice: number;
  newPrice: number;
  /** Nombre del usuario que cambió el precio (o su usuario si no tiene nombre). */
  userName: string;
  /** ISO. */
  createdAt: string;
}

export type UpdateVariantPriceResult = { ok: true; price: number } | { ok: false; currentPrice: number };

/** Campos editables de un producto; `publicCode` no se puede cambiar. */
export interface ProductPatch {
  title?: string;
  /** Con `brandId`, el nombre canónico (se sigue guardando en `Product.brand`). */
  brandId?: string;
  brand?: string;
  departmentId?: string;
  category?: string;
}

/** Lo que movió una unión de productos. */
export interface MergeProductsResult {
  movedVariants: number;
  movedSaleLines: number;
  /** Orígenes que ya estaban unidos a este destino (la unión es idempotente). */
  alreadyMerged: number;
}

export interface InventoryDataSource {
  getLocations(): Promise<Location[]>;
  createLocation(data: CreateLocationData): Promise<Location>;
  getProducts(): Promise<Product[]>;
  getProductByVariantId(variantId: string): Promise<VariantMatch | null>;
  /**
   * Busca una variante cuyo barcode O sku coincida con alguno de los
   * candidatos de `codeCandidates(code)` (UPC-A ↔ EAN-13, mayúsculas).
   */
  getProductByBarcode(code: string): Promise<VariantMatch | null>;
  /**
   * Movimiento de stock atómico con `Movement` tipado. Una salida que deja el
   * stock en negativo (o sin fila de inventario) lanza `InsufficientStockError`
   * y no escribe nada. Un `requestId` ya registrado devuelve `replayed: true`
   * con el stock actual, sin aplicar el cambio otra vez.
   */
  recordStockMovement(data: RecordStockMovementData): Promise<{ available: number; replayed: boolean }>;
  /**
   * Crea producto + N variantes (`title` = talla) + N filas de inventario en
   * `locationId` + un Movement RESTOCK "alta" por talla con piezas, todo
   * atómico. Si un barcode, sku o publicCode ya existe lanza un error con
   * `code: "P2002"` y `meta.target` (mismo contrato que Prisma) y no crea nada.
   */
  createProduct(data: CreateProductData): Promise<CreatedProduct>;
  /**
   * Agrega una talla a un producto activo y sin unir (fila de inventario en
   * `locationId` y RESTOCK si trae piezas). Lanza `InventoryRuleError` si el
   * producto no existe, está inactivo o unido, o si ya hay una variante activa
   * de esa talla y `barcode === null`. P2002 como en `createProduct`.
   */
  addVariant(data: AddVariantData): Promise<VariantMatch>;
  /**
   * Búsqueda interna: código público exacto (`normalizePublicCode`) o título o
   * marca que contiene `query` sin distinguir mayúsculas. Solo productos
   * activos y sin unir; máximo `MAX_SEARCH_RESULTS`.
   */
  searchProducts(query: string): Promise<ProductSearchHit[]>;
  /**
   * Cambia el precio de una talla solo si sigue valiendo `expectedPrice`
   * (`updateMany` condicionado): si otra persona lo cambió antes devuelve
   * `{ ok: false, currentPrice }` sin escribir nada. Si no, escribe un
   * `PriceChange` con el precio viejo, el nuevo, el usuario y el motivo.
   * Lanza `ProductNotFoundError` si la talla no existe.
   */
  updateVariantPrice(
    variantId: string,
    expectedPrice: number,
    newPrice: number,
    userId: string,
    reason: string | null,
  ): Promise<UpdateVariantPriceResult>;
  /** Últimos `limit` cambios de precio de la talla, el más nuevo primero. */
  listPriceChanges(variantId: string, limit: number): Promise<PriceChangeEntry[]>;
  /** Lanza `ProductNotFoundError` si no existe. No toca `publicCode`. */
  updateProduct(productId: string, patch: ProductPatch): Promise<void>;
  /**
   * Baja lógica (nunca se borra). Un producto desactivado sale del catálogo y no
   * se vende; su historial queda. Reactivar uno unido a otro lanza
   * `InventoryRuleError`. Lanza `ProductNotFoundError` si no existe.
   */
  setProductActive(productId: string, active: boolean): Promise<void>;
  /** Igual que `setProductActive`, para una talla. */
  setVariantActive(variantId: string, active: boolean): Promise<void>;
  /** Asigna el departamento a varios productos; devuelve cuántos existían. */
  assignDepartment(productIds: string[], departmentId: string): Promise<number>;
  /**
   * Une productos duplicados por talla: mueve las tallas y los renglones de venta de
   * cada origen al destino, desactiva los orígenes y deja `mergedIntoId`. Una sola
   * transacción que bloquea los productos en orden de id. Lanza `InventoryRuleError`
   * si el destino está inactivo o unido, si las marcas no coinciden, si un origen ya
   * está unido a otro destino o si `sourceIds` está vacío o incluye al destino.
   */
  mergeProducts(targetId: string, sourceIds: string[], userId: string): Promise<MergeProductsResult>;
  /**
   * Producto por su código público (sin normalizar). Si fue unido a otro, un salto
   * al destino. `null` si no existe.
   */
  getProductByPublicCode(code: string): Promise<Product | null>;
  updateProductImage(productId: string, imageUrl: string): Promise<void>;
  updateProductBackImage(productId: string, backImageUrl: string): Promise<void>;
}

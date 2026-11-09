import type { Location, LocationType, Product, Variant } from "@/lib/domain/types";

export interface VariantMatch {
  product: Product;
  variant: Variant;
}

export interface CreateProductData {
  /** Código de la etiqueta ya normalizado, o null si el producto no trae código. */
  barcode: string | null;
  /** SKU interno generado en el servidor (`generateInternalSku`). */
  sku: string;
  title: string;
  /** Nombre canónico de la marca (se sigue guardando en `Product.brand` durante la transición, ER §2.3). */
  brand: string;
  brandId: string;
  departmentId: string;
  /** Código público corto (`generatePublicCode`); único, el llamador reintenta ante P2002. */
  publicCode: string;
  price: number;
  category: string;
  /** Talla de la variante; por defecto "U". */
  size?: string;
  /** Piezas contadas al dar de alta en `locationId` (0 si aún no se cuentan). */
  initialStock: number;
  locationId: string;
  imageUrl?: string | null;
  /** Usuario que da de alta; queda en el Movement RESTOCK si initialStock > 0. */
  userId: string;
}

export interface CreateLocationData {
  name: string;
  type?: LocationType;
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
  adjustInventory(variantId: string, locationId: string, delta: number, userId?: string): Promise<void>;
  /**
   * Crea producto + variante + inventario inicial (+ Movement RESTOCK si
   * initialStock > 0) de forma atómica. Si barcode o sku ya existen lanza un
   * error con `code: "P2002"` y `meta.target` (mismo contrato que Prisma).
   */
  createProduct(data: CreateProductData): Promise<VariantMatch>;
  updateProductImage(productId: string, imageUrl: string): Promise<void>;
}

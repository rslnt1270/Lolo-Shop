export type Role = "owner" | "manager" | "collaborator";

export type LocationType = "store" | "warehouse";

export interface Location {
  id: string;
  name: string;
  type?: LocationType;
}

export interface InventoryLevel {
  locationId: string;
  available: number;
}

export interface Variant {
  id: string;
  sku: string;
  title: string; // "M / Negro"
  size: string;
  color: string;
  price: number;
  barcode: string | null;
  inventory: InventoryLevel[];
  /** Ausente se trata como activa (fixtures). */
  isActive?: boolean;
}

export interface Product {
  id: string;
  title: string;
  category: string;
  brand: string;
  imageUrl: string | null;
  backImageUrl?: string | null;
  description?: string | null;
  /** Código público corto (ER §2.7); solo los productos dados de alta lo tienen. */
  publicCode?: string | null;
  /** Ausente se trata como activo (fixtures). */
  isActive?: boolean;
  /** Marca canónica y departamento (ER §2.3); ausentes en datos viejos. */
  brandId?: string | null;
  departmentId?: string | null;
  /** Producto destino si este fue unido a otro (ER §2.8). */
  mergedIntoId?: string | null;
  /** Fecha de alta, ISO. */
  createdAt?: string;
  variants: Variant[];
}

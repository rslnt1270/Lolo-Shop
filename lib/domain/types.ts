export type Role = "owner" | "manager" | "collaborator";

export type LocationType = "store" | "warehouse";

/** Igual que el enum `MovementType` de Prisma (el dominio no importa el cliente generado). */
export type MovementType = "SALE" | "RESTOCK" | "ADJUSTMENT" | "TRANSFER" | "DAMAGE" | "RETURN";

export const MOVEMENT_TYPES: readonly MovementType[] = ["SALE", "RESTOCK", "ADJUSTMENT", "TRANSFER", "DAMAGE", "RETURN"];

export const MOVEMENT_TYPE_LABEL: Record<MovementType, string> = {
  SALE: "Venta",
  RESTOCK: "Entrada",
  DAMAGE: "Merma",
  ADJUSTMENT: "Corrección",
  TRANSFER: "Traspaso",
  RETURN: "Devolución",
};

export interface Location {
  id: string;
  name: string;
  type?: LocationType;
  /** Tienda visible en el catálogo público (con type store). Ausente se trata como pública. */
  isPublic?: boolean;
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
  /** Color del producto (texto libre normalizado en el alta, hasta 40). */
  color?: string | null;
  /** Publicado en el catálogo público; ausente se trata como no publicado. */
  isPublished?: boolean;
  /** Fecha ISO en que el servidor aceptó las fotos blancas de catálogo; nulo si no. */
  catalogPhotosCheckedAt?: string | null;
  /** Código público corto (ER §2.7); solo los productos dados de alta lo tienen. */
  publicCode?: string | null;
  /** Ausente se trata como activo (fixtures). */
  isActive?: boolean;
  /** Marca canónica y departamento (ER §2.3); ausentes en datos viejos. */
  brandId?: string | null;
  departmentId?: string | null;
  /** Departamento resuelto (solo lo traen las lecturas del catálogo); la proyección pública lo recorta. */
  department?: { slug: string; name: string; sortOrder: number; isActive: boolean } | null;
  /** Producto destino si este fue unido a otro (ER §2.8). */
  mergedIntoId?: string | null;
  /** Fecha de alta, ISO. */
  createdAt?: string;
  variants: Variant[];
}

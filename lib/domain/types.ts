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
}

export interface Product {
  id: string;
  title: string;
  category: string;
  brand: string;
  imageUrl: string | null;
  variants: Variant[];
}

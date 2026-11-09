import type { PublicProduct } from "@/lib/data/public-projection";

export interface StoreHotspot {
  id: string;
  productId?: string;
  /** Solo la proyección pública (sin SKU ni conteos de stock), ER §2.7. */
  product?: PublicProduct;
  title: string;
  category: string;
  brand: string;
  price: number;
  imageUrl?: string;
  // Ángulos esféricos relativos al centro de la cámara en la zona (-180 a 180 horizontal, -90 a 90 vertical)
  yaw: number;
  pitch: number;
  zoneId: string;
  shelfLabel: string;
}

export interface ZoneConnection {
  targetZoneId: string;
  label: string;
  yaw: number;
  pitch: number;
}

export interface StoreZone {
  id: string;
  name: string;
  shortName: string;
  description: string;
  iconName: "store" | "shirt" | "footprints" | "credit-card";
  initialYaw: number;
  initialPitch: number;
  // Coordenadas relativas en el plano arquitectónico (0% - 100%)
  mapCoords: { x: number; y: number };
  connections: ZoneConnection[];
  // Paleta de iluminación y ambiente de la zona
  ambientGlow: string;
  accentColor: string;
  // Soporte opcional para imagen panorámica 360 o render gaussiano (.splat / .spz / .jpg)
  panoramaUrl?: string;
  splatUrl?: string;
}

export interface CameraState {
  yaw: number;
  pitch: number;
  zoom: number;
}

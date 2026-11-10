import type { PublicProduct } from "@/lib/data/public-projection";
import type { StoreHotspot, StoreZone } from "./types";

export const STORE_ZONES: StoreZone[] = [
  {
    id: "entrada",
    name: "Entrada & Vitrina Principal",
    shortName: "Entrada",
    description: "Acceso principal, escaparate de novedades y maniquíes de temporada.",
    iconName: "store",
    initialYaw: 0,
    initialPitch: -2,
    mapCoords: { x: 50, y: 85 },
    ambientGlow: "rgba(60, 191, 191, 0.18)",
    accentColor: "#3cbfbf",
    connections: [
      {
        targetZoneId: "percheros",
        label: "Avanzar a Percheros Centrales",
        yaw: 0,
        pitch: -18,
      },
      {
        targetZoneId: "caja",
        label: "Ir al Mostrador de Cobro",
        yaw: 55,
        pitch: -14,
      },
    ],
  },
  {
    id: "percheros",
    name: "Pasillo Central & Perchero Urbano",
    shortName: "Percheros",
    description: "Colección streetwear, hoodies pesados, playeras gráficas y chamarras.",
    iconName: "shirt",
    initialYaw: 0,
    initialPitch: -4,
    mapCoords: { x: 35, y: 48 },
    ambientGlow: "rgba(0, 106, 106, 0.22)",
    accentColor: "#007272",
    connections: [
      {
        targetZoneId: "entrada",
        label: "Regresar a la Entrada",
        yaw: 180,
        pitch: -16,
      },
      {
        targetZoneId: "calzado",
        label: "Pasar al Muro de Sneakers",
        yaw: -75,
        pitch: -14,
      },
      {
        targetZoneId: "caja",
        label: "Ir a Caja / Accesorios",
        yaw: 70,
        pitch: -14,
      },
    ],
  },
  {
    id: "calzado",
    name: "Muro de Sneakers & Calzado",
    shortName: "Sneakers",
    description: "Repisas modulares de exhibición con calzado urbano y ediciones especiales.",
    iconName: "footprints",
    initialYaw: -90,
    initialPitch: 0,
    mapCoords: { x: 18, y: 35 },
    ambientGlow: "rgba(246, 149, 98, 0.2)",
    accentColor: "#f69562",
    connections: [
      {
        targetZoneId: "percheros",
        label: "Volver a Percheros",
        yaw: 90,
        pitch: -16,
      },
      {
        targetZoneId: "entrada",
        label: "Caminar a la Entrada",
        yaw: 135,
        pitch: -15,
      },
    ],
  },
  {
    id: "caja",
    name: "Mostrador & Accesorios",
    shortName: "Mostrador",
    description: "Mesa de cobro, terminal POS, exhibición de gorras, carteras y piezas exclusivas.",
    iconName: "credit-card",
    initialYaw: 90,
    initialPitch: -6,
    mapCoords: { x: 82, y: 42 },
    ambientGlow: "rgba(92, 217, 216, 0.25)",
    accentColor: "#5cd9d8",
    connections: [
      {
        targetZoneId: "entrada",
        label: "Regresar a la Entrada",
        yaw: -135,
        pitch: -15,
      },
      {
        targetZoneId: "percheros",
        label: "Ir a Pasillo de Ropa",
        yaw: -85,
        pitch: -15,
      },
    ],
  },
];

// Puntos de interés 3D por defecto distribuidos en el espacio físico
export const DEFAULT_HOTSPOTS_CONFIG: Omit<StoreHotspot, "product">[] = [
  // Entrada & Vitrina
  {
    id: "hs-vitrina-1",
    title: "Ghost Puffer v1 (Cyber Teal)",
    category: "Outerwear",
    brand: "LoloTech",
    price: 1850,
    imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuD6HqCZ1QwPLfT275aW3h9N_AJgtN9KK3rPw25D8YYiUWLiue26Z_5RmK87lVE9CsRUS37mYwcZs4tY0DZWPq4slB6tACrRvgcx-CNatV2g6NsJTlNr_nqfbHlcfJPX0rQdUY6x2mH-KGPfGeJIBC3C-Ndh51eeeg4WmX32gNhmXdfvcyIE4TlbGExldW_uhQ_BmAEbh-fW2Wap7ZXWvfzfqiaWX5Xket2hQJmHgnEwlVjFtxhri3RgmLCZ27R_x2Acc22-4DZopzUL",
    yaw: -18,
    pitch: 4,
    zoneId: "entrada",
    shelfLabel: "Maniquí de Vitrina",
  },
  {
    id: "hs-vitrina-2",
    title: "Playera Básica Heavyweight",
    category: "Playeras",
    brand: "LoloShop",
    price: 299,
    yaw: 22,
    pitch: -2,
    zoneId: "entrada",
    shelfLabel: "Mesa Frontal Novedades",
  },
  // Percheros
  {
    id: "hs-perchero-1",
    title: "Hoodie NY Yankees Oversize",
    category: "Hoodies",
    brand: "NY Yankees",
    price: 890,
    yaw: -28,
    pitch: 2,
    zoneId: "percheros",
    shelfLabel: "Perchero A - Riel Izquierdo",
  },
  {
    id: "hs-perchero-2",
    title: "Playera Gráfica Guess Classic",
    category: "Playeras",
    brand: "Guess",
    price: 650,
    yaw: 26,
    pitch: 0,
    zoneId: "percheros",
    shelfLabel: "Perchero B - Riel Derecho",
  },
  {
    id: "hs-perchero-3",
    title: "Pantalón Cargo Táctico",
    category: "Pantalones",
    brand: "LoloShop",
    price: 799,
    yaw: 0,
    pitch: -1,
    zoneId: "percheros",
    shelfLabel: "Estante Central Doblados",
  },
  // Calzado
  {
    id: "hs-calzado-1",
    title: "Sneakers Retro Low High-Top",
    category: "Calzado",
    brand: "Lolo Urban",
    price: 1599,
    yaw: -95,
    pitch: 6,
    zoneId: "calzado",
    shelfLabel: "Repisa Superior #3",
  },
  {
    id: "hs-calzado-2",
    title: "Calzado Runner Monocromo",
    category: "Calzado",
    brand: "StreetFlow",
    price: 1350,
    yaw: -82,
    pitch: -6,
    zoneId: "calzado",
    shelfLabel: "Repisa Media #2",
  },
  // Caja / Accesorios
  {
    id: "hs-caja-1",
    title: "Gorra Snapback Signature 3D",
    category: "Accesorios",
    brand: "LoloShop",
    price: 420,
    yaw: 85,
    pitch: 4,
    zoneId: "caja",
    shelfLabel: "Mural de Gorras",
  },
  {
    id: "hs-caja-2",
    title: "Cartera Minimalista RFID",
    category: "Accesorios",
    brand: "Lolo Goods",
    price: 340,
    yaw: 98,
    pitch: -8,
    zoneId: "caja",
    shelfLabel: "Vitrina Mostrador",
  },
];

/**
 * Vincula los productos del catálogo público con los puntos de la tienda,
 * uno por punto y en orden. Los puntos sin producto real se omiten: el
 * recorrido nunca muestra prendas ni precios de ejemplo al cliente.
 */
export function bindProductsToHotspots(realProducts: PublicProduct[]): StoreHotspot[] {
  const products = realProducts.filter((p) => p.price !== null);
  const bound: StoreHotspot[] = [];
  for (let i = 0; i < DEFAULT_HOTSPOTS_CONFIG.length && i < products.length; i++) {
    const config = DEFAULT_HOTSPOTS_CONFIG[i];
    const p = products[i];
    bound.push({
      ...config,
      productId: p.id,
      product: p,
      title: p.title || config.title,
      brand: p.brand || config.brand,
      category: p.category || config.category,
      price: p.price ?? config.price,
      imageUrl: p.imageUrl ?? undefined,
    });
  }
  return bound;
}

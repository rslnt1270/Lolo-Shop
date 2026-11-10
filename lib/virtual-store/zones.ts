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

// Puntos de interés 3D por defecto en el espacio físico. Solo posiciones y etiquetas
// neutras de repisa: ningún texto, marca, precio ni foto de ejemplo llega al cliente.
export const DEFAULT_HOTSPOTS_CONFIG: Omit<StoreHotspot, "product">[] = [
  {
    id: "hs-vitrina-1",
    title: "Prenda en repisa 1",
    category: "Prendas",
    brand: "Marca",
    price: 0,
    yaw: -18,
    pitch: 4,
    zoneId: "entrada",
    shelfLabel: "Repisa 1",
  },
  {
    id: "hs-vitrina-2",
    title: "Prenda en repisa 2",
    category: "Prendas",
    brand: "Marca",
    price: 0,
    yaw: 22,
    pitch: -2,
    zoneId: "entrada",
    shelfLabel: "Repisa 2",
  },
  {
    id: "hs-perchero-1",
    title: "Prenda en repisa 3",
    category: "Prendas",
    brand: "Marca",
    price: 0,
    yaw: -28,
    pitch: 2,
    zoneId: "percheros",
    shelfLabel: "Repisa 3",
  },
  {
    id: "hs-perchero-2",
    title: "Prenda en repisa 4",
    category: "Prendas",
    brand: "Marca",
    price: 0,
    yaw: 26,
    pitch: 0,
    zoneId: "percheros",
    shelfLabel: "Repisa 4",
  },
  {
    id: "hs-perchero-3",
    title: "Prenda en repisa 5",
    category: "Prendas",
    brand: "Marca",
    price: 0,
    yaw: 0,
    pitch: -1,
    zoneId: "percheros",
    shelfLabel: "Repisa 5",
  },
  {
    id: "hs-calzado-1",
    title: "Prenda en repisa 6",
    category: "Prendas",
    brand: "Marca",
    price: 0,
    yaw: -95,
    pitch: 6,
    zoneId: "calzado",
    shelfLabel: "Repisa 6",
  },
  {
    id: "hs-calzado-2",
    title: "Prenda en repisa 7",
    category: "Prendas",
    brand: "Marca",
    price: 0,
    yaw: -82,
    pitch: -6,
    zoneId: "calzado",
    shelfLabel: "Repisa 7",
  },
  {
    id: "hs-caja-1",
    title: "Prenda en repisa 8",
    category: "Prendas",
    brand: "Marca",
    price: 0,
    yaw: 85,
    pitch: 4,
    zoneId: "caja",
    shelfLabel: "Repisa 8",
  },
  {
    id: "hs-caja-2",
    title: "Prenda en repisa 9",
    category: "Prendas",
    brand: "Marca",
    price: 0,
    yaw: 98,
    pitch: -8,
    zoneId: "caja",
    shelfLabel: "Repisa 9",
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

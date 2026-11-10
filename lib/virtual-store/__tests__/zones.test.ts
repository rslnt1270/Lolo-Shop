import { describe, it, expect } from "vitest";
import { STORE_ZONES, bindProductsToHotspots, DEFAULT_HOTSPOTS_CONFIG } from "../zones";
import type { PublicProduct } from "@/lib/data/public-projection";

describe("Virtual Store Zones & Hotspots", () => {
  it("contiene las 4 zonas principales de la tienda física con sus conexiones", () => {
    expect(STORE_ZONES).toHaveLength(4);
    const zoneIds = STORE_ZONES.map((z) => z.id);
    expect(zoneIds).toContain("entrada");
    expect(zoneIds).toContain("percheros");
    expect(zoneIds).toContain("calzado");
    expect(zoneIds).toContain("caja");

    // Verificar que todas las conexiones apunten a zonas válidas
    for (const zone of STORE_ZONES) {
      expect(zone.connections.length).toBeGreaterThan(0);
      for (const conn of zone.connections) {
        expect(zoneIds).toContain(conn.targetZoneId);
      }
    }
  });

  const chamarra: PublicProduct = {
    id: "prod-real-1",
    publicCode: "K7Q2M",
    title: "Chamarra Streetwear Especial",
    brand: "Marca de prueba",
    category: "Outerwear",
    imageUrl: "https://example.com/chamarra.jpg",
    backImageUrl: "https://example.com/chamarra-atras.jpg",
    sizes: [{ size: "M", available: true, price: 1200 }],
    price: 1200,
  };

  it("vincula cada producto público a un solo punto y omite los puntos sin producto", () => {
    const bound = bindProductsToHotspots([chamarra]);
    expect(bound).toHaveLength(1);
    expect(bound[0].id).toBe(DEFAULT_HOTSPOTS_CONFIG[0].id);
    expect(bound[0].productId).toBe("prod-real-1");
    expect(bound[0].title).toBe("Chamarra Streetwear Especial");
    expect(bound[0].price).toBe(1200);
    expect(bound[0].imageUrl).toBe("https://example.com/chamarra.jpg");
  });

  it("sin productos públicos no muestra prendas ni precios de ejemplo", () => {
    expect(bindProductsToHotspots([])).toEqual([]);
  });

  it("omite productos sin precio", () => {
    expect(bindProductsToHotspots([{ ...chamarra, price: null }])).toEqual([]);
  });

  it("nunca coloca más productos que puntos disponibles", () => {
    const many = Array.from({ length: DEFAULT_HOTSPOTS_CONFIG.length + 5 }, (_, i) => ({ ...chamarra, id: `p-${i}` }));
    const bound = bindProductsToHotspots(many);
    expect(bound).toHaveLength(DEFAULT_HOTSPOTS_CONFIG.length);
    expect(new Set(bound.map((h) => h.productId)).size).toBe(bound.length);
  });
});

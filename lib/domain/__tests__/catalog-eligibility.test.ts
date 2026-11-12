import { describe, it, expect } from "vitest";
import { catalogEligibility, hasStockInPublicStore, isPendingPublication } from "../catalog-eligibility";
import type { Product } from "../types";

const full = {
  imageUrl: "https://a/f.jpg" as string | null,
  backImageUrl: "https://a/b.jpg" as string | null,
  description: "Playera de algodón",
  hasStockInPublicStore: true,
};

describe("catalogEligibility", () => {
  it("producto con frente, atrás, descripción y existencias es elegible", () => {
    expect(catalogEligibility(full)).toEqual({ eligible: true, gaps: [] });
  });
  it("sin foto de atrás: FOTO_ATRAS", () => {
    expect(catalogEligibility({ ...full, backImageUrl: null })).toEqual({ eligible: false, gaps: ["FOTO_ATRAS"] });
  });
  it("descripción solo espacios: DESCRIPCION", () => {
    expect(catalogEligibility({ ...full, description: "   " }).gaps).toEqual(["DESCRIPCION"]);
  });
  it("sin existencias en tienda pública: EXISTENCIAS", () => {
    expect(catalogEligibility({ ...full, hasStockInPublicStore: false }).gaps).toEqual(["EXISTENCIAS"]);
  });
  it("varios huecos salen en orden fijo", () => {
    expect(
      catalogEligibility({ imageUrl: null, backImageUrl: null, description: null, hasStockInPublicStore: false }).gaps,
    ).toEqual(["FOTO_FRENTE", "FOTO_ATRAS", "DESCRIPCION", "EXISTENCIAS"]);
  });
  it("catalogPhotosCheckedAt nulo no cuenta: producto completo sin esa fecha es elegible", () => {
    const withDate = { ...full, catalogPhotosCheckedAt: null } as typeof full;
    expect(catalogEligibility(withDate).eligible).toBe(true);
  });
});

describe("isPendingPublication", () => {
  const stores = new Set(["st"]);
  const prod = (over: Partial<Product> = {}): Product => ({
    id: "p", title: "t", brand: "b", category: "c",
    imageUrl: "f", backImageUrl: "b", isActive: true, mergedIntoId: null, isPublished: false,
    variants: [{ id: "v", sku: "s", title: "M", size: "M", color: "x", price: 1, barcode: null,
      inventory: [{ locationId: "st", available: 2 }] }],
    ...over,
  });
  it("fotos y existencias sin publicar → true", () => expect(isPendingPublication(prod(), stores)).toBe(true));
  it("publicado → false", () => expect(isPendingPublication(prod({ isPublished: true }), stores)).toBe(false));
  it("sin foto de atrás → false", () => expect(isPendingPublication(prod({ backImageUrl: null }), stores)).toBe(false));
  it("sin existencias → false", () => expect(isPendingPublication(prod(), new Set(["otra"]))).toBe(false));
  it("inactivo o unido → false", () => {
    expect(isPendingPublication(prod({ isActive: false }), stores)).toBe(false);
    expect(isPendingPublication(prod({ mergedIntoId: "x" }), stores)).toBe(false);
  });
  it("la descripción no es condición de la lista", () => {
    expect(isPendingPublication(prod({ description: null }), stores)).toBe(true);
  });
});

describe("hasStockInPublicStore", () => {
  it("ignora variantes inactivas y ubicaciones no públicas", () => {
    const inv = (locationId: string, available: number) => ({ locationId, available });
    expect(hasStockInPublicStore({ variants: [{ isActive: false, inventory: [inv("st", 5)] }] }, new Set(["st"]))).toBe(false);
    expect(hasStockInPublicStore({ variants: [{ inventory: [inv("wh", 5)] }] }, new Set(["st"]))).toBe(false);
    expect(hasStockInPublicStore({ variants: [{ inventory: [inv("st", 1)] }] }, new Set(["st"]))).toBe(true);
  });
});

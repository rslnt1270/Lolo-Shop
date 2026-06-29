import { describe, it, expect } from "vitest";
import { variantStock, productStock, lowStockVariants } from "../inventory";
import { fixtureProducts } from "@/lib/data/fixtures";

const hoodie = fixtureProducts[0];

describe("variantStock", () => {
  it("suma stock de todas las tiendas sin filtro", () => {
    expect(variantStock(hoodie.variants[0])).toBe(8); // 3 + 5
  });
  it("filtra por tienda", () => {
    expect(variantStock(hoodie.variants[0], "loc-1")).toBe(3);
  });
  it("devuelve 0 si la tienda no tiene nivel", () => {
    expect(variantStock(hoodie.variants[0], "loc-999")).toBe(0);
  });
});

describe("productStock", () => {
  it("suma stock de todas las variantes y tiendas", () => {
    // var-1: 3+5=8, var-2: 1+0=1 => 9
    expect(productStock(hoodie)).toBe(9);
  });
  it("suma stock del producto en una tienda", () => {
    // loc-1: 3 + 1 = 4
    expect(productStock(hoodie, "loc-1")).toBe(4);
  });
});

describe("lowStockVariants", () => {
  it("lista variantes en o por debajo del umbral", () => {
    const low = lowStockVariants(fixtureProducts, 1);
    const skus = low.map((e) => e.variant.sku);
    expect(skus).toContain("LS-HOO-NYY-L-NEG"); // total 1
    expect(skus).not.toContain("LS-PLA-GUE-M-BLA"); // total 10
  });
  it("respeta el filtro por tienda", () => {
    const low = lowStockVariants(fixtureProducts, 0, "loc-2");
    // var-2 en loc-2 = 0 => incluida
    expect(low.map((e) => e.variant.id)).toContain("var-2");
  });
});

import { describe, it, expect } from "vitest";
import { filterProducts } from "../filter";
import { fixtureProducts } from "../fixtures";

describe("filterProducts", () => {
  it("sin query ni categoría devuelve todo", () => {
    expect(filterProducts(fixtureProducts, "", null)).toHaveLength(2);
  });
  it("filtra por texto en título (case-insensitive)", () => {
    const r = filterProducts(fixtureProducts, "guess", null);
    expect(r.map((p) => p.id)).toEqual(["prod-2"]);
  });
  it("filtra por marca", () => {
    const r = filterProducts(fixtureProducts, "yankees", null);
    expect(r.map((p) => p.id)).toEqual(["prod-1"]);
  });
  it("filtra por SKU de variante", () => {
    const r = filterProducts(fixtureProducts, "LS-PLA", null);
    expect(r.map((p) => p.id)).toEqual(["prod-2"]);
  });
  it("filtra por categoría", () => {
    const r = filterProducts(fixtureProducts, "", "Hoodies");
    expect(r.map((p) => p.id)).toEqual(["prod-1"]);
  });
});

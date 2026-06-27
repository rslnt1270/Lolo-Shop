import { describe, it, expect } from "vitest";
import { FixtureDataSource } from "../fixture-source";

describe("FixtureDataSource", () => {
  const ds = new FixtureDataSource();

  it("devuelve las dos tiendas", async () => {
    const locs = await ds.getLocations();
    expect(locs.map((l) => l.id)).toEqual(["loc-1", "loc-2"]);
  });

  it("devuelve todos los productos", async () => {
    const products = await ds.getProducts();
    expect(products).toHaveLength(2);
  });

  it("encuentra producto y variante por variantId", async () => {
    const match = await ds.getProductByVariantId("var-3");
    expect(match?.product.title).toBe("Playera Guess");
    expect(match?.variant.sku).toBe("LS-PLA-GUE-M-BLA");
  });

  it("devuelve null si el variantId no existe", async () => {
    const match = await ds.getProductByVariantId("inexistente");
    expect(match).toBeNull();
  });
});

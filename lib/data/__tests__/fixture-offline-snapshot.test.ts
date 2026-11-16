import { describe, it, expect } from "vitest";
import { FixtureDataSource } from "../fixture-source";

describe("FixtureDataSource.getOfflineSnapshot", () => {
  it("solo la tienda pedida, con 0 piezas, en orden de variantId", async () => {
    const snap = await new FixtureDataSource().getOfflineSnapshot("loc-2");
    expect(snap.locationId).toBe("loc-2");
    expect(Number.isNaN(Date.parse(snap.generatedAt))).toBe(false);
    expect(snap.variants.map((v) => [v.variantId, v.available])).toEqual([
      ["var-1", 5],
      ["var-2", 0],
      ["var-3", 2],
    ]);
    expect(Object.keys(snap.variants[0]).sort()).toEqual(
      ["available", "barcode", "price", "productId", "productTitle", "size", "sku", "variantId", "variantTitle"],
    );
  });

  it("excluye tallas y productos dados de baja", async () => {
    const ds = new FixtureDataSource();
    await ds.setVariantActive("var-2", false);
    await ds.setProductActive("prod-2", false);
    const snap = await ds.getOfflineSnapshot("loc-1");
    expect(snap.variants.map((v) => v.variantId)).toEqual(["var-1"]);
  });

  it("tienda desconocida: copia vacía", async () => {
    expect((await new FixtureDataSource().getOfflineSnapshot("nope")).variants).toEqual([]);
  });
});

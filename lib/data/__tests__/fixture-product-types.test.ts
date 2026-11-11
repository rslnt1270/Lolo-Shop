import { describe, expect, it } from "vitest";
import { FixtureDataSource } from "../fixture-source";
import { InventoryRuleError } from "../errors";
import { FIXTURE_PRODUCT_TYPES } from "../fixtures";
import type { CreateProductData } from "../source";

const typeId = (slug: string) => FIXTURE_PRODUCT_TYPES.find((t) => t.slug === slug)!.id;
let n = 0;

async function setup() {
  const ds = new FixtureDataSource();
  // Los productos del doble no se clasifican: se retiran para que solo cuente el escenario.
  for (const p of await ds.getProducts()) await ds.setProductActive(p.id, false);
  const a = await ds.createLocation({ name: "Tienda A", type: "store" });
  const b = await ds.createLocation({ name: "Tienda B", type: "store" });
  return { ds, a: a.id, b: b.id };
}

async function mk(
  ds: FixtureDataSource,
  opts: {
    dept: string; type: string | null; audience?: string | null; style?: string | null; loc: string;
    sizes: Record<string, number>; extra?: Record<string, number>; extraLoc?: string;
  },
) {
  n++;
  const data: CreateProductData = {
    title: `P${n}`, brand: "Guess", brandId: "b1", departmentId: `dep-${opts.dept}`, publicCode: `CODE${n}`,
    category: opts.type ? FIXTURE_PRODUCT_TYPES.find((t) => t.slug === opts.type)!.name : "General",
    productTypeId: opts.type ? typeId(opts.type) : null, style: opts.style ?? null,
    audience: (opts.audience ?? null) as CreateProductData["audience"],
    variants: Object.entries(opts.sizes).map(([size, initialStock]) => ({
      sku: `SKU-${n}-${size}`, barcode: null, size, price: 100, initialStock,
    })),
    locationId: opts.loc, userId: "u1",
  };
  const res = await ds.createProduct(data);
  for (const [size, delta] of Object.entries(opts.extra ?? {})) {
    const v = res.variants.find((x) => x.size === size)!;
    await ds.recordStockMovement({
      variantId: v.id, locationId: opts.extraLoc!, type: "RESTOCK", delta, notes: null,
      requestId: `r-${n}-${size}`, userId: "u1",
    });
  }
  return res.product.id;
}

describe("FixtureDataSource: tipos de producto", () => {
  it("fixture getStockByType devuelve las mismas 5 filas en el mismo orden", async () => {
    const { ds, a, b } = await setup();
    await mk(ds, { dept: "dama", type: "playera", loc: a, sizes: { M: 3, L: 2 }, extra: { M: 1 }, extraLoc: b });
    await mk(ds, { dept: "dama", type: "playera", loc: a, sizes: { S: 0 } });
    await mk(ds, { dept: "calzado", type: "tenis", audience: "nino", loc: a, sizes: { "22": 4 } });
    await mk(ds, { dept: "calzado", type: "tenis", audience: "dama", loc: a, sizes: { "24": 2 } });
    await mk(ds, { dept: "dama", type: null, loc: b, sizes: { U: 7 } });
    const inactive = await mk(ds, { dept: "dama", type: "playera", loc: a, sizes: { M: 9 } });
    await ds.setProductActive(inactive, false);
    const sizeOff = await mk(ds, { dept: "dama", type: "playera", loc: a, sizes: { M: 5 } });
    const prod = (await ds.getProducts()).find((p) => p.id === sizeOff)!;
    await ds.setVariantActive(prod.variants[0].id, false);

    const rows = await ds.getStockByType({});
    expect(rows.map((r) => [r.departmentName, r.typeName, r.audience, r.locationName, r.pieces, r.products])).toEqual([
      ["Dama", "Playeras", null, "Tienda A", 5, 1],
      ["Dama", "Playeras", null, "Tienda B", 1, 1],
      ["Dama", "Sin tipo", null, "Tienda B", 7, 1],
      ["Calzado", "Tenis", "dama", "Tienda A", 2, 1],
      ["Calzado", "Tenis", "nino", "Tienda A", 4, 1],
    ]);
    const onlyB = await ds.getStockByType({ locationId: b });
    expect(onlyB.map((r) => r.pieces)).toEqual([1, 7]);
  });

  it("fixture assignProductType con par inválido lanza InventoryRuleError", async () => {
    const { ds, a } = await setup();
    const ok = await mk(ds, { dept: "dama", type: "sudadera", style: "con-capucha", loc: a, sizes: { M: 1 } });
    const bad = await mk(ds, { dept: "calzado", type: "tenis", audience: "dama", loc: a, sizes: { "24": 1 } });
    await expect(
      ds.assignProductType([ok, bad], { productTypeId: typeId("playera"), category: "Playeras", allowedStyles: ["polo"] }),
    ).rejects.toThrow(InventoryRuleError);
    const products = await ds.getProducts();
    expect(products.find((p) => p.id === ok)!.productTypeId).toBe(typeId("sudadera"));

    const res = await ds.assignProductType([ok], { productTypeId: typeId("playera"), category: "Playeras", allowedStyles: ["polo"] });
    expect(res).toEqual({ updated: 1, styleCleared: 1 });
    const after = (await ds.getProducts()).find((p) => p.id === ok)!;
    expect(after).toMatchObject({ category: "Playeras", productTypeId: typeId("playera"), style: null });
  });
});

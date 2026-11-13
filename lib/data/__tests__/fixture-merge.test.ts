import { describe, it, expect } from "vitest";
import { FixtureDataSource } from "../fixture-source";
import type { CreateProductData } from "../source";

const base = { brand: "Nautica", brandId: "b1", departmentId: "d1", category: "Polos", locationId: "loc-1", userId: "u1" };
const mk = (title: string, code: string, size: string, sku: string): CreateProductData => ({
  ...base,
  title,
  publicCode: code,
  variants: [{ barcode: null, sku, size, price: 300, initialStock: 1 }],
});

describe("FixtureDataSource.mergeProducts: tallas viejas", () => {
  it("A 'Polo - M' (talla U) + B 'Polo - L' (talla U) → A queda con tallas M y L", async () => {
    const ds = new FixtureDataSource();
    const a = await ds.createProduct(mk("Polo - M", "AAAAA", "", "LS-A"));
    const b = await ds.createProduct(mk("Polo - L", "BBBBB", "U", "LS-B"));
    expect(a.variants[0].size).toBe("U");

    const res = await ds.mergeProducts(a.product.id, [b.product.id], "u1");
    expect(res.movedVariants).toBe(1);
    const target = (await ds.getProducts()).find((p) => p.id === a.product.id)!;
    expect(target.variants.map((v) => v.size).sort()).toEqual(["L", "M"]);
    expect(target.variants.map((v) => v.title).sort()).toEqual(["L", "M"]);
  });

  it("no toca una talla que ya no es U ni un título sin talla", async () => {
    const ds = new FixtureDataSource();
    const a = await ds.createProduct(mk("Polo - M", "CCCCC", "XL", "LS-C"));
    const b = await ds.createProduct(mk("Polo", "DDDDD", "U", "LS-D"));
    await ds.mergeProducts(a.product.id, [b.product.id], "u1");
    const target = (await ds.getProducts()).find((p) => p.id === a.product.id)!;
    expect(target.variants.map((v) => v.size).sort()).toEqual(["U", "XL"]);
  });

  it("residual 5: el título del destino pierde la talla final; un modelo numérico no", async () => {
    const ds = new FixtureDataSource();
    const a = await ds.createProduct(mk("Polo Náutica - M", "EEEEE", "M", "LS-E"));
    const b = await ds.createProduct(mk("Polo Náutica - L", "FFFFF", "L", "LS-F"));
    await ds.mergeProducts(a.product.id, [b.product.id], "u1");
    expect((await ds.getProducts()).find((p) => p.id === a.product.id)!.title).toBe("Polo Náutica");

    const c = await ds.createProduct(mk("Nike Air Max 90", "GGGGG", "M", "LS-G"));
    const d = await ds.createProduct(mk("Nike Air Max 90 Retro", "HHHHH", "L", "LS-H"));
    await ds.mergeProducts(c.product.id, [d.product.id], "u1");
    expect((await ds.getProducts()).find((p) => p.id === c.product.id)!.title).toBe("Nike Air Max 90");
  });
});

describe("FixtureDataSource: publicación al desactivar y unir", () => {
  it("unir deja los orígenes sin publicar; el destino conserva su estado", async () => {
    const ds = new FixtureDataSource();
    const a = await ds.createProduct(mk("Polo - M", "GGGGG", "M", "LS-G"));
    const b = await ds.createProduct(mk("Polo - L", "HHHHH", "L", "LS-H"));
    await ds.setProductPublished(a.product.id, true);
    await ds.setProductPublished(b.product.id, true);
    await ds.mergeProducts(a.product.id, [b.product.id], "u1");
    const all = await ds.getProducts();
    expect(all.find((p) => p.id === b.product.id)!.isPublished).toBe(false);
    expect(all.find((p) => p.id === a.product.id)!.isPublished).toBe(true);
  });
});

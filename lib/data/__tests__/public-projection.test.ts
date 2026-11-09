import { describe, it, expect } from "vitest";
import { FixtureDataSource } from "../fixture-source";
import { getPublicCatalog, toPublicProduct } from "../public-projection";
import { parsePublicCodeRequest } from "@/lib/domain/public-code";

const base = {
  barcode: "7501", sku: "LS-000001-1", title: "Playera", brand: "Nike", brandId: "b1", departmentId: "d1",
  publicCode: "K7Q2M", price: 250, category: "Playeras", initialStock: 7, locationId: "loc-1", userId: "u1",
};

describe("proyección pública (B1)", () => {
  it("no expone sku, barcode, inventory, locationId ni cifras de stock", async () => {
    const ds = new FixtureDataSource();
    const store = (await ds.getLocations()).find((l) => l.type === "store")!;
    await ds.createProduct({ ...base, locationId: store.id });
    const json = JSON.stringify(await getPublicCatalog(ds));
    for (const k of ["sku", "barcode", "inventory", "locationId", "LS-000001-1", "7501", '"available":7']) {
      expect(json).not.toContain(k);
    }
    const [p] = (await getPublicCatalog(ds)).filter((x) => x.publicCode === "K7Q2M");
    expect(p.sizes).toEqual([{ size: "U", available: true }]);
    expect(p.price).toBe(250);
  });

  it("disponible solo con stock en tiendas, no en bodegas", () => {
    const p = {
      id: "p", title: "t", brand: "b", category: "c", imageUrl: null, publicCode: "AAAAA",
      variants: [{ id: "v", sku: "s", title: "t", size: "M", color: "x", price: 1, barcode: null,
        inventory: [{ locationId: "wh", available: 9 }, { locationId: "st", available: 0 }] }],
    };
    expect(toPublicProduct(p, new Set(["st"])).sizes).toEqual([{ size: "M", available: false }]);
  });

  it("excluye productos y variantes inactivos", async () => {
    const mk = (active: boolean) => ({
      id: "p", title: "t", brand: "b", category: "c", imageUrl: null, publicCode: "AAAAA", isActive: active,
      variants: [{ id: "v", sku: "s", title: "t", size: "M", color: "x", price: 1, barcode: null, isActive: false, inventory: [] }],
    });
    expect(toPublicProduct(mk(true), new Set()).sizes).toEqual([]);
    const ds = new FixtureDataSource();
    const all = await getPublicCatalog(ds);
    expect(all.every((p) => p.sizes.length > 0)).toBe(true);
  });
});

describe("parsePublicCodeRequest", () => {
  it("lee código y talla sin importar mayúsculas", () => {
    expect(parsePublicCodeRequest("hola, quiero apartar. código k7q2m talla m")).toEqual({ kind: "ok", code: "K7Q2M", size: "M" });
    expect(parsePublicCodeRequest("Codigo K7Q2M")).toEqual({ kind: "ok", code: "K7Q2M", size: null });
  });
  it("marca inválido el formato incorrecto y none si no hay código", () => {
    expect(parsePublicCodeRequest("Código K7Q2")).toEqual({ kind: "invalid" });
    expect(parsePublicCodeRequest("Código K7Q2U")).toEqual({ kind: "invalid" });
    expect(parsePublicCodeRequest("quiero apartar")).toEqual({ kind: "none" });
  });
});

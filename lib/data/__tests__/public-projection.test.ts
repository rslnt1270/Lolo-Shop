import { describe, it, expect } from "vitest";
import { FixtureDataSource } from "../fixture-source";
import { getPublicCatalog, toPublicProduct } from "../public-projection";
import { parsePublicCodeRequest } from "@/lib/domain/public-code";
import type { Product } from "@/lib/domain/types";
import type { InventoryDataSource } from "../source";

const base = {
  barcode: "7501", sku: "LS-000001-1", title: "Playera", brand: "Nike", brandId: "b1", departmentId: "d1",
  publicCode: "K7Q2M", price: 250, category: "Playeras", initialStock: 7, locationId: "loc-1", userId: "u1",
  imageUrl: "https://a/f.jpg", backImageUrl: "https://a/b.jpg",
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
    const variant = (id: string, size: string, isActive?: boolean) => ({
      id, sku: `S-${id}`, title: size, size, color: "x", price: 100, barcode: null,
      ...(isActive === undefined ? {} : { isActive }),
      inventory: [{ locationId: "st", available: 3 }],
    });
    const product = (id: string, publicCode: string, variants: ReturnType<typeof variant>[], isActive?: boolean) => ({
      id, title: `t-${id}`, brand: "b", category: "c", imageUrl: "https://a/f.jpg", backImageUrl: "https://a/b.jpg", publicCode, variants,
      ...(isActive === undefined ? {} : { isActive }),
    });
    const products: Product[] = [
      product("activo", "AAAAA", [variant("a1", "M", true), variant("a2", "L", false)]),
      product("inactivo", "BBBBB", [variant("b1", "M", true)], false),
      product("sin-variantes-activas", "CCCCC", [variant("c1", "M", false)], true),
    ];
    const ds = {
      getProducts: async () => products,
      getLocations: async () => [{ id: "st", name: "Tienda", type: "store" as const }],
    } as unknown as InventoryDataSource;

    const catalog = await getPublicCatalog(ds);
    expect(catalog.map((p) => p.publicCode)).toEqual(["AAAAA"]);
    // La variante inactiva (L) no aparece aunque tenga stock.
    expect(catalog[0].sizes).toEqual([{ size: "M", available: true }]);
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

describe("catálogo público: solo productos con las dos fotos", () => {
  it("un producto de solo stock no aparece; con frente y atrás sí, con backImageUrl", async () => {
    const ds = new FixtureDataSource();
    const store = (await ds.getLocations()).find((l) => l.type === "store")!;
    await ds.createProduct({ ...base, imageUrl: null, backImageUrl: null, locationId: store.id, publicCode: "AAAA1", sku: "S-1", barcode: "9001" });
    await ds.createProduct({
      ...base, locationId: store.id, publicCode: "BBBB2", sku: "S-2", barcode: "9002",
      imageUrl: "https://a/f.jpg", backImageUrl: "https://a/b.jpg",
    });
    await ds.createProduct({
      ...base, locationId: store.id, publicCode: "CCCC3", sku: "S-3", barcode: "9003", imageUrl: "https://a/f.jpg", backImageUrl: null,
    });
    const codes = (await getPublicCatalog(ds)).map((p) => p.publicCode);
    expect(codes).not.toContain("AAAA1");
    expect(codes).not.toContain("CCCC3");
    const both = (await getPublicCatalog(ds)).find((p) => p.publicCode === "BBBB2")!;
    expect(both.imageUrl).toBe("https://a/f.jpg");
    expect(both.backImageUrl).toBe("https://a/b.jpg");
  });
});

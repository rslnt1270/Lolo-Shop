import { describe, it, expect } from "vitest";
import { FixtureDataSource } from "../fixture-source";
import { uniqueViolationField } from "../errors";
import type { CreateProductData } from "../source";

const product = {
  title: "A", brand: "B", brandId: "b1", departmentId: "d1", publicCode: "K7Q2M",
  category: "Accesorios", locationId: "loc-1", userId: "u1",
};
const variant = { barcode: "DUP-1" as string | null, sku: "LS-000000-0", size: "", price: 1, initialStock: 1 };
/** Alta de una talla; `publicCode` va al producto y lo demás a la variante (antes eran campos sueltos). */
const data = (patch: Partial<typeof variant> & { publicCode?: string } = {}): CreateProductData => {
  const { publicCode, ...v } = patch;
  return { ...product, ...(publicCode ? { publicCode } : {}), variants: [{ ...variant, ...v }] };
};

describe("createProduct: código duplicado", () => {
  it("rechaza un barcode que ya existe (contrato igual al unique de Prisma)", async () => {
    const ds = new FixtureDataSource();
    await ds.createProduct(data());
    const err = await ds.createProduct(data({ sku: "LS-00000Z-Z" })).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(uniqueViolationField(err)).toBe("barcode");
  });

  it("rechaza un sku que ya existe", async () => {
    const ds = new FixtureDataSource();
    await ds.createProduct(data());
    const err = await ds.createProduct(data({ barcode: "OTRO" })).catch((e) => e);
    expect(uniqueViolationField(err)).toBe("sku");
  });

  it("rechaza un publicCode que ya existe", async () => {
    const ds = new FixtureDataSource();
    await ds.createProduct(data());
    const err = await ds.createProduct(data({ barcode: "OTRO", sku: "LS-00000Z-Z" })).catch((e) => e);
    expect(uniqueViolationField(err)).toBe("publicCode");
  });

  it("varios productos sin código (barcode null) no chocan", async () => {
    const ds = new FixtureDataSource();
    await ds.createProduct(data({ barcode: null }));
    await expect(ds.createProduct(data({ barcode: null, sku: "LS-00000Z-Z", publicCode: "AAAAA" }))).resolves.toBeTruthy();
  });
});

describe("FixtureDataSource: estado por instancia", () => {
  it("un alta en una instancia no aparece en otra ni muta los fixtures", async () => {
    const a = new FixtureDataSource();
    await a.createProduct(data({ barcode: "SOLO-A" }));
    const b = new FixtureDataSource();
    expect(await b.getProductByBarcode("SOLO-A")).toBeNull();
    expect(await b.getProducts()).toHaveLength(2);
  });

  it("ajustar inventario en una instancia no afecta a otra", async () => {
    const a = new FixtureDataSource();
    await a.recordStockMovement({
      variantId: "var-1", locationId: "loc-1", type: "RESTOCK", delta: 5, notes: null, requestId: "11111111-1111-4111-8111-111111111111", userId: "u1",
    });
    const b = new FixtureDataSource();
    const match = await b.getProductByVariantId("var-1");
    expect(match?.variant.inventory.find((l) => l.locationId === "loc-1")?.available).toBe(3);
  });
});

describe("FixtureDataSource.getProductByBarcode: barcode o sku con candidatos", () => {
  it("encuentra por barcode exacto", async () => {
    const m = await new FixtureDataSource().getProductByBarcode("7501234567890");
    expect(m?.variant.id).toBe("var-3");
  });

  it("encuentra por sku (incluso tecleado en minúsculas y con espacios)", async () => {
    const m = await new FixtureDataSource().getProductByBarcode("  ls-hoo-nyy-m-neg ");
    expect(m?.variant.id).toBe("var-1");
  });

  it("UPC-A escaneado encuentra el EAN-13 guardado con 0 inicial", async () => {
    const ds = new FixtureDataSource();
    await ds.createProduct(data({ barcode: "0036000291452" }));
    const m = await ds.getProductByBarcode("036000291452");
    expect(m?.variant.barcode).toBe("0036000291452");
  });

  it("código vacío o inexistente → null", async () => {
    const ds = new FixtureDataSource();
    expect(await ds.getProductByBarcode("   ")).toBeNull();
    expect(await ds.getProductByBarcode("NO-EXISTE")).toBeNull();
  });
});

describe("FixtureDataSource.createProduct: talla", () => {
  it("guarda la talla o U por defecto", async () => {
    const ds = new FixtureDataSource();
    expect((await ds.createProduct(data({ barcode: "T1", sku: "LS-000001-1" }))).variants[0].size).toBe("U");
    expect((await ds.createProduct(data({ barcode: "T2", sku: "LS-000002-2", publicCode: "BBBBB", size: "M" }))).variants[0].size).toBe("M");
  });
});

describe("FixtureDataSource.getProductByBarcode: mayúsculas en alfanuméricos", () => {
  it("existe 'abc-1' (dato viejo) y se busca 'ABC-1' → lo encuentra", async () => {
    const ds = new FixtureDataSource();
    await ds.createProduct(data({ barcode: "abc-1" }));
    // El alta ya guarda "ABC-1": se simula el dato viejo en minúsculas sobre el estado en memoria.
    const stored = (await ds.getProducts()).flatMap((p) => p.variants).find((v) => v.barcode === "ABC-1")!;
    stored.barcode = "abc-1";
    expect((await ds.getProductByBarcode("ABC-1"))?.variant.barcode).toBe("abc-1");
    expect((await ds.getProductByBarcode("Abc-1"))?.variant.barcode).toBe("abc-1");
  });
});

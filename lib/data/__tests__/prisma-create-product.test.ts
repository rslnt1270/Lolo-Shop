import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
const movementCreate = vi.fn();
const findFirst = vi.fn();
const tx = { product: { create: (...a: unknown[]) => create(...a) }, movement: { create: (...a: unknown[]) => movementCreate(...a) } };
const $transaction = vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx));

vi.mock("../../prisma", () => ({
  default: {
    product: { create: (...a: unknown[]) => create(...a) },
    variant: { findFirst: (...a: unknown[]) => findFirst(...a) },
    $transaction: (fn: (t: typeof tx) => unknown) => $transaction(fn),
  },
}));

import { PrismaDataSource } from "../prisma-source";

describe("PrismaDataSource.createProduct", () => {
  beforeEach(() => {
    $transaction.mockClear();
    movementCreate.mockReset().mockResolvedValue({});
    create.mockReset().mockImplementation(async ({ data }: any) => ({
      id: "p1", title: data.title, brand: data.brand, category: data.category, imageUrl: data.imageUrl ?? null,
      variants: [{
        id: "v1", size: data.variants.create.size, color: "General", title: data.title, sku: data.variants.create.sku,
        barcode: data.variants.create.barcode, price: data.variants.create.price,
        inventory: [{ locationId: data.variants.create.inventory.create.locationId, available: data.variants.create.inventory.create.available }],
      }],
    }));
  });

  const base = {
    barcode: "750123", sku: "LS-000000-0", title: "Gorra", brand: "Lolo", price: 100,
    category: "Accesorios", locationId: "loc-1", userId: "u1",
  };

  it("persiste categoría, sku, talla y stock inicial dentro de una transacción", async () => {
    await new PrismaDataSource().createProduct({ ...base, initialStock: 7, size: "M" });
    expect($transaction).toHaveBeenCalledOnce();
    const data = create.mock.calls[0][0].data;
    expect(data.category).toBe("Accesorios");
    expect(data.variants.create.sku).toBe("LS-000000-0");
    expect(data.variants.create.size).toBe("M");
    expect(data.variants.create.inventory.create.available).toBe(7);
  });

  it("talla por defecto U y barcode null permitido", async () => {
    await new PrismaDataSource().createProduct({ ...base, barcode: null, initialStock: 0 });
    const data = create.mock.calls[0][0].data;
    expect(data.variants.create.size).toBe("U");
    expect(data.variants.create.barcode).toBeNull();
  });

  it("devuelve en inventory el stock inicial real, no un 1 fijo", async () => {
    const { variant } = await new PrismaDataSource().createProduct({ ...base, initialStock: 0 });
    expect(variant.inventory).toEqual([{ locationId: "loc-1", available: 0 }]);
    const r2 = await new PrismaDataSource().createProduct({ ...base, initialStock: 4 });
    expect(r2.variant.inventory).toEqual([{ locationId: "loc-1", available: 4 }]);
  });

  it("registra Movement RESTOCK con el stock inicial y el usuario", async () => {
    await new PrismaDataSource().createProduct({ ...base, initialStock: 3 });
    expect(movementCreate).toHaveBeenCalledWith({
      data: { variantId: "v1", locationId: "loc-1", userId: "u1", delta: 3, type: "RESTOCK", notes: "alta" },
    });
  });

  it("sin stock inicial no registra Movement", async () => {
    await new PrismaDataSource().createProduct({ ...base, initialStock: 0 });
    expect(movementCreate).not.toHaveBeenCalled();
  });

  it("propaga el error de la transacción (p. ej. P2002) sin tragarlo", async () => {
    create.mockRejectedValueOnce(Object.assign(new Error("Unique"), { code: "P2002", meta: { target: ["barcode"] } }));
    await expect(new PrismaDataSource().createProduct({ ...base, initialStock: 1 })).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("PrismaDataSource.getProductByBarcode", () => {
  beforeEach(() => {
    findFirst.mockReset().mockResolvedValue(null);
  });

  it("busca por barcode o sku con todos los candidatos", async () => {
    await new PrismaDataSource().getProductByBarcode(" 036000291452\n");
    const where = findFirst.mock.calls[0][0].where;
    expect(where).toEqual({
      OR: [
        { barcode: { in: ["036000291452", "0036000291452"] } },
        { sku: { in: ["036000291452", "0036000291452"] } },
      ],
    });
  });

  it("alfanumérico: compara sin distinguir mayúsculas (datos viejos en minúsculas)", async () => {
    await new PrismaDataSource().getProductByBarcode("ABC-1");
    const where = findFirst.mock.calls[0][0].where;
    expect(where).toEqual({
      OR: [
        { barcode: { equals: "ABC-1", mode: "insensitive" } },
        { sku: { equals: "ABC-1", mode: "insensitive" } },
      ],
    });
  });

  it("código vacío → null sin consultar", async () => {
    expect(await new PrismaDataSource().getProductByBarcode("  ")).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("mapea la variante encontrada", async () => {
    findFirst.mockResolvedValue({
      id: "v9", size: "M", color: "Negro", title: "Gorra", sku: "LS-ABC123-0", barcode: null, price: "120.50",
      inventory: [{ locationId: "loc-1", available: 2 }],
      product: { id: "p9", title: "Gorra", brand: "Lolo", category: "Accesorios", imageUrl: null },
    });
    const m = await new PrismaDataSource().getProductByBarcode("ls-abc123-0");
    expect(m?.variant).toMatchObject({ id: "v9", sku: "LS-ABC123-0", price: 120.5 });
    expect(m?.product.id).toBe("p9");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
let ds: import("@/lib/data/fixture-source").FixtureDataSource;

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/data/get-source", () => ({ getDataSource: () => ds }));
vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { mergeProductsAction } from "../actions";
import { FixtureDataSource } from "@/lib/data/fixture-source";
import { UnauthenticatedError } from "@/lib/auth/errors";

const as = (role: string, locationId: string | null = null) =>
  getCurrentUser.mockResolvedValue({ id: "u1", role, locationId });

let a: string;
let b: string;

async function make(title: string, size: string, code: string, brandId = "brand-1") {
  const store = (await ds.getLocations())[0];
  const { product } = await ds.createProduct({
    title, brand: "Nautica", brandId, departmentId: "d1", publicCode: code, category: "Polos",
    variants: [{ barcode: null, sku: `SKU-${code}`, size, price: 100, initialStock: 2 }],
    locationId: store.id, userId: "u1",
  });
  return product.id;
}

beforeEach(async () => {
  vi.clearAllMocks();
  ds = new FixtureDataSource();
  as("owner");
  a = await make("Polo Nautica - M", "M", "AAAAA");
  b = await make("Polo Nautica - L", "L", "BBBBB");
});

describe("mergeProductsAction", () => {
  it.each([["manager"], ["collaborator"]])("%s recibe FORBIDDEN y no cambia nada", async (role) => {
    as(role, "loc-1");
    await expect(mergeProductsAction({ targetId: a, sourceIds: [b] })).resolves.toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect((await ds.getProducts()).find((p) => p.id === b)?.mergedIntoId ?? null).toBeNull();
  });

  it("JWT de owner degradado a colaborador en la base: FORBIDDEN", async () => {
    as("collaborator", "loc-1");
    await expect(mergeProductsAction({ targetId: a, sourceIds: [b] })).resolves.toMatchObject({ code: "FORBIDDEN" });
  });

  it("sin sesión: SESSION", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError("x"));
    await expect(mergeProductsAction({ targetId: a, sourceIds: [b] })).resolves.toMatchObject({ ok: false, code: "SESSION", message: "Tu sesión terminó. Vuelve a iniciar sesión." });
  });

  it("sourceIds vacío o con el destino: INVALID", async () => {
    await expect(mergeProductsAction({ targetId: a, sourceIds: [] })).resolves.toMatchObject({ ok: false, code: "INVALID" });
    await expect(mergeProductsAction({ targetId: a, sourceIds: [b, a] })).resolves.toMatchObject({ ok: false, code: "INVALID" });
    await expect(mergeProductsAction({ targetId: "", sourceIds: [b] })).resolves.toMatchObject({ ok: false, code: "INVALID" });
  });

  it("owner une: mueve la talla y devuelve los conteos", async () => {
    const res = await mergeProductsAction({ targetId: a, sourceIds: [b] });
    expect(res).toEqual({ ok: true, movedVariants: 1, movedSaleLines: 0, alreadyMerged: 0 });
    const products = await ds.getProducts();
    expect(products.find((p) => p.id === a)!.variants.map((v) => v.size).sort()).toEqual(["L", "M"]);
    expect(products.find((p) => p.id === b)).toMatchObject({ isActive: false, mergedIntoId: a });
  });

  it("repetir devuelve alreadyMerged sin cambios", async () => {
    await mergeProductsAction({ targetId: a, sourceIds: [b] });
    await expect(mergeProductsAction({ targetId: a, sourceIds: [b] })).resolves.toEqual({
      ok: true, movedVariants: 0, movedSaleLines: 0, alreadyMerged: 1,
    });
  });

  it("marcas distintas: INVALID con mensaje claro", async () => {
    const c = await make("Polo Nautica - XL", "XL", "CCCCC", "brand-2");
    const res = await mergeProductsAction({ targetId: a, sourceIds: [c] });
    expect(res).toMatchObject({ ok: false, code: "INVALID" });
  });
});

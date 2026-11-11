import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
let source: import("@/lib/data/fixture-source").FixtureDataSource;

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    brand: { findUnique: vi.fn().mockResolvedValue({ name: "Lolo", isActive: true }) },
    department: { findUnique: vi.fn().mockResolvedValue({ isActive: true, slug: "accesorios" }) },
    productType: { findUnique: vi.fn().mockResolvedValue({ slug: "gorra", name: "Gorras", isActive: true, departments: [{ departmentId: "d1" }] }) },
  },
}));
vi.mock("@/lib/auth/password", () => ({ changePassword: vi.fn() }));
vi.mock("@/lib/data/get-source", () => ({ getDataSource: () => source }));

import { addVariantAction, createProductAction, recordStockMovementAction } from "../actions";
import { mergeProductsAction, updateVariantPriceAction } from "../products/actions";
import { FixtureDataSource } from "../data/fixture-source";
import { DB_TIMEOUT_TEXT, isTransactionTimeout } from "../data/errors";

/** Misma forma que `PrismaClientKnownRequestError` P2028 (transacción vencida). */
const p2028 = () => Object.assign(new Error("Transaction already closed: timeout"), { code: "P2028" });
const timeout = { ok: false, code: "ERROR", message: DB_TIMEOUT_TEXT };

let variantId: string;
let lomas: string;
let club: string;

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  source = new FixtureDataSource();
  getCurrentUser.mockReset().mockResolvedValue({ id: "u1", role: "owner", locationId: null });
  const p = (await source.getProducts())[0];
  variantId = p.variants[0].id;
  lomas = (await source.getLocations())[0].id;
  club = (await source.createLocation({ name: "ClubAlva" })).id;
});

describe("isTransactionTimeout", () => {
  it("reconoce P2028 (transacción vencida) y P2024 (sin conexión del pool a tiempo)", () => {
    expect(isTransactionTimeout(p2028())).toBe(true);
    expect(isTransactionTimeout({ code: "P2024" })).toBe(true);
    expect(isTransactionTimeout({ code: "P2002" })).toBe(false);
    expect(isTransactionTimeout(new Error("x"))).toBe(false);
    expect(isTransactionTimeout(undefined)).toBe(false);
  });
});

describe("P2028 en las acciones: 'La base tardó en responder; reintenta'", () => {
  it("entrada de stock", async () => {
    vi.spyOn(source, "recordStockMovement").mockRejectedValue(p2028());
    expect(
      await recordStockMovementAction({ variantId, locationId: lomas, kind: "restock", quantity: 1, requestId: crypto.randomUUID() }),
    ).toEqual(timeout);
  });

  it("alta", async () => {
    vi.spyOn(source, "createProduct").mockRejectedValue(p2028());
    const res = await createProductAction({
      title: "Gorra", brandId: "b1", departmentId: "d1", productTypeId: "type-gorra", locationId: lomas, mode: "stock",
      sizes: [{ size: "U", barcode: null, price: 100, initialStock: 1 }],
    });
    expect(res).toEqual(timeout);
  });

  it("agregar talla", async () => {
    vi.spyOn(source, "addVariant").mockRejectedValue(p2028());
    const productId = (await source.getProducts())[0].id;
    const res = await addVariantAction({ productId, size: "XL", barcode: null, price: 100, initialStock: 1, locationId: lomas });
    expect(res).toEqual(timeout);
  });

  it("precio", async () => {
    vi.spyOn(source, "updateVariantPrice").mockRejectedValue(p2028());
    expect(await updateVariantPriceAction({ variantId, newPrice: 123, expectedPrice: 100 })).toEqual(timeout);
  });

  it("unir productos", async () => {
    vi.spyOn(source, "mergeProducts").mockRejectedValue(p2028());
    expect(await mergeProductsAction({ targetId: "a", sourceIds: ["b"] })).toEqual(timeout);
  });
});

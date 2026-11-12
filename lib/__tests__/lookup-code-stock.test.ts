import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const getProductByBarcode = vi.fn();
const getStockAt = vi.fn();
const listVariantStockAt = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("@/lib/data/get-source", () => ({
  getDataSource: () => ({ getProductByBarcode, getStockAt, listVariantStockAt }),
}));
vi.mock("@/lib/auth/password", () => ({ changePassword: vi.fn() }));

import { lookupCodeAction, listVariantStockAtAction } from "../actions";

const variant = () => ({ id: "v1", sku: "S", title: "M", size: "M", color: "", price: 1, barcode: "123", inventory: [] });
const product = () => ({ id: "p1", title: "Playera", brand: "X", category: "Ropa", variants: [variant()] });
const user = (role: string, locationId: string | null) => ({ id: "u1", role, locationId });
const ROW = { variantId: "v1", size: "M", sku: "S", price: 1, available: 2 };

beforeEach(() => {
  getCurrentUser.mockReset().mockResolvedValue(user("collaborator", "l1"));
  getProductByBarcode.mockReset().mockResolvedValue({ product: product(), variant: variant() });
  getStockAt.mockReset().mockResolvedValue({ available: 0, sold: true });
  listVariantStockAt.mockReset().mockResolvedValue([ROW]);
});

describe("lookupCodeAction con tienda", () => {
  it("lookupCodeAction con locationId incluye stock de la talla en esa tienda", async () => {
    const r = await lookupCodeAction("123", "l1");
    expect(r).toMatchObject({ found: true, variantId: "v1", stock: { available: 0, sold: true } });
    expect(getStockAt).toHaveBeenCalledWith("v1", "l1");
  });

  it("lookupCodeAction sin locationId no agrega stock", async () => {
    const r = await lookupCodeAction("123");
    expect(r.found).toBe(true);
    expect(r).not.toHaveProperty("stock");
    expect(getStockAt).not.toHaveBeenCalled();
  });

  it("lookupCodeAction con locationId ajeno responde el error de tienda", async () => {
    const r = await lookupCodeAction("123", "l2");
    expect(r).toEqual({ found: false, code: "123", error: "Solo puedes operar en tu tienda asignada." });
    expect(getStockAt).not.toHaveBeenCalled();
    expect(getProductByBarcode).not.toHaveBeenCalled();
  });

  it("el owner puede consultar cualquier tienda", async () => {
    getCurrentUser.mockResolvedValue(user("owner", null));
    expect(await lookupCodeAction("123", "l2")).toMatchObject({ found: true, stock: { available: 0 } });
  });

  it("si falla la consulta de existencias devuelve found sin stock", async () => {
    getStockAt.mockRejectedValue(new Error("db"));
    const r = await lookupCodeAction("123", "l1");
    expect(r.found).toBe(true);
    expect(r).not.toHaveProperty("stock");
  });
});

describe("listVariantStockAtAction", () => {
  it("devuelve las tallas de la tienda propia", async () => {
    expect(await listVariantStockAtAction("p1", "l1")).toEqual([ROW]);
    expect(listVariantStockAt).toHaveBeenCalledWith("p1", "l1");
  });

  it("listVariantStockAtAction de un colaborador en otra tienda devuelve []", async () => {
    expect(await listVariantStockAtAction("p1", "l2")).toEqual([]);
    expect(listVariantStockAt).not.toHaveBeenCalled();
  });

  it("sin sesión devuelve null", async () => {
    getCurrentUser.mockRejectedValue(Object.assign(new Error("x"), {}));
    const { UnauthenticatedError } = await import("../auth/errors");
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    expect(await listVariantStockAtAction("p1", "l1")).toBeNull();
  });
});

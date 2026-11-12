import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const getProducts = vi.fn();
const getProductByBarcode = vi.fn();
const getProductByVariantId = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("@/lib/data/get-source", () => ({
  getDataSource: () => ({ getProducts, getProductByBarcode, getProductByVariantId }),
}));
vi.mock("@/lib/auth/password", () => ({ changePassword: vi.fn() }));

import { fetchProductsAction, lookupCodeAction, getProductByBarcodeAction, getProductByVariantIdAction } from "../actions";

const inv = () => [{ locationId: "loc-1", available: 3 }, { locationId: "loc-2", available: 5 }];
const variant = () => ({ id: "v1", sku: "S", title: "M", size: "M", color: "", price: 1, barcode: "123", inventory: inv() });
const product = () => ({ id: "p1", title: "Playera", brand: "X", category: "Ropa", variants: [variant()] });
const user = (role: string, locationId: string | null) => ({ id: "u1", role, locationId });

beforeEach(() => {
  getCurrentUser.mockReset();
  getProducts.mockReset().mockResolvedValue([product()]);
  getProductByBarcode.mockReset().mockResolvedValue({ product: product(), variant: variant() });
  getProductByVariantId.mockReset().mockResolvedValue({ product: product(), variant: variant() });
});

describe("recorte de stock por tienda", () => {
  it("lookupCodeAction de un colaborador de loc-1 no trae la fila de loc-2", async () => {
    getCurrentUser.mockResolvedValue(user("collaborator", "loc-1"));
    const r = await lookupCodeAction("123");
    expect(r.found && r.product.variants[0].inventory).toEqual([{ locationId: "loc-1", available: 3 }]);
    expect(JSON.stringify(r)).not.toContain("loc-2");
  });

  it("fetchProductsAction de un colaborador no trae filas de otra tienda", async () => {
    getCurrentUser.mockResolvedValue(user("collaborator", "loc-1"));
    const r = await fetchProductsAction();
    expect(JSON.stringify(r)).not.toContain("loc-2");
    const m1 = await getProductByBarcodeAction("123");
    const m2 = await getProductByVariantIdAction("v1");
    expect(JSON.stringify([m1, m2])).not.toContain("loc-2");
  });

  it("sesión vieja de owner con rol colaborador en la base: se recorta", async () => {
    // getCurrentUser relee la base: devuelve collaborator aunque el JWT diga owner.
    getCurrentUser.mockResolvedValue(user("collaborator", "loc-2"));
    const r = await fetchProductsAction();
    expect(r?.[0].variants[0].inventory).toEqual([{ locationId: "loc-2", available: 5 }]);
  });

  it("owner y manager ven todas las tiendas", async () => {
    getCurrentUser.mockResolvedValue(user("owner", null));
    expect((await fetchProductsAction())?.[0].variants[0].inventory).toHaveLength(2);
    getCurrentUser.mockResolvedValue(user("manager", "loc-1"));
    expect((await fetchProductsAction())?.[0].variants[0].inventory).toHaveLength(2);
  });
});

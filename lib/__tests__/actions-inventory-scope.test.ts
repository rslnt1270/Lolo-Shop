import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const getProducts = vi.fn();
const getProductByBarcode = vi.fn();
const getProductByVariantId = vi.fn();
const getLocations = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("@/lib/data/get-source", () => ({
  getDataSource: () => ({ getProducts, getProductByBarcode, getProductByVariantId, getLocations }),
}));
vi.mock("@/lib/auth/password", () => ({ changePassword: vi.fn() }));

import { fetchLocationsAction, fetchProductsAction, lookupCodeAction, getProductByBarcodeAction, getProductByVariantIdAction } from "../actions";

const inv = () => [{ locationId: "loc-1", available: 3 }, { locationId: "loc-2", available: 5 }];
const variant = () => ({ id: "v1", sku: "S", title: "M", size: "M", color: "", price: 1, barcode: "123", inventory: inv() });
const product = () => ({ id: "p1", title: "Playera", brand: "X", category: "Ropa", variants: [variant()] });
const user = (role: string, locationId: string | null) => ({ id: "u1", role, locationId });

beforeEach(() => {
  getCurrentUser.mockReset();
  getProducts.mockReset().mockResolvedValue([product()]);
  getProductByBarcode.mockReset().mockResolvedValue({ product: product(), variant: variant() });
  getLocations.mockReset().mockResolvedValue([
    { id: "loc-1", name: "Centro", type: "store" },
    { id: "loc-2", name: "Norte", type: "store" },
  ]);
  getProductByVariantId.mockReset().mockResolvedValue({ product: product(), variant: variant() });
});

describe("existencias de todas las tiendas (#39)", () => {
  it("lookupCodeAction de un colaborador de loc-1 trae las filas de todas las tiendas", async () => {
    getCurrentUser.mockResolvedValue(user("collaborator", "loc-1"));
    const r = await lookupCodeAction("123");
    expect(r.found && r.product.variants[0].inventory).toEqual(inv());
  });

  it("fetchProductsAction y las búsquedas por código del colaborador no recortan filas", async () => {
    getCurrentUser.mockResolvedValue(user("collaborator", "loc-1"));
    expect((await fetchProductsAction())?.[0].variants[0].inventory).toEqual(inv());
    const m1 = await getProductByBarcodeAction("123");
    const m2 = await getProductByVariantIdAction("v1");
    expect(m1?.variant.inventory).toEqual(inv());
    expect(m2?.product.variants[0].inventory).toEqual(inv());
  });

  it("colaborador sin tienda también ve todas las filas", async () => {
    getCurrentUser.mockResolvedValue(user("collaborator", null));
    expect((await fetchProductsAction())?.[0].variants[0].inventory).toHaveLength(2);
  });

  it("owner y manager ven todas las tiendas", async () => {
    getCurrentUser.mockResolvedValue(user("owner", null));
    expect((await fetchProductsAction())?.[0].variants[0].inventory).toHaveLength(2);
    getCurrentUser.mockResolvedValue(user("manager", "loc-1"));
    expect((await fetchProductsAction())?.[0].variants[0].inventory).toHaveLength(2);
  });

  it("fetchLocationsAction: el colaborador recibe todas las tiendas, con o sin tienda asignada", async () => {
    getCurrentUser.mockResolvedValue(user("collaborator", "loc-1"));
    expect((await fetchLocationsAction())?.map((l) => l.id)).toEqual(["loc-1", "loc-2"]);
    getCurrentUser.mockResolvedValue(user("collaborator", null));
    expect(await fetchLocationsAction()).toHaveLength(2);
  });

  it("owner y manager reciben todas", async () => {
    getCurrentUser.mockResolvedValue(user("owner", null));
    expect(await fetchLocationsAction()).toHaveLength(2);
    getCurrentUser.mockResolvedValue(user("manager", "loc-1"));
    expect(await fetchLocationsAction()).toHaveLength(2);
  });
});

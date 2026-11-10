import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";

const getCurrentUser = vi.fn();
const createProduct = vi.fn();
const getProductByBarcode = vi.fn();
const getLocations = vi.fn();
const getProducts = vi.fn();
const createLocation = vi.fn();
const updateProductImage = vi.fn();
const updateProductBackImage = vi.fn();
const productFindUnique = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    brand: { findUnique: vi.fn().mockResolvedValue({ name: "Lolo", isActive: true }) },
    department: { findUnique: vi.fn().mockResolvedValue({ isActive: true }) },
    product: { findUnique: (...a: unknown[]) => productFindUnique(...a) },
  },
}));
vi.mock("@/lib/data/get-source", () => ({
  getDataSource: () => ({
    createProduct, getProductByBarcode, getLocations, getProducts, createLocation, updateProductImage, updateProductBackImage,
  }),
}));
vi.mock("@/lib/image/upload", async (orig) => ({
  ...(await orig<typeof import("@/lib/image/upload")>()),
  uploadImage: vi.fn().mockResolvedValue("https://abc.public.blob.vercel-storage.com/productos/n.jpg"),
}));
vi.mock("@/lib/auth/password", () => ({ changePassword: vi.fn() }));

import {
  createLocationAction, createProductAction, fetchProductsAction, fetchLocationsAction, setProductBackImageAction,
  type CreateProductInput,
} from "../actions";
import { ForbiddenError, UnauthenticatedError } from "../auth/errors";

const input: CreateProductInput = {
  title: "Gorra", brandId: "b1", departmentId: "d1", category: "Accesorios", locationId: "loc-clubalva",
  sizes: [{ size: "", barcode: "4006381333931", price: 10, initialStock: 2 }],
};
const user = (role: string, locationId: string | null) => ({ id: "u1", role, locationId });
const GOOD = "https://abc.public.blob.vercel-storage.com/productos/x.jpg";

beforeEach(() => {
  getCurrentUser.mockReset();
  createProduct.mockReset();
  getProductByBarcode.mockReset().mockResolvedValue(null);
  getLocations.mockReset().mockResolvedValue([{ id: "loc-clubalva", name: "A" }, { id: "loc-lomas", name: "B" }]);
  productFindUnique.mockReset();
  updateProductBackImage.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("rol y tienda salen de la base, no del JWT", () => {
  it("la base dice colaborador: createLocationAction rechaza con ForbiddenError", async () => {
    getCurrentUser.mockResolvedValue(user("collaborator", "loc-lomas"));
    await expect(createLocationAction({ name: "Nueva" })).rejects.toBeInstanceOf(ForbiddenError);
    expect(createLocation).not.toHaveBeenCalled();
  });
  it("la base dice colaborador de otra tienda: createProductAction → FORBIDDEN", async () => {
    getCurrentUser.mockResolvedValue(user("collaborator", "loc-lomas"));
    expect(await createProductAction(input)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(createProduct).not.toHaveBeenCalled();
  });
  it("manager con tienda loc-lomas y alta en loc-clubalva → FORBIDDEN", async () => {
    getCurrentUser.mockResolvedValue(user("manager", "loc-lomas"));
    expect(await createProductAction(input)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});

describe("usuario borrado / sesión vencida", () => {
  beforeEach(() => { getCurrentUser.mockRejectedValue(new UnauthenticatedError()); });
  it("fetchProductsAction y fetchLocationsAction resuelven null", async () => {
    expect(await fetchProductsAction()).toBeNull();
    expect(await fetchLocationsAction()).toBeNull();
  });
  it("createProductAction → SESSION con el texto único de sesión vencida", async () => {
    const r = await createProductAction(input);
    expect(r).toEqual({ ok: false, code: "SESSION", message: "Tu sesión terminó. Vuelve a iniciar sesión." });
  });
});

describe("fotos", () => {
  it("producto inexistente → NOT_FOUND sin lanzar", async () => {
    getCurrentUser.mockResolvedValue(user("owner", null));
    productFindUnique.mockResolvedValue(null);
    expect(await setProductBackImageAction("no-existe", GOOD)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
  it("producto inactivo → NOT_FOUND", async () => {
    getCurrentUser.mockResolvedValue(user("owner", null));
    productFindUnique.mockResolvedValue({ isActive: false, imageUrl: null, backImageUrl: null });
    expect(await setProductBackImageAction("p1", GOOD)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
  it("colaborador reemplazando una foto existente → FORBIDDEN", async () => {
    getCurrentUser.mockResolvedValue(user("collaborator", "loc-lomas"));
    productFindUnique.mockResolvedValue({ isActive: true, imageUrl: null, backImageUrl: "https://abc.public.blob.vercel-storage.com/productos/old.jpg" });
    expect(await setProductBackImageAction("p1", GOOD)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(updateProductBackImage).not.toHaveBeenCalled();
  });
  it("colaborador poniendo la primera → ok", async () => {
    getCurrentUser.mockResolvedValue(user("collaborator", "loc-lomas"));
    productFindUnique.mockResolvedValue({ isActive: true, imageUrl: null, backImageUrl: null });
    expect(await setProductBackImageAction("p1", GOOD)).toEqual({ ok: true });
  });
  it("manager puede reemplazar", async () => {
    getCurrentUser.mockResolvedValue(user("manager", "loc-lomas"));
    productFindUnique.mockResolvedValue({ isActive: true, imageUrl: null, backImageUrl: "https://abc.public.blob.vercel-storage.com/productos/old.jpg" });
    expect(await setProductBackImageAction("p1", GOOD)).toEqual({ ok: true });
  });
  it("sin sesión → SESSION", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    expect(await setProductBackImageAction("p1", GOOD)).toMatchObject({ ok: false, code: "SESSION" });
  });
  it("BLOB_PUBLIC_HOST rechaza URL de otro store → INVALID", async () => {
    vi.stubEnv("BLOB_PUBLIC_HOST", "abc.public.blob.vercel-storage.com");
    getCurrentUser.mockResolvedValue(user("owner", null));
    productFindUnique.mockResolvedValue({ isActive: true, imageUrl: null, backImageUrl: null });
    expect(
      await setProductBackImageAction("p1", "https://otro.public.blob.vercel-storage.com/productos/x.jpg"),
    ).toMatchObject({ ok: false, code: "INVALID" });
  });
});

describe("código fuente", () => {
  it("lib/actions.ts no usa getServerSession ni session.user.role", () => {
    const src = fs.readFileSync("lib/actions.ts", "utf8");
    expect(src).not.toContain("getServerSession");
    expect(src).not.toContain("session.user.role");
  });
});

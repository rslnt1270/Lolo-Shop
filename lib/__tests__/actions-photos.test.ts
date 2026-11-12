import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const updateProductImage = vi.fn();
const updateProductBackImage = vi.fn();
const setCatalogPhotos = vi.fn();
const productFindUnique = vi.fn();
const uploadImage = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { product: { findUnique: (...a: unknown[]) => productFindUnique(...a) } },
}));
vi.mock("@/lib/data/get-source", () => ({
  getDataSource: () => ({ updateProductImage, updateProductBackImage, setCatalogPhotos }),
}));
vi.mock("@/lib/image/upload", async (orig) => ({
  ...(await orig<typeof import("@/lib/image/upload")>()),
  uploadImage: (...a: unknown[]) => uploadImage(...a),
}));
vi.mock("@/lib/auth/password", () => ({ changePassword: vi.fn() }));

import { setCatalogPhotosAction, setProductBackImageAction, updateProductImageAction } from "../actions";
import { UnauthenticatedError } from "../auth/errors";

const FRONT = "https://abc.public.blob.vercel-storage.com/productos/f.jpg";
const BACK = "https://abc.public.blob.vercel-storage.com/productos/b.jpg";
const user = (role: string) => ({ id: "u1", role, locationId: role === "owner" ? null : "loc-1" });
const form = () => {
  const fd = new FormData();
  fd.append("image", new File([new Uint8Array([1, 2, 3])], "f.jpg", { type: "image/jpeg" }));
  return fd;
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue(user("owner"));
  productFindUnique.mockResolvedValue({ isActive: true, imageUrl: null, backImageUrl: null });
  uploadImage.mockResolvedValue(FRONT);
  updateProductImage.mockResolvedValue(undefined);
  updateProductBackImage.mockResolvedValue(undefined);
  setCatalogPhotos.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("fotos desde la ficha: sin revisión de fondo", () => {
  it("updateProductImageAction y setProductBackImageAction guardan sin photosAnalyzed", async () => {
    expect(await updateProductImageAction("p1", form())).toEqual({ ok: true });
    expect(updateProductImage).toHaveBeenCalledWith("p1", FRONT);
    expect(await setProductBackImageAction("p1", BACK)).toEqual({ ok: true });
    expect(updateProductBackImage).toHaveBeenCalledWith("p1", BACK);
  });

  it("una pestaña vieja que manda { photosAnalyzed: true } también guarda; false o basura se ignoran", async () => {
    const old = updateProductImageAction as unknown as (p: string, f: FormData, o: unknown) => ReturnType<typeof updateProductImageAction>;
    const oldBack = setProductBackImageAction as unknown as (p: string, u: string, o: unknown) => ReturnType<typeof setProductBackImageAction>;
    for (const opts of [{ photosAnalyzed: true }, { photosAnalyzed: false }, "x"]) {
      expect(await old("p1", form(), opts)).toEqual({ ok: true });
      expect(await oldBack("p1", BACK, opts)).toEqual({ ok: true });
    }
  });

  it("cambiar un lado no pasa por setCatalogPhotos (no toca catalogPhotosCheckedAt)", async () => {
    await updateProductImageAction("p1", form());
    await setProductBackImageAction("p1", BACK);
    expect(setCatalogPhotos).not.toHaveBeenCalled();
  });
});

describe("setCatalogPhotosAction", () => {
  const ok = { imageUrl: FRONT, backImageUrl: BACK };

  it("setCatalogPhotosAction con las dos fotos revisadas llama setCatalogPhotos", async () => {
    expect(await setCatalogPhotosAction("p1", ok)).toEqual({ ok: true });
    expect(setCatalogPhotos).toHaveBeenCalledWith("p1", { imageUrl: FRONT, backImageUrl: BACK });
  });

  it("setCatalogPhotosAction guarda sin photosAnalyzed y también con la bandera de una pestaña vieja", async () => {
    expect(await setCatalogPhotosAction("p1", ok)).toEqual({ ok: true });
    expect(await setCatalogPhotosAction("p1", { ...ok, photosAnalyzed: true } as never)).toEqual({ ok: true });
    expect(setCatalogPhotos).toHaveBeenCalledTimes(2);
  });

  it("exige las dos URL de Blob", async () => {
    expect(await setCatalogPhotosAction("p1", { ...ok, backImageUrl: "" })).toMatchObject({ ok: false, code: "INVALID" });
    expect(await setCatalogPhotosAction("p1", { ...ok, imageUrl: "https://evil.example/x.jpg" })).toMatchObject({ ok: false, code: "INVALID" });
    expect(await setCatalogPhotosAction("p1", null as never)).toMatchObject({ ok: false, code: "INVALID" });
    expect(setCatalogPhotos).not.toHaveBeenCalled();
  });

  it("setCatalogPhotosAction del colaborador sigue las reglas de checkPhotoAccess", async () => {
    getCurrentUser.mockResolvedValue(user("collaborator"));
    // Poner las primeras fotos: permitido.
    expect(await setCatalogPhotosAction("p1", ok)).toEqual({ ok: true });
    // Reemplazar una foto ya puesta (de cualquiera de los dos lados): solo owner o manager.
    for (const existing of [{ imageUrl: FRONT, backImageUrl: null }, { imageUrl: null, backImageUrl: BACK }]) {
      setCatalogPhotos.mockClear();
      productFindUnique.mockResolvedValue({ isActive: true, ...existing });
      expect(await setCatalogPhotosAction("p1", ok)).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(setCatalogPhotos).not.toHaveBeenCalled();
    }
    getCurrentUser.mockResolvedValue(user("manager"));
    expect(await setCatalogPhotosAction("p1", ok)).toEqual({ ok: true });
  });

  it("sin sesión → SESSION; producto inexistente → NOT_FOUND", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    expect(await setCatalogPhotosAction("p1", ok)).toMatchObject({ ok: false, code: "SESSION" });
    getCurrentUser.mockResolvedValue(user("owner"));
    productFindUnique.mockResolvedValue(null);
    expect(await setCatalogPhotosAction("p1", ok)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

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
const MSG = "La foto no pasó la revisión de fondo blanco. Tómala de nuevo.";
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

describe("fotos desde la ficha exigen la revisión de fondo", () => {
  it("C18 (server): updateProductImageAction sin photosAnalyzed responde INVALID", async () => {
    for (const opts of [{ photosAnalyzed: false }, undefined, { photosAnalyzed: "true" }]) {
      const r = await updateProductImageAction("p1", form(), opts as unknown as { photosAnalyzed: boolean });
      expect(r).toEqual({ ok: false, code: "INVALID", message: MSG });
    }
    expect(uploadImage).not.toHaveBeenCalled();
    expect(updateProductImage).not.toHaveBeenCalled();
  });

  it("C18 (server): setProductBackImageAction sin photosAnalyzed responde INVALID", async () => {
    const r = await setProductBackImageAction("p1", BACK, { photosAnalyzed: false });
    expect(r).toEqual({ ok: false, code: "INVALID", message: MSG });
    expect(await setProductBackImageAction("p1", BACK, undefined as unknown as { photosAnalyzed: boolean })).toMatchObject({ code: "INVALID" });
    expect(updateProductBackImage).not.toHaveBeenCalled();
  });

  it("con photosAnalyzed las dos acciones guardan", async () => {
    expect(await updateProductImageAction("p1", form(), { photosAnalyzed: true })).toEqual({ ok: true });
    expect(updateProductImage).toHaveBeenCalledWith("p1", FRONT);
    expect(await setProductBackImageAction("p1", BACK, { photosAnalyzed: true })).toEqual({ ok: true });
    expect(updateProductBackImage).toHaveBeenCalledWith("p1", BACK);
  });

  it("cambiar un lado conserva catalogPhotosCheckedAt y no lo pone si era nulo", async () => {
    // Un solo lado nunca pasa por setCatalogPhotos: la marca de revisión no se toca.
    await updateProductImageAction("p1", form(), { photosAnalyzed: true });
    await setProductBackImageAction("p1", BACK, { photosAnalyzed: true });
    expect(setCatalogPhotos).not.toHaveBeenCalled();
  });
});

describe("setCatalogPhotosAction", () => {
  const ok = { imageUrl: FRONT, backImageUrl: BACK, photosAnalyzed: true };

  it("setCatalogPhotosAction con las dos fotos revisadas llama setCatalogPhotos", async () => {
    expect(await setCatalogPhotosAction("p1", ok)).toEqual({ ok: true });
    expect(setCatalogPhotos).toHaveBeenCalledWith("p1", { imageUrl: FRONT, backImageUrl: BACK });
  });

  it("setCatalogPhotosAction sin photosAnalyzed responde INVALID", async () => {
    expect(await setCatalogPhotosAction("p1", { ...ok, photosAnalyzed: false })).toEqual({ ok: false, code: "INVALID", message: MSG });
    expect(setCatalogPhotos).not.toHaveBeenCalled();
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

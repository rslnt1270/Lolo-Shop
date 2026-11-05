import { describe, it, expect, vi, beforeEach } from "vitest";

const getServerSession = vi.fn();
const createProduct = vi.fn();
const getProductByBarcode = vi.fn();
const getLocations = vi.fn();
const revalidatePath = vi.fn();
const uploadImage = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("../auth/options", () => ({ authOptions: {} }));
vi.mock("../image/upload", async (orig) => ({
  ...(await orig<typeof import("../image/upload")>()),
  uploadImage: (...a: unknown[]) => uploadImage(...a),
}));
vi.mock("../auth/password", () => ({ changePassword: vi.fn() }));
vi.mock("../data/get-source", () => ({ getDataSource: () => ({ createProduct, getProductByBarcode, getLocations }) }));

import { createProductAction, lookupCodeAction, uploadProductImageAction, type CreateProductInput } from "../actions";
import { ImageUploadError } from "../image/upload";
import { isValidInternalSku } from "../domain/barcode";

const input: CreateProductInput = {
  barcode: "4006381333931", title: "Gorra", brand: "Lolo", price: 10, category: "Accesorios", initialStock: 2, locationId: "loc-1",
};
const session = (role: string, locationId: string | null) => ({ user: { id: "u1", role, locationId } });
const product = { id: "p1", title: "Gorra", brand: "Lolo", category: "Accesorios", imageUrl: null, variants: [] };
const variant = (sku: string) => ({ id: "v1", sku, title: "Gorra", size: "U", color: "General", price: 10, barcode: "4006381333931", inventory: [{ locationId: "loc-1", available: 2 }] });
const p2002 = (field: string) => Object.assign(new Error("Unique"), { code: "P2002", meta: { target: [field] } });

describe("createProductAction", () => {
  beforeEach(() => {
    getServerSession.mockReset();
    getProductByBarcode.mockReset().mockResolvedValue(null);
    getLocations.mockReset().mockResolvedValue([{ id: "loc-1", name: "Tienda 1" }, { id: "loc-2", name: "Tienda 2" }]);
    createProduct.mockReset().mockImplementation(async (d: { sku: string }) => ({ product, variant: variant(d.sku) }));
    revalidatePath.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sin sesión → FORBIDDEN, sin lanzar", async () => {
    getServerSession.mockResolvedValue(null);
    const r = await createProductAction(input);
    expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(!r.ok && r.message).toMatch(/inicia sesión/i);
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("colaborador no da de alta en otra tienda → FORBIDDEN", async () => {
    getServerSession.mockResolvedValue(session("collaborator", "loc-2"));
    const r = await createProductAction(input);
    expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(!r.ok && r.message).toMatch(/tu tienda/);
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("colaborador sin tienda asignada → FORBIDDEN", async () => {
    getServerSession.mockResolvedValue(session("collaborator", null));
    expect(await createProductAction(input)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("colaborador en su tienda sí puede", async () => {
    getServerSession.mockResolvedValue(session("collaborator", "loc-1"));
    expect(await createProductAction(input)).toMatchObject({ ok: true });
  });

  it.each(["owner", "manager"])("%s (locationId null) da de alta en cualquier tienda existente y revalida", async (role) => {
    getServerSession.mockResolvedValue(session(role, null));
    const r = await createProductAction({ ...input, locationId: "loc-2" });
    expect(r.ok).toBe(true);
    expect(createProduct.mock.calls[0][0]).toMatchObject({ locationId: "loc-2", userId: "u1" });
    expect(revalidatePath).toHaveBeenCalledWith("/catalogo");
    expect(revalidatePath).toHaveBeenCalledWith("/productos");
  });

  it("tienda inexistente → LOCATION", async () => {
    getServerSession.mockResolvedValue(session("owner", null));
    const r = await createProductAction({ ...input, locationId: "loc-x" });
    expect(r).toMatchObject({ ok: false, code: "LOCATION" });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("valida en el servidor → INVALID con mensaje", async () => {
    getServerSession.mockResolvedValue(session("owner", null));
    expect(await createProductAction({ ...input, category: "" })).toMatchObject({ ok: false, code: "INVALID", message: expect.stringMatching(/categoría/i) });
    expect(await createProductAction({ ...input, initialStock: -1 })).toMatchObject({ ok: false, code: "INVALID", message: expect.stringMatching(/stock/i) });
    expect(await createProductAction({ ...input, price: 0 })).toMatchObject({ ok: false, code: "INVALID", message: expect.stringMatching(/precio/i) });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("GTIN con dígito verificador incorrecto → INVALID", async () => {
    getServerSession.mockResolvedValue(session("owner", null));
    const r = await createProductAction({ ...input, barcode: "4006381333932" });
    expect(r).toMatchObject({ ok: false, code: "INVALID", message: expect.stringMatching(/verificador/) });
  });

  it("sin código y sin marcar 'sin código' → INVALID", async () => {
    getServerSession.mockResolvedValue(session("owner", null));
    expect(await createProductAction({ ...input, barcode: "  " })).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("noBarcode → barcode null aunque venga texto", async () => {
    getServerSession.mockResolvedValue(session("owner", null));
    const r = await createProductAction({ ...input, barcode: "999", noBarcode: true });
    expect(r.ok).toBe(true);
    expect(createProduct.mock.calls[0][0].barcode).toBeNull();
    expect(getProductByBarcode).not.toHaveBeenCalled();
  });

  it("normaliza el barcode y genera el SKU en el servidor (ignora sku del cliente)", async () => {
    getServerSession.mockResolvedValue(session("owner", null));
    const r = await createProductAction({ ...input, barcode: " 4006381333931\n", sku: "HACK" } as CreateProductInput);
    const sent = createProduct.mock.calls[0][0];
    expect(sent.barcode).toBe("4006381333931");
    expect(isValidInternalSku(sent.sku)).toBe(true);
    expect(r).toMatchObject({ ok: true, variantId: "v1", sku: sent.sku });
  });

  it("talla, precio redondeado y textos recortados llegan al data source", async () => {
    getServerSession.mockResolvedValue(session("owner", null));
    await createProductAction({ ...input, title: " Gorra ", price: 10.005, size: "M" });
    expect(createProduct.mock.calls[0][0]).toMatchObject({ title: "Gorra", price: 10.01, size: "M" });
  });

  it("alfanumérico se guarda en MAYÚSCULAS y busca duplicado con esa forma; EAN no cambia", async () => {
    getServerSession.mockResolvedValue(session("owner", null));
    await createProductAction({ ...input, barcode: " abc-1 " });
    expect(getProductByBarcode).toHaveBeenCalledWith("ABC-1");
    expect(createProduct.mock.calls[0][0].barcode).toBe("ABC-1");
    await createProductAction(input);
    expect(createProduct.mock.calls[1][0].barcode).toBe("4006381333931");
  });

  it("existe 'abc-1' y se da de alta 'ABC-1' → DUPLICATE", async () => {
    getServerSession.mockResolvedValue(session("owner", null));
    getProductByBarcode.mockImplementation(async (c: string) =>
      c.toLowerCase() === "abc-1" ? { product, variant: { ...variant("LS-X"), id: "v-abc", barcode: "abc-1" } } : null);
    expect(await createProductAction({ ...input, barcode: "ABC-1" })).toMatchObject({ ok: false, code: "DUPLICATE", existingVariantId: "v-abc" });
  });

  it("código ya registrado (lookup) → DUPLICATE con existingVariantId", async () => {
    getServerSession.mockResolvedValue(session("owner", null));
    getProductByBarcode.mockResolvedValue({ product, variant: { ...variant("LS-X"), id: "v-old" } });
    const r = await createProductAction(input);
    expect(r).toMatchObject({ ok: false, code: "DUPLICATE", existingVariantId: "v-old" });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("P2002 en barcode (carrera) → DUPLICATE con existingVariantId", async () => {
    getServerSession.mockResolvedValue(session("owner", null));
    getProductByBarcode.mockResolvedValueOnce(null).mockResolvedValueOnce({ product, variant: { ...variant("LS-X"), id: "v-race" } });
    createProduct.mockRejectedValueOnce(p2002("barcode"));
    expect(await createProductAction(input)).toMatchObject({ ok: false, code: "DUPLICATE", existingVariantId: "v-race" });
  });

  it("P2002 en sku → reintenta con otro SKU", async () => {
    getServerSession.mockResolvedValue(session("owner", null));
    createProduct.mockRejectedValueOnce(p2002("sku")).mockRejectedValueOnce(p2002("sku"));
    const r = await createProductAction(input);
    expect(r.ok).toBe(true);
    expect(createProduct).toHaveBeenCalledTimes(3);
  });

  it("P2002 en sku más de 3 reintentos → ERROR", async () => {
    getServerSession.mockResolvedValue(session("owner", null));
    createProduct.mockReset().mockRejectedValue(p2002("sku"));
    const r = await createProductAction(input);
    expect(r).toMatchObject({ ok: false, code: "ERROR" });
    expect(createProduct).toHaveBeenCalledTimes(4);
  });

  it("error inesperado → ERROR legible, sin lanzar ni filtrar detalles", async () => {
    getServerSession.mockResolvedValue(session("owner", null));
    createProduct.mockRejectedValue(new Error("connection refused 10.0.0.1"));
    const r = await createProductAction(input);
    expect(r).toMatchObject({ ok: false, code: "ERROR" });
    expect(!r.ok && r.message).not.toMatch(/10\.0\.0\.1/);
  });
});

describe("lookupCodeAction", () => {
  beforeEach(() => {
    getServerSession.mockReset().mockResolvedValue(session("collaborator", "loc-1"));
    getProductByBarcode.mockReset().mockResolvedValue(null);
  });

  it("encontrado → product con la variante y variantId", async () => {
    getProductByBarcode.mockResolvedValue({ product, variant: variant("LS-X") });
    const r = await lookupCodeAction(" 4006381333931 ");
    expect(getProductByBarcode).toHaveBeenCalledWith("4006381333931");
    expect(r).toMatchObject({ found: true, variantId: "v1" });
    expect(r.found && r.product.variants.map((v) => v.id)).toEqual(["v1"]);
  });

  it("no encontrado → code normalizado", async () => {
    expect(await lookupCodeAction("\t750123\n")).toEqual({ found: false, code: "750123" });
  });

  it("sin sesión no lanza: devuelve error", async () => {
    getServerSession.mockResolvedValue(null);
    const r = await lookupCodeAction("750123");
    expect(r).toMatchObject({ found: false, code: "750123", error: expect.stringMatching(/sesión/) });
  });

  it("falla del data source no lanza", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getProductByBarcode.mockRejectedValue(new Error("db down"));
    const r = await lookupCodeAction("750123");
    expect(r).toMatchObject({ found: false, code: "750123", error: expect.any(String) });
  });

  it("código vacío → error sin consultar", async () => {
    const r = await lookupCodeAction("   ");
    expect(r).toMatchObject({ found: false, code: "", error: expect.any(String) });
    expect(getProductByBarcode).not.toHaveBeenCalled();
  });
});

describe("uploadProductImageAction", () => {
  const fd = (file?: File) => {
    const f = new FormData();
    if (file) f.set("image", file);
    return f;
  };
  const jpg = new File([new Uint8Array([1, 2])], "a.jpg", { type: "image/jpeg" });

  beforeEach(() => {
    getServerSession.mockReset().mockResolvedValue(session("owner", null));
    uploadImage.mockReset().mockResolvedValue("https://blob.example/a.jpg");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("ok → url", async () => {
    expect(await uploadProductImageAction(fd(jpg))).toEqual({ ok: true, url: "https://blob.example/a.jpg" });
  });

  it("sin archivo → ok:false", async () => {
    expect(await uploadProductImageAction(fd())).toMatchObject({ ok: false, message: expect.any(String) });
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("sin sesión → ok:false", async () => {
    getServerSession.mockResolvedValue(null);
    expect(await uploadProductImageAction(fd(jpg))).toMatchObject({ ok: false, message: expect.stringMatching(/sesión/) });
  });

  it("ImageUploadError → su mensaje; otro error → mensaje genérico", async () => {
    uploadImage.mockRejectedValueOnce(new ImageUploadError("Formato de imagen no permitido: usa JPG, PNG o WebP."));
    expect(await uploadProductImageAction(fd(jpg))).toEqual({ ok: false, message: "Formato de imagen no permitido: usa JPG, PNG o WebP." });
    uploadImage.mockRejectedValueOnce(new Error("BlobError: secret internals"));
    const r = await uploadProductImageAction(fd(jpg));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).not.toMatch(/internals/);
  });
});

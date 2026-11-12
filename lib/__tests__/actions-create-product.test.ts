import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const createProduct = vi.fn();
const getProductByBarcode = vi.fn();
const getLocations = vi.fn();
const revalidatePath = vi.fn();
const uploadImage = vi.fn();
const brandFindUnique = vi.fn();
const departmentFindUnique = vi.fn();
vi.mock("../prisma", () => ({
  default: {
    brand: { findUnique: (...a: unknown[]) => brandFindUnique(...a) },
    department: { findUnique: (...a: unknown[]) => departmentFindUnique(...a) },
    productType: { findUnique: vi.fn().mockResolvedValue({ slug: "gorra", name: "Gorras", isActive: true, departments: [{ departmentId: "d1" }] }) },
  },
}));
vi.mock("../auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("../image/upload", async (orig) => ({
  ...(await orig<typeof import("../image/upload")>()),
  uploadImage: (...a: unknown[]) => uploadImage(...a),
}));
vi.mock("../auth/password", () => ({ changePassword: vi.fn() }));
vi.mock("../data/get-source", () => ({ getDataSource: () => ({ createProduct, getProductByBarcode, getLocations }) }));

import { createProductAction, lookupCodeAction, uploadProductImageAction, type CreateProductInput } from "../actions";
import { ImageUploadError } from "../image/upload";
import { UnauthenticatedError } from "../auth/errors";
import { isValidInternalSku } from "../domain/barcode";

const input: CreateProductInput = {
  title: "Gorra", description: "Algodón suave", brandId: "brand-1", departmentId: "dep-1", productTypeId: "type-gorra", locationId: "loc-1",
  sizes: [{ size: "", barcode: "4006381333931", price: 10, initialStock: 2 }],
};
/** El alta con la única talla modificada (antes `barcode`, `price`, `size` e `initialStock` iban sueltos). */
const row = (patch: Record<string, unknown>, extra: Partial<CreateProductInput> = {}): CreateProductInput =>
  ({ ...input, ...extra, sizes: [{ ...input.sizes[0], ...patch }] }) as CreateProductInput;
const session = (role: string, locationId: string | null) => ({ id: "u1", role, locationId });
const product = { id: "p1", title: "Gorra", brand: "Lolo", category: "Accesorios", imageUrl: null, variants: [] };
const variant = (sku: string) => ({ id: "v1", sku, title: "Gorra", size: "U", color: "General", price: 10, barcode: "4006381333931", inventory: [{ locationId: "loc-1", available: 2 }] });
const p2002 = (field: string) => Object.assign(new Error("Unique"), { code: "P2002", meta: { target: [field] } });

describe("createProductAction", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    getProductByBarcode.mockReset().mockResolvedValue(null);
    getLocations.mockReset().mockResolvedValue([{ id: "loc-1", name: "Tienda 1" }, { id: "loc-2", name: "Tienda 2" }]);
    createProduct.mockReset().mockImplementation(async (d: { variants: { sku: string }[] }) => ({ product, variants: [variant(d.variants[0].sku)] }));
    revalidatePath.mockReset();
    brandFindUnique.mockReset().mockResolvedValue({ name: "Lolo", isActive: true });
    departmentFindUnique.mockReset().mockResolvedValue({ isActive: true, slug: "accesorios" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sin sesión → SESSION con el texto único, sin lanzar", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    const r = await createProductAction(input);
    expect(r).toEqual({ ok: false, code: "SESSION", message: "Tu sesión terminó. Vuelve a iniciar sesión." });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("colaborador no da de alta en otra tienda → FORBIDDEN", async () => {
    getCurrentUser.mockResolvedValue(session("collaborator", "loc-2"));
    const r = await createProductAction(input);
    expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(!r.ok && r.message).toMatch(/tu tienda/);
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("colaborador sin tienda asignada → FORBIDDEN", async () => {
    getCurrentUser.mockResolvedValue(session("collaborator", null));
    expect(await createProductAction(input)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("colaborador en su tienda sí puede", async () => {
    getCurrentUser.mockResolvedValue(session("collaborator", "loc-1"));
    expect(await createProductAction(input)).toMatchObject({ ok: true });
  });

  it.each(["owner", "manager"])("%s (locationId null) da de alta en cualquier tienda existente y revalida", async (role) => {
    getCurrentUser.mockResolvedValue(session(role, null));
    const r = await createProductAction({ ...input, locationId: "loc-2" });
    expect(r.ok).toBe(true);
    expect(createProduct.mock.calls[0][0]).toMatchObject({ locationId: "loc-2", userId: "u1" });
    expect(revalidatePath).toHaveBeenCalledWith("/catalogo");
    expect(revalidatePath).toHaveBeenCalledWith("/productos");
  });

  it("modo catálogo pasa al data source frente, atrás y descripción", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    const front = "https://abc.public.blob.vercel-storage.com/productos/f.jpg";
    const back = "https://abc.public.blob.vercel-storage.com/productos/b.jpg";
    const r = await createProductAction({ ...input, mode: "catalog", imageUrl: front, backImageUrl: back, description: "  Algodón  " });
    expect(r).toMatchObject({ ok: true, catalogStatus: "Listo para catálogo" });
    expect(createProduct.mock.calls[0][0]).toMatchObject({
      imageUrl: front, backImageUrl: back, description: "Algodón", photosChecked: true,
    });
  });

  it("una pestaña vieja con photosAnalyzed: true crea igual y la bandera no llega al data source", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    const front = "https://abc.public.blob.vercel-storage.com/productos/f.jpg";
    const r = await createProductAction({ ...input, mode: "catalog", imageUrl: front, photosAnalyzed: true } as never);
    expect(r).toMatchObject({ ok: true });
    expect(createProduct.mock.calls[0][0]).not.toHaveProperty("photosAnalyzed");
  });

  it("una foto sin photosAnalyzed se acepta", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    const front = "https://abc.public.blob.vercel-storage.com/productos/f.jpg";
    expect(await createProductAction({ ...input, mode: "catalog", imageUrl: front })).toMatchObject({ ok: true });
  });

  it("una sola foto no pone catalogPhotosCheckedAt y deja el estado incompleto", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    const front = "https://abc.public.blob.vercel-storage.com/productos/f.jpg";
    const r = await createProductAction({ ...input, mode: "catalog", imageUrl: front });
    expect(r).toMatchObject({ ok: true, catalogStatus: "Falta completar registro fotográfico" });
    expect(createProduct.mock.calls[0][0]).toMatchObject({ imageUrl: front, backImageUrl: null, photosChecked: false });
  });

  it("sin marca y sin título: un mensaje claro para cada uno; sin descripción también", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    expect(await createProductAction({ ...input, brandId: "" })).toEqual({ ok: false, code: "INVALID", message: "Elige la marca." });
    expect(await createProductAction({ ...input, title: " " })).toEqual({ ok: false, code: "INVALID", message: "Escribe el título." });
    expect(await createProductAction({ ...input, description: "" })).toEqual({ ok: false, code: "INVALID", message: "Escribe la descripción." });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("el color se limpia en el servidor y se descarta en Accesorios", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    departmentFindUnique.mockResolvedValue({ isActive: true, slug: "dama" });
    await createProductAction({ ...input, color: "  ROSAS 🔥 " });
    expect(createProduct.mock.calls[0][0]).toMatchObject({ color: "Rosas" });
    departmentFindUnique.mockResolvedValue({ isActive: true, slug: "accesorios" });
    await createProductAction({ ...input, color: "Azul" });
    expect(createProduct.mock.calls[1][0]).toMatchObject({ color: null });
    departmentFindUnique.mockResolvedValue({ isActive: true, slug: "dama" });
    expect(await createProductAction({ ...input, color: "a".repeat(201) })).toEqual({
      ok: false, code: "INVALID", message: "El color es demasiado largo.",
    });
  });

  it("tienda inexistente → LOCATION", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    const r = await createProductAction({ ...input, locationId: "loc-x" });
    expect(r).toMatchObject({ ok: false, code: "LOCATION" });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("valida en el servidor → INVALID con mensaje", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    expect(await createProductAction({ ...input, productTypeId: "" })).toMatchObject({ ok: false, code: "INVALID", message: expect.stringMatching(/tipo/i) });
    expect(await createProductAction(row({ initialStock: -1 }))).toMatchObject({ ok: false, code: "INVALID", message: expect.stringMatching(/stock/i) });
    expect(await createProductAction(row({ price: 0 }))).toMatchObject({ ok: false, code: "INVALID", message: expect.stringMatching(/precio/i) });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("alta sin departamento → INVALID «Elige el departamento.»", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    const r = await createProductAction({ ...input, departmentId: "" });
    expect(r).toEqual({ ok: false, code: "INVALID", message: "Elige el departamento." });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("departamento inexistente o inactivo → INVALID", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    departmentFindUnique.mockResolvedValue(null);
    expect(await createProductAction(input)).toMatchObject({ ok: false, code: "INVALID", message: "Elige el departamento." });
    departmentFindUnique.mockResolvedValue({ isActive: false });
    expect(await createProductAction(input)).toMatchObject({ ok: false, code: "INVALID" });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("marca inexistente o inactiva → INVALID", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    brandFindUnique.mockResolvedValue({ name: "Vieja", isActive: false });
    expect(await createProductAction(input)).toMatchObject({ ok: false, code: "INVALID" });
    brandFindUnique.mockResolvedValue(null);
    expect(await createProductAction(input)).toMatchObject({ ok: false, code: "INVALID" });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("manda al data source brandId, departmentId, el nombre canónico y un publicCode válido", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    await createProductAction({ ...input, brand: "HACK" } as CreateProductInput);
    const sent = createProduct.mock.calls[0][0];
    expect(sent).toMatchObject({ brandId: "brand-1", departmentId: "dep-1", brand: "Lolo" });
    expect(sent.publicCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}$/);
  });

  it("P2002 en publicCode → reintenta con otro código (hasta 5 intentos)", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    createProduct.mockRejectedValueOnce(p2002("Product_publicCode_key")).mockRejectedValueOnce(p2002("publicCode"));
    expect(await createProductAction(input)).toMatchObject({ ok: true });
    expect(createProduct).toHaveBeenCalledTimes(3);
    createProduct.mockReset().mockRejectedValue(p2002("publicCode"));
    expect(await createProductAction(input)).toMatchObject({ ok: false, code: "ERROR" });
    expect(createProduct).toHaveBeenCalledTimes(5);
  });

  it("GTIN con dígito verificador incorrecto → INVALID", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    const r = await createProductAction(row({ barcode: "4006381333932" }));
    expect(r).toMatchObject({ ok: false, code: "INVALID", message: expect.stringMatching(/verificador/) });
  });

  it("sin código y sin marcar 'sin código' → INVALID", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    expect(await createProductAction(row({ barcode: "  " }))).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("«Sin código» (barcode null) → barcode null y no busca duplicados", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    const r = await createProductAction(row({ barcode: null }));
    expect(r.ok).toBe(true);
    expect(createProduct.mock.calls[0][0].variants[0].barcode).toBeNull();
    expect(getProductByBarcode).not.toHaveBeenCalled();
  });

  it("normaliza el barcode y genera el SKU en el servidor (ignora sku del cliente)", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    const r = await createProductAction(row({ barcode: " 4006381333931\n", sku: "HACK" }, { sku: "HACK" } as Partial<CreateProductInput>));
    const sent = createProduct.mock.calls[0][0].variants[0];
    expect(sent.barcode).toBe("4006381333931");
    expect(isValidInternalSku(sent.sku)).toBe(true);
    expect(r).toMatchObject({ ok: true, variantId: "v1", sku: sent.sku });
  });

  it("talla, precio redondeado y textos recortados llegan al data source", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    await createProductAction(row({ price: 10.005, size: "M" }, { title: " Gorra " }));
    expect(createProduct.mock.calls[0][0]).toMatchObject({ title: "Gorra", variants: [{ price: 10.01, size: "M" }] });
  });

  it("alfanumérico se guarda en MAYÚSCULAS y busca duplicado con esa forma; EAN no cambia", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    await createProductAction(row({ barcode: " abc-1 " }));
    expect(getProductByBarcode).toHaveBeenCalledWith("ABC-1");
    expect(createProduct.mock.calls[0][0].variants[0].barcode).toBe("ABC-1");
    await createProductAction(input);
    expect(createProduct.mock.calls[1][0].variants[0].barcode).toBe("4006381333931");
  });

  it("existe 'abc-1' y se da de alta 'ABC-1' → DUPLICATE", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    getProductByBarcode.mockImplementation(async (c: string) =>
      c.toLowerCase() === "abc-1" ? { product, variant: { ...variant("LS-X"), id: "v-abc", barcode: "abc-1" } } : null);
    expect(await createProductAction(row({ barcode: "ABC-1" }))).toMatchObject({ ok: false, code: "DUPLICATE", existingVariantId: "v-abc" });
  });

  it("código ya registrado (lookup) → DUPLICATE con existingVariantId", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    getProductByBarcode.mockResolvedValue({ product, variant: { ...variant("LS-X"), id: "v-old" } });
    const r = await createProductAction(input);
    expect(r).toMatchObject({ ok: false, code: "DUPLICATE", existingVariantId: "v-old" });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("P2002 en barcode (carrera) → DUPLICATE con existingVariantId", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    getProductByBarcode.mockResolvedValueOnce(null).mockResolvedValueOnce({ product, variant: { ...variant("LS-X"), id: "v-race" } });
    createProduct.mockRejectedValueOnce(p2002("barcode"));
    expect(await createProductAction(input)).toMatchObject({ ok: false, code: "DUPLICATE", existingVariantId: "v-race" });
  });

  it("P2002 en sku → reintenta con otro SKU", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    createProduct.mockRejectedValueOnce(p2002("sku")).mockRejectedValueOnce(p2002("sku"));
    const r = await createProductAction(input);
    expect(r.ok).toBe(true);
    expect(createProduct).toHaveBeenCalledTimes(3);
  });

  it("P2002 en sku más de 3 reintentos → ERROR", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    createProduct.mockReset().mockRejectedValue(p2002("sku"));
    const r = await createProductAction(input);
    expect(r).toMatchObject({ ok: false, code: "ERROR" });
    expect(createProduct).toHaveBeenCalledTimes(4);
  });

  it("error inesperado → ERROR legible, sin lanzar ni filtrar detalles", async () => {
    getCurrentUser.mockResolvedValue(session("owner", null));
    createProduct.mockRejectedValue(new Error("connection refused 10.0.0.1"));
    const r = await createProductAction(input);
    expect(r).toMatchObject({ ok: false, code: "ERROR" });
    expect(!r.ok && r.message).not.toMatch(/10\.0\.0\.1/);
  });
});

describe("lookupCodeAction", () => {
  beforeEach(() => {
    getCurrentUser.mockReset().mockResolvedValue(session("collaborator", "loc-1"));
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
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
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
    getCurrentUser.mockReset().mockResolvedValue(session("owner", null));
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
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
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

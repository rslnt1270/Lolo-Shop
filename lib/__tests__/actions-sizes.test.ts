import { describe, it, expect, vi, beforeEach } from "vitest";
import { FixtureDataSource } from "@/lib/data/fixture-source";
import { toPublicProduct } from "@/lib/data/public-projection";

const getCurrentUser = vi.fn();
const state = vi.hoisted(() => ({ ds: null as unknown as FixtureDataSource }));

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    brand: { findUnique: vi.fn().mockResolvedValue({ name: "Lolo", isActive: true }) },
    department: { findUnique: vi.fn().mockResolvedValue({ isActive: true, slug: "dama" }) },
    productType: { findUnique: vi.fn().mockResolvedValue({ slug: "playera", name: "Playeras", isActive: true, departments: [{ departmentId: "d1" }] }) },
  },
}));
vi.mock("@/lib/data/get-source", () => ({ getDataSource: () => state.ds }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/password", () => ({ changePassword: vi.fn() }));

import {
  addVariantAction, createProductAction, searchProductsAction, type CreateProductInput,
} from "../actions";
import { UnauthenticatedError } from "../auth/errors";

const user = (role: string, locationId: string | null) => ({ id: "u1", role, locationId });
const row = (size: string, barcode: string | null = null, price = 100, initialStock = 1) => ({ size, barcode, price, initialStock });
const input = (sizes: CreateProductInput["sizes"]): CreateProductInput => ({
  title: "Playera Logo", description: "Algodón suave", brandId: "b1", departmentId: "d1", productTypeId: "type-playera", locationId: "loc-1", sizes,
});

async function productWithM(): Promise<string> {
  const r = await createProductAction(input([row("M", "ETQ-M")]));
  if (!r.ok) throw new Error(r.message);
  return r.product.id;
}

beforeEach(() => {
  state.ds = new FixtureDataSource();
  getCurrentUser.mockReset().mockResolvedValue(user("owner", null));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createProductAction con varias tallas", () => {
  it("crea un producto con todas sus tallas y manda al data source una variante por fila", async () => {
    const spy = vi.spyOn(state.ds, "createProduct");
    const r = await createProductAction(input([row(" s ", "etq-s", 299, 2), row("M", null, 299, 0), row("L", "ETQ-L", 320, 1)]));
    expect(r).toMatchObject({ ok: true });
    const sent = spy.mock.calls[0][0];
    expect(sent.variants.map((v) => ({ size: v.size, barcode: v.barcode, price: v.price, initialStock: v.initialStock }))).toEqual([
      { size: "S", barcode: "ETQ-S", price: 299, initialStock: 2 },
      { size: "M", barcode: null, price: 299, initialStock: 0 },
      { size: "L", barcode: "ETQ-L", price: 320, initialStock: 1 },
    ]);
    expect(new Set(sent.variants.map((v) => v.sku)).size).toBe(3);
    expect(r.ok && r.product.variants).toHaveLength(3);
  });

  it("DUPLICATE trae duplicateBarcode y el título del producto que lo tiene; no crea nada", async () => {
    await state.ds.createProduct({
      title: "Gorra Roja", brand: "Lolo", brandId: "b1", departmentId: "d1", publicCode: "AAAAA", category: "Accesorios",
      locationId: "loc-2", userId: "u9", variants: [{ sku: "LS-GORRA0-0", barcode: "4006381333931", size: "U", price: 10, initialStock: 1 }],
    });
    const before = (await state.ds.getProducts()).length;
    const r = await createProductAction(input([row("M", "ETQ-M"), row("L", "4006381333931")]));
    expect(r).toMatchObject({ ok: false, code: "DUPLICATE", duplicateBarcode: "4006381333931" });
    expect(!r.ok && r.message).toContain("Gorra Roja");
    expect(!r.ok && r.existingVariantId).toBeTruthy();
    expect((await state.ds.getProducts()).length).toBe(before);
  });

  it("13 tallas → INVALID", async () => {
    const sizes = Array.from({ length: 13 }, (_, i) => row(String(20 + i)));
    expect(await createProductAction(input(sizes))).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("tallas repetidas sin código o códigos repetidos en el envío → INVALID", async () => {
    expect(await createProductAction(input([row("M"), row("m")]))).toMatchObject({ ok: false, code: "INVALID" });
    expect(await createProductAction(input([row("M", "X-1"), row("L", "x-1")]))).toMatchObject({ ok: false, code: "INVALID" });
  });
});

describe("addVariantAction", () => {
  const add = (productId: string, patch: Record<string, unknown> = {}) =>
    addVariantAction({ productId, size: "L", barcode: null, price: 320, initialStock: 2, locationId: "loc-1", ...patch });

  it("agregar L a un producto con M → 2 variantes y PublicProduct.sizes con 2", async () => {
    const productId = await productWithM();
    const r = await add(productId, { barcode: "etq-l" });
    expect(r).toMatchObject({ ok: true });
    const product = (await state.ds.getProducts()).find((p) => p.id === productId)!;
    expect(product.variants.map((v) => v.size)).toEqual(["M", "L"]);
    expect(product.variants[1]).toMatchObject({ barcode: "ETQ-L", title: "L", price: 320 });
    const pub = toPublicProduct({ ...product, publicCode: product.publicCode ?? null }, new Set(["loc-1"]));
    expect(pub.sizes).toHaveLength(2);
  });

  it("registra el RESTOCK de la talla nueva en la tienda con el usuario", async () => {
    const productId = await productWithM();
    const r = await add(productId);
    expect(r.ok).toBe(true);
    const v = (await state.ds.getProducts()).find((p) => p.id === productId)!.variants[1];
    expect(v.inventory).toEqual([{ locationId: "loc-1", available: 2 }]);
  });

  it("misma talla sin código → INVALID «Esa talla ya existe: suma piezas con Entrada»", async () => {
    const productId = await productWithM();
    expect(await add(productId, { size: " m " })).toEqual({
      ok: false, code: "INVALID", message: "Esa talla ya existe: suma piezas con Entrada",
    });
    expect((await state.ds.getProducts()).find((p) => p.id === productId)!.variants).toHaveLength(1);
  });

  it("misma talla con código distinto → ok", async () => {
    const productId = await productWithM();
    expect(await add(productId, { size: "M", barcode: "ETQ-M2" })).toMatchObject({ ok: true });
  });

  it("código ya registrado → DUPLICATE con duplicateBarcode", async () => {
    const productId = await productWithM();
    expect(await add(productId, { barcode: "etq-m" })).toMatchObject({ ok: false, code: "DUPLICATE", duplicateBarcode: "ETQ-M" });
  });

  it("colaborador en otra tienda → FORBIDDEN", async () => {
    const productId = await productWithM();
    getCurrentUser.mockResolvedValue(user("collaborator", "loc-2"));
    expect(await add(productId)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("el colaborador sí agrega la talla (con precio) en su tienda", async () => {
    const productId = await productWithM();
    getCurrentUser.mockResolvedValue(user("collaborator", "loc-1"));
    expect(await add(productId)).toMatchObject({ ok: true });
  });

  it("producto inactivo o unido → INVALID", async () => {
    const productId = await productWithM();
    const product = (await state.ds.getProducts()).find((p) => p.id === productId)!;
    product.isActive = false;
    expect(await add(productId)).toMatchObject({ ok: false, code: "INVALID" });
    product.isActive = true;
    product.mergedIntoId = "prod-1";
    expect(await add(productId)).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("talla inválida o precio en cero → INVALID sin tocar el data source", async () => {
    const productId = await productWithM();
    const spy = vi.spyOn(state.ds, "addVariant");
    expect(await add(productId, { price: 0 })).toMatchObject({ ok: false, code: "INVALID" });
    expect(await add(productId, { size: "x".repeat(21) })).toMatchObject({ ok: false, code: "INVALID" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("sesión vencida → SESSION con el texto único", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    const r = await add("p1");
    expect(r).toEqual({ ok: false, code: "SESSION", message: "Tu sesión terminó. Vuelve a iniciar sesión." });
  });
});

describe("searchProductsAction", () => {
  const create = (title: string, publicCode: string, sku: string) =>
    state.ds.createProduct({
      title, brand: "Nike", brandId: "b1", departmentId: "d1", publicCode, category: "Playeras", locationId: "loc-1", userId: "u1",
      variants: [
        { sku: `${sku}-L`, barcode: null, size: "L", price: 1, initialStock: 0 },
        { sku: `${sku}-S`, barcode: null, size: "S", price: 1, initialStock: 0 },
      ],
    });

  it("encuentra por código público exacto (normalizado) con tallas ordenadas y sin SKU ni código de barras", async () => {
    const { product } = await create("Playera Swoosh", "K7Q2M", "LS-K");
    const hits = await searchProductsAction("k7q2m");
    expect(hits).toEqual([{
      productId: product.id, title: "Playera Swoosh", brand: "Nike", publicCode: "K7Q2M", imageUrl: null, sizes: ["S", "L"],
    }]);
    expect(JSON.stringify(hits)).not.toMatch(/LS-K|sku|barcode|inventory/);
  });

  it("no devuelve productos unidos ni inactivos", async () => {
    const keep = await create("Playera Swoosh", "K7Q2M", "LS-K");
    const merged = await create("Playera Swoosh vieja", "AAAAA", "LS-A");
    const inactive = await create("Playera Swoosh baja", "BBBBB", "LS-B");
    const all = await state.ds.getProducts();
    all.find((p) => p.id === merged.product.id)!.mergedIntoId = keep.product.id;
    all.find((p) => p.id === inactive.product.id)!.isActive = false;
    expect((await searchProductsAction("swoosh"))!.map((h) => h.productId)).toEqual([keep.product.id]);
  });

  it("busca en título y marca sin distinguir mayúsculas; máximo 8", async () => {
    for (let i = 0; i < 10; i++) await create(`Gorra ${i}`, `C000${i}`, `LS-C${i}`);
    expect(await searchProductsAction("GORRA")).toHaveLength(8);
    expect((await searchProductsAction("nike"))!.length).toBe(8);
    expect(await searchProductsAction("   ")).toEqual([]);
  });

  it("el código público exacto va primero aunque haya más de 8 coincidencias por título", async () => {
    const exact = await create("Sudadera", "HHHHH", "LS-H");
    for (let i = 0; i < 9; i++) await create(`Playera HHHHH ${i}`, `J000${i}`, `LS-J${i}`);
    const hits = (await searchProductsAction("hhhhh"))!;
    expect(hits).toHaveLength(8);
    expect(hits[0].productId).toBe(exact.product.id);
    expect(new Set(hits.map((h) => h.productId)).size).toBe(8);
  });

  it("sesión vencida → null", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    expect(await searchProductsAction("k7q2m")).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const brandFind = vi.fn();
const departmentFind = vi.fn();
const typeFind = vi.fn();
let ds: import("@/lib/data/fixture-source").FixtureDataSource;

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/data/get-source", () => ({ getDataSource: () => ds }));
vi.mock("@/lib/prisma", () => ({
  default: {
    brand: { findUnique: (a: unknown) => brandFind(a) },
    department: { findUnique: (a: unknown) => departmentFind(a) },
    productType: { findUnique: (a: unknown) => typeFind(a) },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  assignDepartmentAction,
  assignProductTypeAction,
  listPriceChangesAction,
  setProductActiveAction,
  setProductPublishedAction,
  setVariantActiveAction,
  updateProductAction,
  updateVariantPriceAction,
} from "../actions";
import { FixtureDataSource } from "@/lib/data/fixture-source";
import { UnauthenticatedError } from "@/lib/auth/errors";
import { MAX_PRICE } from "@/lib/domain/new-product";

const as = (role: string, locationId: string | null = null) =>
  getCurrentUser.mockResolvedValue({ id: "u1", role, locationId });

const price = (over: Record<string, unknown> = {}) => ({
  variantId: "var-1",
  newPrice: 500,
  expectedPrice: 450,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  ds = new FixtureDataSource();
  as("owner");
  brandFind.mockResolvedValue({ name: "Guess", isActive: true });
  departmentFind.mockResolvedValue({ isActive: true, slug: "dama" });
  typeFind.mockResolvedValue({ slug: "playera", name: "Playeras", isActive: true, departments: [{ departmentId: "d2" }] });
});

describe("permisos y sesión", () => {
  const calls: [string, () => Promise<unknown>][] = [
    ["updateProductAction", () => updateProductAction({ productId: "prod-1", title: "Nuevo" })],
    ["setProductActiveAction", () => setProductActiveAction("prod-1", false)],
    ["setVariantActiveAction", () => setVariantActiveAction("var-1", false)],
    ["assignDepartmentAction", () => assignDepartmentAction(["prod-1"], "d1")],
    ["assignProductTypeAction", () => assignProductTypeAction(["prod-1"], "t1")],
  ];

  const priceCall: [string, () => Promise<unknown>] = ["updateVariantPriceAction", () => updateVariantPriceAction(price())];

  it.each(calls)("%s: colaborador (o JWT de owner con colaborador en la base) recibe FORBIDDEN", async (_n, call) => {
    as("collaborator", "loc-1");
    await expect(call()).resolves.toMatchObject({ ok: false, code: "FORBIDDEN" });
    const p = (await ds.getProducts())[0];
    expect(p.isActive).not.toBe(false);
    expect(p.variants[0].price).toBe(450);
  });

  it("listPriceChangesAction: colaborador recibe el historial de la talla", async () => {
    as("collaborator", "loc-1");
    await expect(listPriceChangesAction("var-1")).resolves.toEqual(expect.any(Array));
  });

  it.each([...calls, priceCall])("%s: sin sesión devuelve SESSION", async (_n, call) => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    await expect(call()).resolves.toMatchObject({ ok: false, code: "SESSION", message: "Tu sesión terminó. Vuelve a iniciar sesión." });
  });

  it("listPriceChangesAction: sin sesión devuelve null", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    await expect(listPriceChangesAction("var-1")).resolves.toBeNull();
  });

  it.each(["owner", "manager"])("%s puede editar el precio", async (role) => {
    as(role, null);
    await expect(updateVariantPriceAction(price())).resolves.toEqual({ ok: true, price: 500 });
  });
});

describe("updateVariantPriceAction", () => {
  it("colaborador guarda el precio y queda en el historial con su usuario", async () => {
    as("collaborator", "loc-1");
    await expect(updateVariantPriceAction(price({ newPrice: 520 }))).resolves.toEqual({ ok: true, price: 520 });
    const rows = await listPriceChangesAction("var-1");
    expect(rows![0]).toMatchObject({ oldPrice: 450, newPrice: 520, userName: "u1" });
  });

  it("colaborador con precio esperado viejo: CONFLICT con el precio vigente", async () => {
    as("collaborator", "loc-1");
    await expect(updateVariantPriceAction(price({ expectedPrice: 300 }))).resolves.toMatchObject({
      ok: false,
      code: "CONFLICT",
      currentPrice: 450,
    });
    expect((await ds.getProductByVariantId("var-1"))!.variant.price).toBe(450);
  });

  it("guarda el precio y deja el historial con el usuario", async () => {
    const r = await updateVariantPriceAction(price({ reason: "Ajuste de mercado" }));
    expect(r).toEqual({ ok: true, price: 500 });
    const rows = await listPriceChangesAction("var-1");
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({ oldPrice: 450, newPrice: 500, userName: "u1" });
    expect(typeof rows![0].createdAt).toBe("string");
  });

  it.each([
    ["10.005 (más de 2 decimales)", { newPrice: 10.005 }],
    ["cero", { newPrice: 0 }],
    ["negativo", { newPrice: -5 }],
    ["NaN", { newPrice: Number.NaN }],
    ["sobre el tope", { newPrice: MAX_PRICE + 0.01 }],
    ["igual al vigente", { newPrice: 450 }],
    ["motivo con teléfono", { reason: `llamar ${"0".repeat(10)}` }],
    ["motivo de 2 letras", { reason: "ab" }],
  ])("INVALID: %s", async (_n, over) => {
    const r = await updateVariantPriceAction(price(over));
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect((await ds.getProductByVariantId("var-1"))!.variant.price).toBe(450);
  });

  it("acepta exactamente el tope", async () => {
    await expect(updateVariantPriceAction(price({ newPrice: MAX_PRICE }))).resolves.toEqual({ ok: true, price: MAX_PRICE });
  });

  it("precio esperado viejo: CONFLICT con el precio vigente", async () => {
    const r = await updateVariantPriceAction(price({ expectedPrice: 400 }));
    expect(r).toMatchObject({ ok: false, code: "CONFLICT", currentPrice: 450 });
    expect((await ds.getProductByVariantId("var-1"))!.variant.price).toBe(450);
  });

  it("talla inexistente: NOT_FOUND", async () => {
    await expect(updateVariantPriceAction(price({ variantId: "nope" }))).resolves.toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
  });
});

describe("updateProductAction", () => {
  const upd = (over: Record<string, unknown>) => updateProductAction({ productId: "prod-1", ...over } as never);

  it("cambia título, marca, departamento y tipo; la categoría sale del tipo; el código público no cambia", async () => {
    const before = (await ds.getProducts())[0].publicCode;
    const r = await upd({ title: "  Hoodie nuevo ", brandId: "b2", departmentId: "d2", productTypeId: "t1" });
    expect(r).toEqual({ ok: true });
    const p = (await ds.getProducts())[0];
    expect(p).toMatchObject({ title: "Hoodie nuevo", brandId: "b2", brand: "Guess", departmentId: "d2", category: "Playeras" });
    expect(p.publicCode).toBe(before);
  });

  it.each([["vacío", ""], ["solo espacios", "   "], ["de 121", "x".repeat(121)]])("título %s: INVALID", async (_n, title) => {
    await expect(upd({ title })).resolves.toMatchObject({ ok: false, code: "INVALID" });
  });

  it("título de 120 es válido", async () => {
    await expect(upd({ title: "x".repeat(120) })).resolves.toEqual({ ok: true });
  });

  it("sin ningún campo: INVALID", async () => {
    await expect(upd({})).resolves.toMatchObject({ ok: false, code: "INVALID" });
  });

  it("marca inactiva o inexistente: INVALID", async () => {
    brandFind.mockResolvedValue({ name: "Vieja", isActive: false });
    await expect(upd({ brandId: "b9" })).resolves.toMatchObject({ ok: false, code: "INVALID" });
    brandFind.mockResolvedValue(null);
    await expect(upd({ brandId: "b9" })).resolves.toMatchObject({ ok: false, code: "INVALID" });
  });

  it("departamento inactivo: INVALID", async () => {
    departmentFind.mockResolvedValue({ isActive: false, slug: "dama" });
    await expect(upd({ departmentId: "d9", productTypeId: "t1" })).resolves.toMatchObject({ ok: false, code: "INVALID" });
  });

  it("tipo inexistente: INVALID 'Elige el tipo.'", async () => {
    typeFind.mockResolvedValue(null);
    await expect(upd({ departmentId: "d2", productTypeId: "t9" })).resolves.toMatchObject({
      ok: false, code: "INVALID", message: expect.stringMatching(/tipo/i),
    });
  });

  it("producto inexistente: NOT_FOUND", async () => {
    await expect(updateProductAction({ productId: "nope", title: "X" })).resolves.toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
  });
});

describe("desactivar y reactivar", () => {
  it("producto", async () => {
    await expect(setProductActiveAction("prod-1", false)).resolves.toEqual({ ok: true });
    expect((await ds.getProducts())[0].isActive).toBe(false);
    await expect(setProductActiveAction("prod-1", true)).resolves.toEqual({ ok: true });
    expect((await ds.getProducts())[0].isActive).toBe(true);
  });
  it("talla", async () => {
    await expect(setVariantActiveAction("var-1", false)).resolves.toEqual({ ok: true });
    expect((await ds.getProductByVariantId("var-1"))!.variant.isActive).toBe(false);
  });
  it("reactivar una talla con otra igual activa: INVALID", async () => {
    const { product, variants } = await ds.createProduct({
      title: "Dup", brand: "X", brandId: "b1", departmentId: "d1", publicCode: "DUP01", category: "Playeras",
      variants: [{ sku: "DUP-M1", barcode: null, size: "M", price: 100, initialStock: 0 }],
      locationId: "loc-1", userId: "u1",
    });
    await setVariantActiveAction(variants[0].id, false);
    await ds.addVariant({ productId: product.id, sku: "DUP-M2", size: "m", barcode: null, price: 100, initialStock: 0, locationId: "loc-1", userId: "u1" });
    const r = await setVariantActiveAction(variants[0].id, true);
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect((await ds.getProductByVariantId(variants[0].id))!.variant.isActive).toBe(false);
  });
  it("inexistentes: NOT_FOUND", async () => {
    await expect(setProductActiveAction("nope", false)).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
    await expect(setVariantActiveAction("nope", false)).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
  it("valores no booleanos: INVALID", async () => {
    await expect(setProductActiveAction("prod-1", "no" as never)).resolves.toMatchObject({ ok: false, code: "INVALID" });
  });
});

describe("assignDepartmentAction", () => {
  async function seedTen(): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const { product } = await ds.createProduct({
        title: `P${i}`, brand: "X", brandId: "b1", departmentId: "d1", publicCode: `CODE${i}`, category: "Playeras",
        variants: [{ sku: `S${i}`, barcode: null, size: "M", price: 100, initialStock: 0 }],
        locationId: "loc-1", userId: "u1",
      });
      ids.push(product.id);
    }
    return ids;
  }

  it("101 ids: INVALID", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    await expect(assignDepartmentAction(ids, "d2")).resolves.toMatchObject({ ok: false, code: "INVALID" });
  });
  it("0 ids: INVALID", async () => {
    await expect(assignDepartmentAction([], "d2")).resolves.toMatchObject({ ok: false, code: "INVALID" });
  });
  it("10 ids: 10 actualizados", async () => {
    const ids = await seedTen();
    await expect(assignDepartmentAction(ids, "d2")).resolves.toEqual({ ok: true, updated: 10 });
    const products = await ds.getProducts();
    expect(products.filter((p) => ids.includes(p.id)).every((p) => p.departmentId === "d2")).toBe(true);
  });
  it("departamento inactivo: INVALID y no cambia nada", async () => {
    departmentFind.mockResolvedValue({ isActive: false });
    await expect(assignDepartmentAction(["prod-1"], "d9")).resolves.toMatchObject({ ok: false, code: "INVALID" });
    expect((await ds.getProducts())[0].departmentId).toBe("dept-hombre");
  });
});

describe("setProductPublishedAction", () => {
  const makeEligible = async (over: Record<string, unknown> = {}) => {
    const p = (await ds.getProducts())[0];
    Object.assign(p, { imageUrl: "https://blob/f.jpg", backImageUrl: "https://blob/b.jpg", description: "Hoodie negro", ...over });
    return p;
  };

  it("colaborador → FORBIDDEN y no escribe", async () => {
    const p = await makeEligible();
    as("collaborator", "loc-1");
    await expect(setProductPublishedAction("prod-1", true)).resolves.toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(p.isPublished).not.toBe(true);
  });

  it("sesión vieja de owner con rol colaborador en la base → FORBIDDEN", async () => {
    const p = await makeEligible();
    // El JWT diría owner, pero la base (currentUserOrNull) devuelve colaborador.
    getCurrentUser.mockResolvedValue({ id: "u1", role: "collaborator", locationId: "loc-1" });
    await expect(setProductPublishedAction("prod-1", true)).resolves.toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(p.isPublished).not.toBe(true);
  });

  it("sin sesión → SESSION", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    await expect(setProductPublishedAction("prod-1", true)).resolves.toMatchObject({ ok: false, code: "SESSION" });
  });

  it("producto no elegible → INVALID con el texto del primer hueco", async () => {
    const p = await makeEligible({ backImageUrl: null, description: null });
    const r = await setProductPublishedAction("prod-1", true);
    expect(r).toEqual({ ok: false, code: "INVALID", message: "Falta la foto de atrás." });
    expect(p.isPublished).not.toBe(true);
  });

  it("sin existencias en tienda pública → INVALID", async () => {
    await makeEligible();
    for (const l of (ds as unknown as { locations: { isPublic?: boolean }[] }).locations) l.isPublic = false;
    await expect(setProductPublishedAction("prod-1", true)).resolves.toMatchObject({ ok: false, code: "INVALID", message: "No hay piezas en una tienda pública." });
  });

  it("manager publica un producto elegible aunque catalogPhotosCheckedAt sea nulo", async () => {
    const p = await makeEligible({ catalogPhotosCheckedAt: null });
    as("manager", "loc-1");
    await expect(setProductPublishedAction("prod-1", true)).resolves.toEqual({ ok: true });
    expect(p.isPublished).toBe(true);
  });

  it("despublicar no exige elegibilidad", async () => {
    const p = await makeEligible({ isPublished: true, imageUrl: null, description: null });
    await expect(setProductPublishedAction("prod-1", false)).resolves.toEqual({ ok: true });
    expect(p.isPublished).toBe(false);
  });

  it("publicar un producto inexistente, inactivo o unido → NOT_FOUND", async () => {
    await expect(setProductPublishedAction("nope", true)).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
    await makeEligible({ isActive: false });
    await expect(setProductPublishedAction("prod-1", true)).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
    await makeEligible({ isActive: true, mergedIntoId: "prod-2" });
    await expect(setProductPublishedAction("prod-1", true)).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("despublicar un producto inactivo o unido sí se permite (sale del sitio)", async () => {
    const p = await makeEligible({ isPublished: true, isActive: false });
    await expect(setProductPublishedAction("prod-1", false)).resolves.toEqual({ ok: true });
    expect(p.isPublished).toBe(false);
    await makeEligible({ isPublished: true, isActive: true, mergedIntoId: "prod-2" });
    await expect(setProductPublishedAction("prod-1", false)).resolves.toEqual({ ok: true });
    expect(p.isPublished).toBe(false);
    await expect(setProductPublishedAction("nope", false)).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("desactivar un producto publicado lo despublica; reactivarlo no lo vuelve a publicar", async () => {
    const p = await makeEligible({ isPublished: true });
    await expect(setProductActiveAction("prod-1", false)).resolves.toEqual({ ok: true });
    expect(p.isPublished).toBe(false);
    await expect(setProductActiveAction("prod-1", true)).resolves.toEqual({ ok: true });
    expect(p.isPublished).toBe(false);
  });

  it("published no booleano → INVALID", async () => {
    await makeEligible();
    await expect(setProductPublishedAction("prod-1", "true" as unknown as boolean)).resolves.toMatchObject({ ok: false, code: "INVALID" });
  });
});

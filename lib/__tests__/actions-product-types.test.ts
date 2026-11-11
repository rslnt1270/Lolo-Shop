import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const departmentFind = vi.fn();
const brandFind = vi.fn();
const typeFind = vi.fn();
const typeFindMany = vi.fn();
let ds: import("@/lib/data/fixture-source").FixtureDataSource;

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/data/get-source", () => ({ getDataSource: () => ds }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    brand: { findUnique: (a: unknown) => brandFind(a) },
    department: { findUnique: (a: unknown) => departmentFind(a) },
    productType: { findUnique: (a: unknown) => typeFind(a), findMany: (a: unknown) => typeFindMany(a) },
  },
}));

import { createProductAction } from "../actions";
import { assignDepartmentAction, assignProductTypeAction, updateProductAction } from "../products/actions";
import { listProductTypesAction } from "../catalog/actions";
import { FixtureDataSource } from "@/lib/data/fixture-source";
import {
  FIXTURE_DEPARTMENTS, FIXTURE_DEPARTMENT_PRODUCT_TYPES, FIXTURE_PRODUCT_TYPES,
} from "@/lib/data/fixtures";
import { UnauthenticatedError } from "@/lib/auth/errors";
import {
  MSG_AUDIENCE_REQUIRED, MSG_PICK_TYPE, MSG_TYPE_INACTIVE, MSG_TYPE_NOT_APPLICABLE,
} from "@/lib/domain/product-taxonomy";

const as = (role: string, locationId: string | null = null) =>
  getCurrentUser.mockResolvedValue({ id: "u1", role, locationId });

const inactiveTypes = new Set<string>();

beforeEach(() => {
  vi.clearAllMocks();
  inactiveTypes.clear();
  ds = new FixtureDataSource();
  as("owner");
  brandFind.mockResolvedValue({ name: "Guess", isActive: true });
  departmentFind.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const d = FIXTURE_DEPARTMENTS.find((x) => x.id === where.id);
    return d ? { isActive: d.isActive, slug: d.slug } : null;
  });
  typeFind.mockImplementation(
    async ({ where, select }: { where: { id: string }; select: { departments?: { where: { departmentId: string } } } }) => {
      const t = FIXTURE_PRODUCT_TYPES.find((x) => x.id === where.id);
      if (!t) return null;
      const dep = select.departments?.where.departmentId;
      return {
        slug: t.slug,
        name: t.name,
        isActive: !inactiveTypes.has(t.id),
        departments: dep
          ? FIXTURE_DEPARTMENT_PRODUCT_TYPES.filter((x) => x.productTypeId === t.id && x.departmentId === dep).map(
              (x) => ({ departmentId: x.departmentId }),
            )
          : [],
      };
    },
  );
});

const sizes = [{ size: "M", barcode: null, price: 100, initialStock: 2 }];
const create = (over: Record<string, unknown> = {}) =>
  createProductAction({
    title: "Polo", brandId: "b1", departmentId: "dep-dama", productTypeId: "type-playera",
    locationId: "loc-1", sizes, ...over,
  } as never);

async function seedProduct(over: { dept: string; type: string | null; style?: string | null; audience?: "dama" | "caballero" | "nino" | null }) {
  const n = (await ds.getProducts()).length;
  const res = await ds.createProduct({
    title: `P${n}`, brand: "Guess", brandId: "b1", departmentId: over.dept, publicCode: `SEED${n}`,
    category: over.type ? FIXTURE_PRODUCT_TYPES.find((t) => t.id === over.type)!.name : "General",
    productTypeId: over.type, style: over.style ?? null, audience: over.audience ?? null,
    variants: [{ sku: `SKU-${n}`, barcode: null, size: "M", price: 100, initialStock: 1 }],
    locationId: "loc-1", userId: "u1",
  });
  return res.product.id;
}

describe("listProductTypesAction", () => {
  it("sin sesión devuelve null", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    expect(await listProductTypesAction()).toBeNull();
    expect(typeFindMany).not.toHaveBeenCalled();
  });

  it("solo activos, ordenados por sortOrder, con departmentIds", async () => {
    typeFindMany.mockResolvedValue([
      { id: "t1", slug: "playera", name: "Playeras", departments: [{ departmentId: "d1" }, { departmentId: "d2" }] },
      { id: "t2", slug: "tenis", name: "Tenis", departments: [{ departmentId: "d3" }] },
    ]);
    as("collaborator", "loc-1");
    const res = await listProductTypesAction();
    expect(typeFindMany.mock.calls[0][0]).toMatchObject({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
    expect(res).toEqual([
      { id: "t1", slug: "playera", name: "Playeras", departmentIds: ["d1", "d2"] },
      { id: "t2", slug: "tenis", name: "Tenis", departmentIds: ["d3"] },
    ]);
  });
});

describe("createProductAction: clasificación", () => {
  it("sin productTypeId → INVALID 'Elige el tipo.' aunque venga category", async () => {
    const spy = vi.spyOn(ds, "createProduct");
    const r = await create({ productTypeId: undefined, category: "Playeras" });
    expect(r).toEqual({ ok: false, code: "INVALID", message: "Elige el tipo." });
    expect(MSG_PICK_TYPE).toBe("Elige el tipo.");
    const r2 = await create({ productTypeId: undefined, category: "Inventada" });
    expect(r2).toEqual({ ok: false, code: "INVALID", message: "Elige el tipo." });
    expect(spy).not.toHaveBeenCalled();
  });

  it("tipo que no aplica al departamento → INVALID con el mensaje de no aplica", async () => {
    const spy = vi.spyOn(ds, "createProduct");
    const r = await create({ productTypeId: "type-tenis" });
    expect(r).toEqual({ ok: false, code: "INVALID", message: MSG_TYPE_NOT_APPLICABLE });
    expect(spy).not.toHaveBeenCalled();
  });

  it("tipo inactivo → INVALID con el mensaje de inactivo", async () => {
    inactiveTypes.add("type-playera");
    const r = await create();
    expect(r).toEqual({ ok: false, code: "INVALID", message: MSG_TYPE_INACTIVE });
  });

  it("Calzado sin para → INVALID con el mensaje de Calzado", async () => {
    const spy = vi.spyOn(ds, "createProduct");
    const r = await create({ departmentId: "dep-calzado", productTypeId: "type-tenis" });
    expect(r).toEqual({ ok: false, code: "INVALID", message: MSG_AUDIENCE_REQUIRED });
    expect(spy).not.toHaveBeenCalled();
  });

  it("válido con polo y category 'Inventada' colada → createProduct recibe category Playeras, style polo, audience null", async () => {
    const spy = vi.spyOn(ds, "createProduct");
    const r = await create({ style: "polo", category: "Inventada" });
    expect(r).toMatchObject({ ok: true });
    expect(spy.mock.calls[0][0]).toMatchObject({
      category: "Playeras", productTypeId: "type-playera", style: "polo", audience: null,
    });
  });

  it("Calzado con para guarda audience", async () => {
    const spy = vi.spyOn(ds, "createProduct");
    const r = await create({ departmentId: "dep-calzado", productTypeId: "type-tenis", audience: "nino" });
    expect(r).toMatchObject({ ok: true });
    expect(spy.mock.calls[0][0]).toMatchObject({ category: "Tenis", audience: "nino" });
  });

  it("un colaborador de otra tienda sigue recibiendo FORBIDDEN antes de consultar tipos", async () => {
    as("collaborator", "loc-2");
    const r = await create();
    expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(typeFind).not.toHaveBeenCalled();
  });
});

describe("updateProductAction: clasificación", () => {
  it("solo departmentId → INVALID 'Elige departamento y tipo.'", async () => {
    const r = await updateProductAction({ productId: "prod-1", departmentId: "dep-dama" });
    expect(r).toEqual({ ok: false, code: "INVALID", message: "Elige departamento y tipo." });
  });

  it("editar solo el título de un producto sin tipo → ok", async () => {
    expect(await updateProductAction({ productId: "prod-1", title: "Nuevo" })).toEqual({ ok: true });
    expect((await ds.getProducts())[0].productTypeId ?? null).toBeNull();
  });

  it("bloque válido envía patch.category con el nombre del tipo", async () => {
    const spy = vi.spyOn(ds, "updateProduct");
    const r = await updateProductAction({
      productId: "prod-1", departmentId: "dep-dama", productTypeId: "type-playera", style: "polo",
    });
    expect(r).toEqual({ ok: true });
    expect(spy.mock.calls[0][1]).toMatchObject({
      departmentId: "dep-dama", productTypeId: "type-playera", category: "Playeras", style: "polo", audience: null,
    });
  });

  it("bloque con un par inválido → INVALID y no escribe", async () => {
    const spy = vi.spyOn(ds, "updateProduct");
    const r = await updateProductAction({ productId: "prod-1", departmentId: "dep-dama", productTypeId: "type-tenis" });
    expect(r).toEqual({ ok: false, code: "INVALID", message: MSG_TYPE_NOT_APPLICABLE });
    expect(spy).not.toHaveBeenCalled();
  });

  it("ignora la category que mande un cliente viejo", async () => {
    const spy = vi.spyOn(ds, "updateProduct");
    const r = await updateProductAction({ productId: "prod-1", title: "X", category: "Inventada" } as never);
    expect(r).toEqual({ ok: true });
    expect(spy.mock.calls[0][1]).not.toHaveProperty("category");
  });
});

describe("assignProductTypeAction", () => {
  it("colaborador → FORBIDDEN", async () => {
    as("collaborator", "loc-1");
    expect(await assignProductTypeAction(["x"], "type-playera")).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("101 ids → INVALID", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `p${i}`);
    expect(await assignProductTypeAction(ids, "type-playera")).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("tipo inactivo → INVALID con el mensaje de inactivo", async () => {
    inactiveTypes.add("type-playera");
    expect(await assignProductTypeAction(["x"], "type-playera")).toEqual({
      ok: false, code: "INVALID", message: MSG_TYPE_INACTIVE,
    });
  });

  it("tipo inexistente → INVALID 'Elige el tipo.'", async () => {
    expect(await assignProductTypeAction(["x"], "nope")).toEqual({ ok: false, code: "INVALID", message: MSG_PICK_TYPE });
  });

  it("3 productos con con-capucha a Playeras → { ok: true, updated: 3, styleCleared: 1 }", async () => {
    const a = await seedProduct({ dept: "dep-dama", type: "type-sudadera", style: "con-capucha" });
    const b = await seedProduct({ dept: "dep-dama", type: "type-sudadera" });
    const c = await seedProduct({ dept: "dep-dama", type: null });
    const r = await assignProductTypeAction([a, b, c], "type-playera");
    expect(r).toEqual({ ok: true, updated: 3, styleCleared: 1 });
    const products = await ds.getProducts();
    for (const id of [a, b, c]) {
      expect(products.find((p) => p.id === id)).toMatchObject({ productTypeId: "type-playera", category: "Playeras", style: null });
    }
  });

  it("sin estilo borrado no trae styleCleared", async () => {
    const a = await seedProduct({ dept: "dep-dama", type: null });
    expect(await assignProductTypeAction([a], "type-playera")).toEqual({ ok: true, updated: 1 });
  });

  it("selección con un producto de Calzado → INVALID y ningún producto cambia", async () => {
    const ok = await seedProduct({ dept: "dep-dama", type: "type-sudadera" });
    const bad = await seedProduct({ dept: "dep-calzado", type: "type-tenis", audience: "dama" });
    const r = await assignProductTypeAction([ok, bad], "type-playera");
    expect(r).toEqual({
      ok: false, code: "INVALID",
      message: "«Playeras» no aplica a 1 de los productos elegidos. Quítalos de la selección.",
    });
    const products = await ds.getProducts();
    expect(products.find((p) => p.id === ok)!.productTypeId).toBe("type-sudadera");
  });

  it("assignDepartmentAction conserva productTypeId (regresión de 1.7)", async () => {
    const id = await seedProduct({ dept: "dep-dama", type: "type-playera" });
    expect(await assignDepartmentAction([id], "dep-calzado")).toEqual({ ok: true, updated: 1 });
    const p = (await ds.getProducts()).find((x) => x.id === id)!;
    expect(p).toMatchObject({ departmentId: "dep-calzado", productTypeId: "type-playera" });
  });
});

describe("revisión de llamadores", () => {
  it("ningún producto se crea con createProduct sin productTypeId (grep en el test)", () => {
    const src = readFileSync(join(process.cwd(), "lib/actions.ts"), "utf8");
    const calls = [...src.matchAll(/\.createProduct\(/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const m of calls) {
      const near = src.slice(m.index!, m.index! + 700);
      expect(near, "createProduct( sin productTypeId cerca").toMatch(/productTypeId/);
    }
  });
});

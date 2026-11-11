import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const brandFindUnique = vi.fn();
const brandFindMany = vi.fn();
const brandCreate = vi.fn();
const brandUpdate = vi.fn();
const productUpdateMany = vi.fn();
const saleLineUpdateMany = vi.fn();
const departmentFindMany = vi.fn();
const transactionOptions = vi.fn();
const tx = {
  brand: { update: (a: unknown) => brandUpdate(a) },
  product: { updateMany: (a: unknown) => productUpdateMany(a) },
  saleLine: { updateMany: (a: unknown) => saleLineUpdateMany(a) },
};

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    brand: {
      findUnique: (a: unknown) => brandFindUnique(a),
      findMany: (a: unknown) => brandFindMany(a),
      create: (a: unknown) => brandCreate(a),
    },
    department: { findMany: (a: unknown) => departmentFindMany(a) },
    $transaction: (fn: (t: typeof tx) => unknown, opts?: unknown) => {
      transactionOptions(opts);
      return fn(tx);
    },
  },
}));

import { DB_TIMEOUT_TEXT } from "@/lib/data/errors";
import { INVENTORY_TX_OPTIONS } from "@/lib/data/tx-options";
import { UnauthenticatedError } from "@/lib/auth/errors";
import { createBrandAction, listBrandsAction, listDepartmentsAction, mergeBrandsAction } from "../actions";

const as = (role: string) => getCurrentUser.mockResolvedValue({ id: "u1", role, locationId: null });

beforeEach(() => {
  vi.clearAllMocks();
  brandFindUnique.mockResolvedValue(null);
  brandCreate.mockImplementation(async ({ data }: { data: { name: string; slug: string } }) => ({ id: "b1", ...data }));
});

describe("createBrandAction", () => {
  it("collaborator crea «Psycho Bunny» con slug y createdById", async () => {
    as("collaborator");
    const r = await createBrandAction("Psycho Bunny");
    expect(r).toEqual({ ok: true, brand: { id: "b1", name: "Psycho Bunny", slug: "psycho-bunny" } });
    expect(brandCreate.mock.calls[0][0].data).toMatchObject({ createdById: "u1" });
  });
  it("«psycho bunny » reutiliza la marca del mismo slug (misma id)", async () => {
    as("collaborator");
    brandFindUnique.mockResolvedValue({ id: "b1", name: "Psycho Bunny", slug: "psycho-bunny", isActive: true });
    const r = await createBrandAction("psycho   bunny ");
    expect(r).toEqual({ ok: true, brand: { id: "b1", name: "Psycho Bunny", slug: "psycho-bunny" } });
    expect(brandFindUnique).toHaveBeenCalledWith({ where: { slug: "psycho-bunny" } });
    expect(brandCreate).not.toHaveBeenCalled();
  });
  it("marca fusionada (inactiva) no se reactiva", async () => {
    as("owner");
    brandFindUnique.mockResolvedValue({ id: "b9", name: "Guess", slug: "guess", isActive: false });
    const r = await createBrandAction("GUESS");
    expect(r).toMatchObject({ ok: false });
    expect(brandCreate).not.toHaveBeenCalled();
  });
  it("marca inactiva con el mismo nombre: avisa la fusión con el mensaje existente", async () => {
    as("collaborator");
    brandFindUnique.mockResolvedValue({ id: "b9", name: "Guess", slug: "guess", isActive: false });
    expect(await createBrandAction("guess")).toEqual({ ok: false, message: expect.stringContaining("se fusionó") });
  });
  it("nombre vacío: mensaje exacto sin tocar la base", async () => {
    as("collaborator");
    expect(await createBrandAction("   ")).toEqual({ ok: false, message: "Escribe el nombre de la marca." });
    expect(brandFindUnique).not.toHaveBeenCalled();
  });
  it("«Lacoste» y «LÁCOSTE» caen en el mismo slug (mayúsculas y acentos)", async () => {
    as("collaborator");
    await createBrandAction("Lacoste");
    await createBrandAction("LÁCOSTE");
    const slugs = brandFindUnique.mock.calls.map((c) => c[0].where.slug);
    expect(slugs[0]).toBe(slugs[1]);
  });
  it("carrera P2002: devuelve la marca ganadora", async () => {
    as("owner");
    brandCreate.mockRejectedValue(Object.assign(new Error("u"), { code: "P2002" }));
    brandFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "b2", name: "Guess", slug: "guess", isActive: true });
    expect(await createBrandAction("Guess")).toEqual({ ok: true, brand: { id: "b2", name: "Guess", slug: "guess" } });
  });
  it("vacío, demasiado largo o sin letras: error sin tocar la base", async () => {
    as("owner");
    expect(await createBrandAction("   ")).toMatchObject({ ok: false });
    expect(await createBrandAction("x".repeat(61))).toMatchObject({ ok: false });
    expect(await createBrandAction("!!!")).toMatchObject({ ok: false });
    expect(brandCreate).not.toHaveBeenCalled();
  });
});

describe("listas", () => {
  it("listBrandsAction: activas por nombre", async () => {
    as("collaborator");
    brandFindMany.mockResolvedValue([{ id: "b1", name: "A", slug: "a" }]);
    expect(await listBrandsAction()).toEqual([{ id: "b1", name: "A", slug: "a" }]);
    expect(brandFindMany.mock.calls[0][0]).toMatchObject({ where: { isActive: true }, orderBy: { name: "asc" } });
  });
  it("listDepartmentsAction: activos por sortOrder", async () => {
    as("collaborator");
    departmentFindMany.mockResolvedValue([{ id: "d1", slug: "dama", name: "Dama" }]);
    expect(await listDepartmentsAction()).toEqual([{ id: "d1", slug: "dama", name: "Dama" }]);
    expect(departmentFindMany.mock.calls[0][0]).toMatchObject({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  });
});

describe("mergeBrandsAction", () => {
  it.each(["manager", "collaborator"])("%s: FORBIDDEN", async (role) => {
    as(role);
    const r = await mergeBrandsAction("a", "b");
    expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(brandUpdate).not.toHaveBeenCalled();
  });
  it("owner: reasigna productos y líneas y desactiva la duplicada", async () => {
    as("owner");
    brandFindUnique
      .mockResolvedValueOnce({ id: "a", name: "GUESS", isActive: true })
      .mockResolvedValueOnce({ id: "b", name: "Guess", isActive: true });
    expect(await mergeBrandsAction("a", "b")).toEqual({ ok: true });
    expect(productUpdateMany).toHaveBeenCalledWith({ where: { brandId: "a" }, data: { brandId: "b", brand: "Guess" } });
    expect(saleLineUpdateMany).toHaveBeenCalledWith({ where: { brandId: "a" }, data: { brandId: "b" } });
    expect(brandUpdate).toHaveBeenCalledWith({ where: { id: "a" }, data: { isActive: false } });
  });
  it("la transacción usa INVENTORY_TX_OPTIONS (residual 4)", async () => {
    as("owner");
    brandFindUnique
      .mockResolvedValueOnce({ id: "a", name: "GUESS", isActive: true })
      .mockResolvedValueOnce({ id: "b", name: "Guess", isActive: true });
    await mergeBrandsAction("a", "b");
    expect(transactionOptions).toHaveBeenCalledWith(INVENTORY_TX_OPTIONS);
  });
  it("P2028 en la transacción: ERROR con el texto de reintento, sin lanzar (residual 4)", async () => {
    as("owner");
    brandFindUnique
      .mockResolvedValueOnce({ id: "a", name: "GUESS", isActive: true })
      .mockResolvedValueOnce({ id: "b", name: "Guess", isActive: true });
    productUpdateMany.mockRejectedValueOnce(Object.assign(new Error("tx"), { code: "P2028" }));
    expect(await mergeBrandsAction("a", "b")).toEqual({ ok: false, code: "ERROR", message: DB_TIMEOUT_TEXT });
  });
  it("owner: misma marca o destino inactivo/inexistente: error", async () => {
    as("owner");
    expect(await mergeBrandsAction("a", "a")).toMatchObject({ ok: false, code: "INVALID" });
    brandFindUnique.mockResolvedValueOnce({ id: "a", name: "A", isActive: true }).mockResolvedValueOnce(null);
    expect(await mergeBrandsAction("a", "b")).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(brandUpdate).not.toHaveBeenCalled();
  });
});

describe("sesión vencida", () => {
  beforeEach(() => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
  });
  it("listBrandsAction y listDepartmentsAction devuelven null sin lanzar", async () => {
    await expect(listBrandsAction()).resolves.toBeNull();
    await expect(listDepartmentsAction()).resolves.toBeNull();
  });
  it("createBrandAction y mergeBrandsAction responden ok:false sin lanzar", async () => {
    await expect(createBrandAction("Guess")).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/sesión terminó/) });
    await expect(mergeBrandsAction("a", "b")).resolves.toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(brandCreate).not.toHaveBeenCalled();
  });
});

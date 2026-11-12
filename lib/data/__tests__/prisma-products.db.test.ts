import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { resetDb } from "../../../test/db/reset";

vi.mock("@/lib/prisma", async () => ({ default: (await import("../../../test/db/setup")).testPrisma }));
vi.mock("../../prisma", async () => ({ default: (await import("../../../test/db/setup")).testPrisma }));

import { PrismaDataSource } from "../prisma-source";

describe.skipIf(!hasTestDb)("PrismaDataSource.getProducts (campos de control)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("devuelve brandId, departmentId, mergedIntoId y createdAt", async () => {
    const brand = await testPrisma.brand.create({ data: { name: "Guess", slug: "guess" } });
    const dept = await testPrisma.department.create({ data: { slug: "dama", name: "Dama" } });
    const target = await testPrisma.product.create({
      data: { title: "Destino", brand: "Guess", brandId: brand.id, departmentId: dept.id },
    });
    const merged = await testPrisma.product.create({
      data: { title: "Duplicado", brand: "Guess", mergedIntoId: target.id },
    });

    const products = await new PrismaDataSource().getProducts();
    const t = products.find((p) => p.id === target.id)!;
    const m = products.find((p) => p.id === merged.id)!;

    expect(t.brandId).toBe(brand.id);
    expect(t.departmentId).toBe(dept.id);
    expect(t.mergedIntoId).toBeNull();
    expect(typeof t.createdAt).toBe("string");
    expect(Number.isNaN(Date.parse(t.createdAt!))).toBe(false);
    expect(m.mergedIntoId).toBe(target.id);
    expect(m.brandId).toBeNull();
  });
});

describe.skipIf(!hasTestDb)("PrismaDataSource.searchProducts («Sin código»)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function product(title: string, extra: { category?: string; color?: string; brand?: string; sku: string }) {
    return await testPrisma.product.create({
      data: {
        title,
        brand: extra.brand ?? "Marca",
        category: extra.category ?? "General",
        color: extra.color ?? null,
        variants: { create: [{ title: "M", size: "M", sku: extra.sku, price: 100 }] },
      },
    });
  }

  it("C21 (db): \"Sin código\" encuentra por tipo, marca, color o código interno", async () => {
    const a = await product("Prenda uno", { category: "Hoodies", brand: "Nike", color: "Verde olivo", sku: "LS-ABC123-0" });
    await product("Prenda dos", { category: "Playeras", brand: "Guess", color: "Rojo", sku: "LS-ZZZ999-1" });
    const ds = new PrismaDataSource();

    expect((await ds.searchProducts("hoodies")).map((h) => h.productId)).toEqual([a.id]);
    expect((await ds.searchProducts("nike")).map((h) => h.productId)).toEqual([a.id]);
    expect((await ds.searchProducts("olivo")).map((h) => h.productId)).toEqual([a.id]);
    expect((await ds.searchProducts("ls-abc123-0")).map((h) => h.productId)).toEqual([a.id]);
    expect((await ds.searchProducts("LS-ABC123-0")).map((h) => h.productId)).toEqual([a.id]);
  });

  it("C21 (db): una talla inactiva no encuentra el producto por su SKU", async () => {
    const a = await product("Prenda uno", { sku: "LS-OFF000-0" });
    await testPrisma.variant.updateMany({ where: { productId: a.id }, data: { isActive: false } });
    expect(await new PrismaDataSource().searchProducts("LS-OFF000-0")).toEqual([]);
  });

  it("C21 (db): texto que no es producto no devuelve nada", async () => {
    await product("Prenda uno", { category: "Hoodies", color: "Verde", sku: "LS-ABC123-0" });
    const ds = new PrismaDataSource();
    expect(await ds.searchProducts("pantalón inventado")).toEqual([]);
    expect(await ds.searchProducts("%")).toEqual([]);
    expect(await ds.searchProducts("_")).toEqual([]);
    expect(await ds.searchProducts("\\")).toEqual([]);
  });
});

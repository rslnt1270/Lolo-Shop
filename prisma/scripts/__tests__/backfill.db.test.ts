import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { resetDb } from "../../../test/db/reset";
import { backfillBrandDepartment } from "../backfill-brand-department";

describe.skipIf(!hasTestDb)("backfillBrandDepartment", () => {
  beforeEach(resetDb);
  afterAll(() => testPrisma.$disconnect());

  async function seedProducts() {
    for (const [title, brand] of [
      ["Gorra", "Guess"],
      ["Playera", "GUESS "],
      ["Camisa", "Tommy Hilfiger"],
    ]) {
      await testPrisma.product.create({ data: { title, brand } });
    }
  }

  it("crea marcas normalizadas, departamentos, códigos públicos y umbral", async () => {
    await seedProducts();
    const result = await backfillBrandDepartment(testPrisma);
    expect(result).toEqual({ brands: 2, products: 3, departments: 5 });

    const brands = await testPrisma.brand.findMany({ orderBy: { slug: "asc" } });
    expect(brands.map((b) => b.slug)).toEqual(["guess", "tommy-hilfiger"]);

    const products = await testPrisma.product.findMany();
    expect(products.every((p) => p.brandId)).toBe(true);
    const guess = brands.find((b) => b.slug === "guess")!;
    expect(products.filter((p) => p.brandId === guess.id)).toHaveLength(2);
    for (const p of products) expect(p.publicCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(new Set(products.map((p) => p.publicCode)).size).toBe(3);

    const deps = await testPrisma.department.findMany({ orderBy: { sortOrder: "asc" } });
    expect(deps.map((d) => [d.slug, d.name, d.sortOrder])).toEqual([
      ["dama", "Dama", 1],
      ["caballero", "Caballero", 2],
      ["ninos", "Niños", 3],
      ["calzado", "Calzado", 4],
      ["accesorios", "Accesorios", 5],
    ]);

    const setting = await testPrisma.appSetting.findUnique({ where: { key: "lowStockThreshold" } });
    expect(setting?.value).toBe(2);
  });

  it("es idempotente", async () => {
    await seedProducts();
    await backfillBrandDepartment(testPrisma);
    const codes = (await testPrisma.product.findMany({ orderBy: { title: "asc" } })).map((p) => p.publicCode);
    const second = await backfillBrandDepartment(testPrisma);
    expect(second).toEqual({ brands: 0, products: 0, departments: 0 });
    expect(await testPrisma.brand.count()).toBe(2);
    expect(await testPrisma.department.count()).toBe(5);
    expect(await testPrisma.appSetting.count()).toBe(1);
    const after = (await testPrisma.product.findMany({ orderBy: { title: "asc" } })).map((p) => p.publicCode);
    expect(after).toEqual(codes);
  });

  it("no pisa un umbral ya configurado", async () => {
    await testPrisma.appSetting.create({ data: { key: "lowStockThreshold", value: 5 } });
    await backfillBrandDepartment(testPrisma);
    const s = await testPrisma.appSetting.findUnique({ where: { key: "lowStockThreshold" } });
    expect(s?.value).toBe(5);
  });

  it("producto con marca vacía conserva brandId nulo y no crea Brand", async () => {
    await testPrisma.product.create({ data: { title: "Sin marca", brand: "   " } });
    await backfillBrandDepartment(testPrisma);
    const p = await testPrisma.product.findFirstOrThrow();
    expect(p.brandId).toBeNull();
    expect(p.publicCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(await testPrisma.brand.count()).toBe(0);
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { resetDb } from "../../../test/db/reset";
import { backfillBrandDepartment } from "../backfill-brand-department";
import { backfillProductTypes } from "../backfill-product-types";

describe.skipIf(!hasTestDb)("backfillProductTypes", () => {
  beforeEach(resetDb);
  afterAll(() => testPrisma.$disconnect());

  async function seedWorld(extra: { category: string; dept: string | null; title?: string }[] = []) {
    await backfillBrandDepartment(testPrisma);
    const dep = Object.fromEntries((await testPrisma.department.findMany()).map((d) => [d.slug, d.id]));
    const rows = [
      { category: "Playeras", dept: "dama" },
      { category: "Hoodies", dept: "dama" },
      { category: "Tenis", dept: "calzado" },
      { category: "Raquetas de Padel", dept: "accesorios" },
      { category: "Accesorios", dept: "accesorios" },
      { category: "General", dept: null },
      { category: "Cosa rara", dept: null },
      ...extra,
    ];
    for (const [i, r] of rows.entries()) {
      await testPrisma.product.create({
        data: {
          title: r.title ?? `P${i}`, brand: "Marca", category: r.category,
          departmentId: r.dept ? dep[r.dept] : null,
          variants: { create: [{ title: "U", size: "U", sku: `SKU-${i}`, price: 100 }] },
        },
      });
    }
    const hoodie = await testPrisma.product.findFirstOrThrow({
      where: { category: "Hoodies" }, include: { variants: true },
    });
    const user = await testPrisma.user.create({ data: { username: "ana", name: "Ana", password: "x", role: "owner" } });
    const loc = await testPrisma.location.create({ data: { name: "Lomas" } });
    const sale = await testPrisma.sale.create({
      data: {
        clientRequestId: "req-1", channel: "store", status: "paid", paymentMethod: "cash",
        locationId: loc.id, total: 100, businessDate: new Date("2026-11-10"), createdById: user.id,
      },
    });
    await testPrisma.saleLine.create({
      data: {
        saleId: sale.id, variantId: hoodie.variants[0].id, productId: hoodie.id,
        category: "Hoodies", quantity: 1, unitPrice: 100,
      },
    });
  }

  it("29 tipos, 55 pares, 4 productos, 1 venta, 0 mismatched y sin mapear", async () => {
    await seedWorld();
    expect(await backfillProductTypes(testPrisma)).toEqual({
      types: 29, pairs: 55, products: 4, saleLines: 1, mismatched: 0,
      unmapped: { Accesorios: 1, General: 1, "Cosa rara": 1 },
    });
  });

  it("el producto Hoodies queda con sudadera y category Sudaderas", async () => {
    await seedWorld();
    await backfillProductTypes(testPrisma);
    const p = await testPrisma.product.findFirstOrThrow({ where: { title: "P1" }, include: { productType: true } });
    expect(p.productType?.slug).toBe("sudadera");
    expect(p.category).toBe("Sudaderas");
    const raq = await testPrisma.product.findFirstOrThrow({ where: { title: "P3" } });
    expect(raq.category).toBe("Raquetas de pádel");
  });

  it("la SaleLine conserva category Hoodies y recibe productTypeId de sudadera", async () => {
    await seedWorld();
    await backfillProductTypes(testPrisma);
    const line = await testPrisma.saleLine.findFirstOrThrow();
    const sud = await testPrisma.productType.findUniqueOrThrow({ where: { slug: "sudadera" } });
    expect(line.category).toBe("Hoodies");
    expect(line.productTypeId).toBe(sud.id);
  });

  it("no toca departmentId, style ni audience", async () => {
    await seedWorld();
    const before = await testPrisma.product.findMany({
      orderBy: { title: "asc" }, select: { title: true, departmentId: true, style: true, audience: true },
    });
    await backfillProductTypes(testPrisma);
    const after = await testPrisma.product.findMany({
      orderBy: { title: "asc" }, select: { title: true, departmentId: true, style: true, audience: true },
    });
    expect(after).toEqual(before);
  });

  it("segunda corrida no crea nada", async () => {
    await seedWorld();
    await backfillProductTypes(testPrisma);
    expect(await backfillProductTypes(testPrisma)).toEqual({
      types: 0, pairs: 0, products: 0, saleLines: 0, mismatched: 0,
      unmapped: { Accesorios: 1, General: 1, "Cosa rara": 1 },
    });
    expect(await testPrisma.productType.count()).toBe(29);
    expect(await testPrisma.departmentProductType.count()).toBe(55);
  });

  it("sin departamentos aborta antes de escribir", async () => {
    await expect(backfillProductTypes(testPrisma)).rejects.toThrow(
      "Falta el departamento dama: corre primero backfill-brand-department.",
    );
    expect(await testPrisma.productType.count()).toBe(0);
  });

  it("un producto cuyo departamento no admite el tipo queda sin tipo", async () => {
    await seedWorld([{ category: "Tenis", dept: "dama", title: "Tenis en dama" }]);
    const r = await backfillProductTypes(testPrisma);
    expect(r.mismatched).toBe(1);
    expect(r.products).toBe(4);
    expect(r.unmapped).toEqual({ Accesorios: 1, General: 1, "Cosa rara": 1 });
    const p = await testPrisma.product.findFirstOrThrow({ where: { title: "Tenis en dama" } });
    expect(p.productTypeId).toBeNull();
    expect(p.category).toBe("Tenis");
  });

  it("no infiere estilo ni para desde el título", async () => {
    await seedWorld([{ category: "Playeras", dept: "dama", title: "Polo Nautica" }]);
    await backfillProductTypes(testPrisma);
    const p = await testPrisma.product.findFirstOrThrow({ where: { title: "Polo Nautica" } });
    expect(p.productTypeId).not.toBeNull();
    expect(p.style).toBeNull();
    expect(p.audience).toBeNull();
  });

  it("dos corridas en paralelo no fallan ni duplican tipos", async () => {
    await seedWorld();
    await Promise.all([backfillProductTypes(testPrisma), backfillProductTypes(testPrisma)]);
    expect(await testPrisma.productType.count()).toBe(29);
    expect(await testPrisma.departmentProductType.count()).toBe(55);
  });
});

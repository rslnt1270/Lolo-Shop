import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { getTestDatabaseUrl } from "../../../test/db/guard";
import { resetDb } from "../../../test/db/reset";
import { PrismaDataSource } from "../prisma-source";
import { PrismaSalesDataSource } from "../prisma-sales-source";
import { InventoryRuleError } from "../errors";
import { businessDateMx } from "@/lib/domain/sale";

const url = getTestDatabaseUrl() ?? "postgresql://invalid:invalid@127.0.0.1:1/none";
const clientA = new PrismaClient({ datasources: { db: { url } } });
const clientB = new PrismaClient({ datasources: { db: { url } } });
const dsA = new PrismaDataSource(clientA);
const dsB = new PrismaDataSource(clientB);
const ds = new PrismaDataSource(testPrisma);
const sales = new PrismaSalesDataSource(testPrisma);

const VA = "00000000-0000-4000-8000-0000000000c1";
const VB = "00000000-0000-4000-8000-0000000000c2";
const VC = "00000000-0000-4000-8000-0000000000c3";

describe.skipIf(!hasTestDb)("unir productos duplicados por talla", () => {
  let store: string;
  let owner: string;
  let brandId: string;
  let otherBrandId: string;
  let dept: string;
  let otherDept: string;
  let A: string;
  let B: string;
  let C: string;
  const today = businessDateMx(new Date());

  async function mk(title: string, variantId: string, size: string, code: string, over: Record<string, unknown> = {}) {
    const p = await testPrisma.product.create({
      data: {
        title, brand: "Nautica", brandId, departmentId: dept, category: "Polos", publicCode: code,
        variants: { create: [{ id: variantId, title: size, sku: `SKU-${code}`, size, price: 300 }] },
        ...over,
      },
    });
    await testPrisma.inventoryLevel.create({ data: { variantId, locationId: store, available: 10 } });
    return p.id;
  }

  async function sell(variantId: string, quantity: number) {
    return sales.createSale(
      { clientRequestId: randomUUID(), locationId: store, channel: "store", paymentMethod: "cash", lines: [{ variantId, quantity, unitPrice: 300 }] },
      owner,
    );
  }

  const stockTotal = async () =>
    (await testPrisma.inventoryLevel.aggregate({ _sum: { available: true }, where: { locationId: store } }))._sum.available;
  const dashboard = () => sales.getDashboard({ from: today, to: today, locationIds: "all", pendingScope: "all_dates" });

  beforeEach(async () => {
    await resetDb();
    store = (await testPrisma.location.create({ data: { name: "Tienda A" } })).id;
    owner = (await testPrisma.user.create({ data: { username: "owner", name: "Lolo", password: "x", role: "owner" } })).id;
    brandId = (await testPrisma.brand.create({ data: { name: "Nautica", slug: "nautica" } })).id;
    otherBrandId = (await testPrisma.brand.create({ data: { name: "Guess", slug: "guess" } })).id;
    dept = (await testPrisma.department.create({ data: { slug: "hombre", name: "Hombre" } })).id;
    otherDept = (await testPrisma.department.create({ data: { slug: "dama", name: "Dama" } })).id;
    A = await mk("Polo Nautica - M", VA, "M", "AAAAA");
    // B está en otro departamento: sus renglones de venta conservan el departamento histórico.
    B = await mk("Polo Nautica - L", VB, "L", "BBBBB", { departmentId: otherDept });
    C = await mk("Polo Nautica - XL", VC, "XL", "CCCCC");
  });

  afterAll(async () => {
    await clientA.$disconnect();
    await clientB.$disconnect();
    await testPrisma.$disconnect();
  });

  it("residual 5: el título del destino pierde la talla final al unir", async () => {
    await ds.mergeProducts(A, [B], owner);
    const a = await testPrisma.product.findUniqueOrThrow({ where: { id: A } });
    expect(a.title).toBe("Polo Nautica");
  });

  it("residual 5: un título con modelo numérico no se recorta", async () => {
    await testPrisma.product.update({ where: { id: A }, data: { title: "Nike Air Max 90" } });
    await ds.mergeProducts(A, [B], owner);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: A } })).title).toBe("Nike Air Max 90");
  });

  it("une B en A conservando ventas, movimientos, existencias y dashboard", async () => {
    await sell(VA, 1);
    await sell(VB, 2);
    await ds.recordStockMovement({ variantId: VB, locationId: store, type: "RESTOCK", delta: 3, notes: "entrada", requestId: randomUUID(), userId: owner });
    await ds.recordStockMovement({ variantId: VB, locationId: store, type: "DAMAGE", delta: -1, notes: "merma", requestId: randomUUID(), userId: owner });

    const movementsBefore = await testPrisma.movement.count();
    const stockBefore = await stockTotal();
    const dashBefore = await dashboard();
    const lineBefore = await testPrisma.saleLine.findFirstOrThrow({ where: { variantId: VB } });

    const res = await ds.mergeProducts(A, [B], owner);
    expect(res).toEqual({ movedVariants: 1, movedSaleLines: 1, alreadyMerged: 0 });

    const a = await testPrisma.product.findUniqueOrThrow({ where: { id: A }, include: { variants: true } });
    expect(a.variants.map((v) => v.size).sort()).toEqual(["L", "M"]);
    const b = await testPrisma.product.findUniqueOrThrow({ where: { id: B } });
    expect(b).toMatchObject({ isActive: false, mergedIntoId: A, mergedById: owner });
    expect(b.mergedAt).toBeInstanceOf(Date);

    const lineAfter = await testPrisma.saleLine.findUniqueOrThrow({ where: { id: lineBefore.id } });
    expect(lineAfter.productId).toBe(A);
    expect(lineAfter.departmentId).toBe(otherDept);
    expect(lineAfter.departmentId).toBe(lineBefore.departmentId);

    expect(await testPrisma.movement.count()).toBe(movementsBefore);
    expect(await stockTotal()).toBe(stockBefore);
    expect(await dashboard()).toEqual(dashBefore);
  });

  it("tallas viejas: A 'Polo - M' (talla U) + B 'Polo - L' (talla U) → A queda con tallas M y L", async () => {
    const VU1 = "00000000-0000-4000-8000-0000000000d1";
    const VU2 = "00000000-0000-4000-8000-0000000000d2";
    const OA = await mk("Polo - M", VU1, "U", "DDDDD", { departmentId: null });
    const OB = await mk("Polo - L", VU2, "U", "EEEEE", { departmentId: null });
    const res = await ds.mergeProducts(OA, [OB], owner);
    expect(res.movedVariants).toBe(1);
    const variants = await testPrisma.variant.findMany({ where: { productId: OA }, orderBy: { size: "asc" } });
    expect(variants.map((v) => [v.id, v.size, v.title])).toEqual([
      [VU2, "L", "L"],
      [VU1, "M", "M"],
    ]);
    // Los productos con talla real (A, B y C del beforeEach) siguen igual.
    expect((await testPrisma.variant.findUniqueOrThrow({ where: { id: VA } })).size).toBe("M");
  });

  it("tallas viejas: una variante con talla real no se reescribe con la del título", async () => {
    const res = await ds.mergeProducts(A, [C], owner);
    expect(res.movedVariants).toBe(1);
    const sizes = (await testPrisma.variant.findMany({ where: { productId: A } })).map((v) => v.size).sort();
    expect(sizes).toEqual(["M", "XL"]);
  });

  it("repetir la unión devuelve alreadyMerged sin cambiar nada", async () => {
    await ds.mergeProducts(A, [B], owner);
    const before = await testPrisma.product.findUniqueOrThrow({ where: { id: B } });
    const res = await ds.mergeProducts(A, [B], owner);
    expect(res).toEqual({ movedVariants: 0, movedSaleLines: 0, alreadyMerged: 1 });
    expect(await testPrisma.product.findUniqueOrThrow({ where: { id: B } })).toEqual(before);
  });

  it("A←B y B←C en paralelo terminan sin interbloqueo y no dejan cadenas", async () => {
    const results = await Promise.allSettled([dsA.mergeProducts(A, [B], owner), dsB.mergeProducts(B, [C], owner)]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    for (const r of results) {
      if (r.status === "rejected") expect(r.reason).toBeInstanceOf(InventoryRuleError);
    }
    const all = await testPrisma.product.findMany();
    const merged = new Set(all.filter((p) => p.mergedIntoId).map((p) => p.id));
    for (const p of all) {
      if (p.mergedIntoId) expect(merged.has(p.mergedIntoId)).toBe(false);
    }
  });

  it("une varios orígenes en una sola llamada y repunta lo que ya apuntaba al origen", async () => {
    await ds.mergeProducts(B, [C], owner); // C -> B
    const res = await ds.mergeProducts(A, [B], owner);
    expect(res.movedVariants).toBe(2); // L de B y XL que C le había dejado
    const c = await testPrisma.product.findUniqueOrThrow({ where: { id: C } });
    expect(c.mergedIntoId).toBe(A);
  });

  it("marcas distintas: InventoryRuleError y no escribe nada", async () => {
    const D = await mk("Polo Nautica - S", "00000000-0000-4000-8000-0000000000c4", "S", "DDDDD", { brandId: otherBrandId });
    await expect(ds.mergeProducts(A, [D], owner)).rejects.toBeInstanceOf(InventoryRuleError);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: D } })).mergedIntoId).toBeNull();
    expect(await testPrisma.variant.count({ where: { productId: A } })).toBe(1);
  });

  it("origen unido a otro destino: InventoryRuleError", async () => {
    await ds.mergeProducts(A, [B], owner);
    await expect(ds.mergeProducts(C, [B], owner)).rejects.toBeInstanceOf(InventoryRuleError);
  });

  it("destino inactivo o unido: InventoryRuleError", async () => {
    await ds.mergeProducts(A, [B], owner);
    await expect(ds.mergeProducts(B, [C], owner)).rejects.toBeInstanceOf(InventoryRuleError);
    await testPrisma.product.update({ where: { id: C }, data: { isActive: false } });
    await expect(ds.mergeProducts(C, [A], owner)).rejects.toBeInstanceOf(InventoryRuleError);
  });

  it("copia las dos fotos del origen si al destino le falta una", async () => {
    await testPrisma.product.update({ where: { id: A }, data: { imageUrl: "https://x.invalid/a-f.jpg" } });
    await testPrisma.product.update({ where: { id: B }, data: { imageUrl: "https://x.invalid/b-f.jpg", backImageUrl: "https://x.invalid/b-b.jpg" } });
    await ds.mergeProducts(A, [B], owner);
    expect(await testPrisma.product.findUniqueOrThrow({ where: { id: A }, select: { imageUrl: true, backImageUrl: true } })).toEqual({
      imageUrl: "https://x.invalid/b-f.jpg",
      backImageUrl: "https://x.invalid/b-b.jpg",
    });
  });

  it("no pisa las fotos del destino si ya tiene las dos", async () => {
    await testPrisma.product.update({ where: { id: A }, data: { imageUrl: "https://x.invalid/a-f.jpg", backImageUrl: "https://x.invalid/a-b.jpg" } });
    await testPrisma.product.update({ where: { id: B }, data: { imageUrl: "https://x.invalid/b-f.jpg", backImageUrl: "https://x.invalid/b-b.jpg" } });
    await ds.mergeProducts(A, [B], owner);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: A } })).imageUrl).toBe("https://x.invalid/a-f.jpg");
  });

  it("getProductByPublicCode: el código de B devuelve A con sus tallas; el de A, A", async () => {
    await ds.mergeProducts(A, [B], owner);
    const viaB = await ds.getProductByPublicCode("BBBBB");
    expect(viaB?.id).toBe(A);
    expect(viaB?.variants.map((v) => v.size).sort()).toEqual(["L", "M"]);
    expect((await ds.getProductByPublicCode("AAAAA"))?.id).toBe(A);
    expect(await ds.getProductByPublicCode("ZZZZZ")).toBeNull();
  });

  it("sourceIds vacío o con el destino: InventoryRuleError", async () => {
    await expect(ds.mergeProducts(A, [], owner)).rejects.toBeInstanceOf(InventoryRuleError);
    await expect(ds.mergeProducts(A, [A], owner)).rejects.toBeInstanceOf(InventoryRuleError);
  });
});

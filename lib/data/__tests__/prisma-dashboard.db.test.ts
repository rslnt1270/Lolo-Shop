import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { resetDb } from "../../../test/db/reset";
import { PrismaSalesDataSource } from "../prisma-sales-source";
import { businessDateMx, type PaymentMethod } from "@/lib/domain/sale";

const ds = new PrismaSalesDataSource(testPrisma);
const V1 = "00000000-0000-4000-8000-000000000001";
const V2 = "00000000-0000-4000-8000-000000000002";

describe.skipIf(!hasTestDb)("PrismaSalesDataSource.getDashboard", () => {
  let storeA: string;
  let storeB: string;
  let warehouse: string;
  let owner: string;
  let brandId: string;
  const today = businessDateMx(new Date());

  async function sell(locationId: string, variantId: string, quantity: number, price: number, method: PaymentMethod) {
    return ds.createSale(
      { clientRequestId: randomUUID(), locationId, channel: method === "spay_transfer" ? "whatsapp" : "store", paymentMethod: method, lines: [{ variantId, quantity, unitPrice: price }] },
      owner,
    );
  }

  beforeEach(async () => {
    await resetDb();
    storeA = (await testPrisma.location.create({ data: { name: "A" } })).id;
    storeB = (await testPrisma.location.create({ data: { name: "B" } })).id;
    warehouse = (await testPrisma.location.create({ data: { name: "Bodega", type: "warehouse" } })).id;
    owner = (await testPrisma.user.create({ data: { username: "owner", password: "x", role: "owner" } })).id;
    brandId = (await testPrisma.brand.create({ data: { name: "Guess", slug: "guess" } })).id;
    const departmentId = (await testPrisma.department.create({ data: { slug: "dama", name: "Dama" } })).id;
    await testPrisma.product.create({
      data: {
        title: "Playera", brand: "Guess", brandId, departmentId, category: "Playeras",
        variants: { create: [
          { id: V1, title: "M", sku: "S-M", price: 300, size: "M" },
          { id: V2, title: "L", sku: "S-L", price: 320, size: "L" },
        ] },
      },
    });
    for (const v of [V1, V2]) {
      for (const loc of [storeA, storeB, warehouse]) {
        await testPrisma.inventoryLevel.create({ data: { variantId: v, locationId: loc, available: 20 } });
      }
    }
  });

  afterAll(() => testPrisma.$disconnect());

  async function seedSales() {
    await sell(storeA, V1, 2, 300, "cash"); // 600 paid
    await sell(storeA, V2, 1, 310.1, "cash"); // 310.10 paid
    await sell(storeA, V1, 1, 300.2, "spay_transfer"); // 300.20 pending
    const cancelled = await sell(storeB, V1, 5, 300, "cash"); // 1500
    await ds.cancelSale(cancelled.id, owner, "error", true);
  }

  it("soldTotal excluye canceladas e incluye pendientes; collectedTotal solo paid", async () => {
    await seedSales();
    const d = await ds.getDashboard({ from: today, to: today, locationIds: "all" });
    expect(d.soldTotal).toBe(1210.3);
    expect(d.collectedTotal).toBe(910.1);
    expect(d.salesCount).toBe(3);
    expect(d.byDay).toEqual([{ date: today, total: 1210.3, count: 3 }]);
    expect(d.byChannel.find((c) => c.channel === "whatsapp")?.total).toBe(300.2);
    expect(d.byLocation).toEqual([{ locationId: storeA, total: 1210.3 }]);
  });

  it("pendingPayments tiene 1 elemento", async () => {
    await seedSales();
    const d = await ds.getDashboard({ from: today, to: today, locationIds: "all" });
    expect(d.pendingPayments).toHaveLength(1);
    expect(d.pendingPayments[0].total).toBe(300.2);
  });

  it("byBrand y byDepartment suman quantity x unitPrice", async () => {
    await seedSales();
    const d = await ds.getDashboard({ from: today, to: today, locationIds: "all" });
    expect(d.byBrand).toEqual([{ brandId, name: "Guess", units: 4, total: 1210.3 }]);
    expect(d.byDepartment[0]).toMatchObject({ name: "Dama", units: 4, total: 1210.3 });
  });

  it("respeta el filtro de tienda y de rango", async () => {
    await seedSales();
    expect((await ds.getDashboard({ from: today, to: today, locationIds: [storeB] })).soldTotal).toBe(0);
    expect((await ds.getDashboard({ from: "2020-01-01", to: "2020-01-31", locationIds: "all" })).salesCount).toBe(0);
  });

  it("lowStock: umbral global 2, minStock gana, solo tiendas activas", async () => {
    await testPrisma.inventoryLevel.updateMany({ where: { variantId: V1, locationId: storeA }, data: { available: 2 } });
    await testPrisma.inventoryLevel.updateMany({ where: { variantId: V2, locationId: storeA }, data: { available: 1, minStock: 0 } });
    await testPrisma.inventoryLevel.updateMany({ where: { variantId: V1, locationId: warehouse }, data: { available: 0 } });
    const q = { from: today, to: today, locationIds: "all" as const };

    let d = await ds.getDashboard(q);
    expect(d.lowStock).toEqual([
      { variantId: V1, locationId: storeA, productTitle: "Playera", size: "M", available: 2, threshold: 2 },
    ]);

    await testPrisma.inventoryLevel.updateMany({ where: { variantId: V2, locationId: storeA }, data: { available: 0 } });
    d = await ds.getDashboard(q);
    expect(d.lowStock.map((l) => l.variantId).sort()).toEqual([V1, V2].sort());
    expect(d.lowStock.find((l) => l.variantId === V2)?.threshold).toBe(0);

    await testPrisma.variant.update({ where: { id: V1 }, data: { isActive: false } });
    d = await ds.getDashboard(q);
    expect(d.lowStock.map((l) => l.variantId)).toEqual([V2]);
  });
});

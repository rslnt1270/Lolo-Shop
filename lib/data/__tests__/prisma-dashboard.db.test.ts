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
    const d = await ds.getDashboard({ from: today, to: today, locationIds: "all", pendingScope: "all_dates" });
    expect(d.soldTotal).toBe(1210.3);
    expect(d.collectedTotal).toBe(910.1);
    expect(d.salesCount).toBe(3);
    expect(d.byDay).toEqual([{ date: today, total: 1210.3, count: 3 }]);
    expect(d.byChannel.find((c) => c.channel === "whatsapp")?.total).toBe(300.2);
    expect(d.byLocation).toEqual([{ locationId: storeA, total: 1210.3 }]);
  });

  it("pendingPayments tiene 1 elemento", async () => {
    await seedSales();
    const d = await ds.getDashboard({ from: today, to: today, locationIds: "all", pendingScope: "all_dates" });
    expect(d.pendingPayments).toHaveLength(1);
    expect(d.pendingPayments[0].total).toBe(300.2);
  });

  it("byBrand y byDepartment suman quantity x unitPrice", async () => {
    await seedSales();
    const d = await ds.getDashboard({ from: today, to: today, locationIds: "all", pendingScope: "all_dates" });
    expect(d.byBrand).toEqual([{ brandId, name: "Guess", units: 4, total: 1210.3 }]);
    expect(d.byDepartment[0]).toMatchObject({ name: "Dama", units: 4, total: 1210.3 });
  });

  it("respeta el filtro de tienda y de rango", async () => {
    await seedSales();
    expect((await ds.getDashboard({ from: today, to: today, locationIds: [storeB], pendingScope: "all_dates" })).soldTotal).toBe(0);
    expect((await ds.getDashboard({ from: "2020-01-01", to: "2020-01-31", locationIds: "all", pendingScope: "all_dates" })).salesCount).toBe(0);
  });

  it("lowStock: umbral global 2, minStock gana, solo tiendas activas", async () => {
    await testPrisma.inventoryLevel.updateMany({ where: { variantId: V1, locationId: storeA }, data: { available: 2 } });
    await testPrisma.inventoryLevel.updateMany({ where: { variantId: V2, locationId: storeA }, data: { available: 1, minStock: 0 } });
    await testPrisma.inventoryLevel.updateMany({ where: { variantId: V1, locationId: warehouse }, data: { available: 0 } });
    const q = { from: today, to: today, locationIds: "all" as const, pendingScope: "all_dates" as const };

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

  it("pendingScope: pendiente de un día anterior se oculta con range y se ve con all_dates", async () => {
    const old = await sell(storeA, V1, 1, 300, "spay_transfer");
    await testPrisma.sale.update({ where: { id: old.id }, data: { businessDate: new Date("2020-01-15T00:00:00Z") } });
    await sell(storeA, V2, 1, 320, "spay_transfer");
    const base = { from: today, to: today, locationIds: [storeA] };

    expect((await ds.getDashboard({ ...base, pendingScope: "range" })).pendingPayments).toHaveLength(1);
    const all = await ds.getDashboard({ ...base, pendingScope: "all_dates" });
    expect(all.pendingPayments).toHaveLength(2);
    expect(all.pendingPayments[0].saleId).toBe(old.id);
  });

  it("locationIds vacío devuelve ceros y listas vacías", async () => {
    await seedSales();
    const d = await ds.getDashboard({ from: today, to: today, locationIds: [], pendingScope: "range" });
    expect(d).toEqual({
      soldTotal: 0, collectedTotal: 0, salesCount: 0, byDay: [], byLocation: [], byChannel: [],
      byPaymentMethod: [], byBrand: [], byDepartment: [], pendingPayments: [], lowStock: [],
    });
  });

  it("pendingPayments trae el alias del pedido (o null)", async () => {
    await ds.createSale(
      { clientRequestId: randomUUID(), locationId: storeA, channel: "whatsapp", paymentMethod: "spay_transfer", customerAlias: "chamarra azul", lines: [{ variantId: V1, quantity: 1, unitPrice: 300 }] },
      owner,
    );
    await sell(storeA, V2, 1, 320, "spay_transfer");
    const d = await ds.getDashboard({ from: today, to: today, locationIds: "all", pendingScope: "all_dates" });
    expect(d.pendingPayments.map((p) => p.customerAlias)).toEqual(["chamarra azul", null]);
  });

  describe("recentSales (Ventas de hoy)", () => {
    const q = (over: Record<string, unknown> = {}) => ({
      from: today,
      to: today,
      locationIds: "all" as string[] | "all",
      pendingScope: "all_dates" as const,
      recentSalesDate: today,
      ...over,
    });

    it("sin recentSalesDate no se devuelve", async () => {
      await seedSales();
      const { recentSalesDate: _omit, ...rest } = q();
      expect((await ds.getDashboard(rest)).recentSales).toBeUndefined();
    });

    it("paid y pending_payment del día, de la más nueva a la más vieja, sin canceladas ni otros días", async () => {
      await seedSales();
      const old = await sell(storeA, V2, 1, 320, "cash");
      await testPrisma.sale.update({ where: { id: old.id }, data: { businessDate: new Date("2020-01-15T00:00:00Z") } });

      const d = await ds.getDashboard(q());
      expect(d.recentSales!.map((r) => [r.number, r.status])).toEqual([
        [3, "pending_payment"],
        [2, "paid"],
        [1, "paid"],
      ]);
      expect(d.recentSales![0]).toEqual({
        saleId: expect.any(String),
        number: 3,
        total: 300.2,
        locationId: storeA,
        status: "pending_payment",
        channel: "whatsapp",
        paymentMethod: "spay_transfer",
        createdAt: expect.any(String),
      });
    });

    it("respeta las tiendas del alcance y la fecha pedida, no el rango", async () => {
      await seedSales();
      await sell(storeB, V2, 1, 320, "card");
      expect((await ds.getDashboard(q({ locationIds: [storeB] }))).recentSales!.map((r) => r.locationId)).toEqual([storeB]);
      expect((await ds.getDashboard(q({ from: "2020-01-01", to: "2020-01-31" }))).recentSales).toHaveLength(4);
      expect((await ds.getDashboard(q({ recentSalesDate: "2020-01-15" }))).recentSales).toEqual([]);
    });

    it("máximo 50 filas", async () => {
      await testPrisma.inventoryLevel.updateMany({ where: { variantId: V1, locationId: storeA }, data: { available: 100 } });
      for (let i = 0; i < 52; i++) await sell(storeA, V1, 1, 10, "cash");
      const rows = (await ds.getDashboard(q())).recentSales!;
      expect(rows).toHaveLength(50);
      expect(rows[0].number).toBe(52);
    });
  });

  it("lowStock: máximo 50 filas, las de menos piezas primero", async () => {
    const variants = Array.from({ length: 55 }, (_, i) => ({
      id: `00000000-0000-4000-8000-1${String(i).padStart(11, "0")}`,
      title: `T${i}`,
      sku: `LS-${i}`,
      price: 100,
      size: `T${i}`,
    }));
    await testPrisma.product.create({ data: { title: "Calcetín", brand: "Guess", brandId, category: "Calcetines", variants: { create: variants } } });
    for (const [i, v] of variants.entries()) {
      await testPrisma.inventoryLevel.create({ data: { variantId: v.id, locationId: storeA, available: i % 3 } });
    }
    const d = await ds.getDashboard({ from: today, to: today, locationIds: "all", pendingScope: "all_dates" });
    expect(d.lowStock).toHaveLength(50);
    const avail = d.lowStock.map((l) => l.available);
    expect(avail).toEqual([...avail].sort((a, b) => a - b));
    expect(avail.filter((a) => a === 0)).toHaveLength(19);
  });
});

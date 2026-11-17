import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { pinMexicoNoon } from "../../../test/mexico-noon";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { getTestDatabaseUrl } from "../../../test/db/guard";
import { resetDb } from "../../../test/db/reset";
import { PrismaSalesDataSource } from "../prisma-sales-source";
import { SalesRuleError } from "../errors";
import { businessDateMx, type NewSaleInput } from "@/lib/domain/sale";
import type { OfflineMeta } from "@/lib/domain/offline-sale";

const url = getTestDatabaseUrl() ?? "postgresql://invalid:invalid@127.0.0.1:1/none";
const cajaA = new PrismaClient({ datasources: { db: { url } } });
const cajaB = new PrismaClient({ datasources: { db: { url } } });
const dsA = new PrismaSalesDataSource(cajaA);
const dsB = new PrismaSalesDataSource(cajaB);
const ds = new PrismaSalesDataSource(testPrisma);

const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const meta = (): OfflineMeta => ({ soldAt: ago(HOUR), snapshotAt: ago(2 * HOUR) });

const V1 = "00000000-0000-4000-8000-000000000001";
const V2 = "00000000-0000-4000-8000-000000000002";

let storeA: string;
let storeB: string;
let owner: string;

async function seed() {
  storeA = (await testPrisma.location.create({ data: { name: "Tienda A" } })).id;
  storeB = (await testPrisma.location.create({ data: { name: "Tienda B" } })).id;
  owner = (await testPrisma.user.create({ data: { username: "owner", password: "x", role: "owner", name: "Dueña" } })).id;
  await testPrisma.product.create({
    data: {
      title: "Playera",
      brand: "Guess",
      category: "Playeras",
      variants: {
        create: [
          { id: V1, title: "M", sku: "SKU-M", size: "M", price: 300 },
          { id: V2, title: "L", sku: "SKU-L", size: "L", price: 320 },
        ],
      },
    },
  });
}

const setStock = (variantId: string, locationId: string, available: number) =>
  testPrisma.inventoryLevel.create({ data: { variantId, locationId, available } });
const available = async (variantId: string, locationId: string) =>
  (await testPrisma.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId, locationId } } }))?.available ?? null;

function input(locationId: string, lines: NewSaleInput["lines"]): NewSaleInput {
  return { clientRequestId: randomUUID(), locationId, channel: "store", paymentMethod: "cash", lines };
}

/** Stock 1, vende 2 sin internet: available 0, shortfall 1, en revisión. */
async function pendingSale(locationId = storeA) {
  await setStock(V1, locationId, 1);
  return ds.createSale(input(locationId, [{ variantId: V1, quantity: 2, unitPrice: 300 }]), owner, { offline: meta() });
}

describe.skipIf(!hasTestDb)("PrismaSalesDataSource: revisión del dueño", () => {
  pinMexicoNoon();
  beforeEach(async () => {
    await resetDb();
    await seed();
  });
  afterEach(async () => {
    expect(await testPrisma.inventoryLevel.count({ where: { available: { lt: 0 } } })).toBe(0);
  });
  afterAll(async () => {
    await Promise.all([testPrisma.$disconnect(), cajaA.$disconnect(), cajaB.$disconnect()]);
  });

  it("aprobar deja approved, reviewedBy y no cambia available", async () => {
    const rec = await pendingSale();
    const out = await ds.approveReview(rec.id, owner, "  Llegó la prenda  ");
    expect(out.reviewStatus).toBe("approved");
    expect(out.status).toBe("paid");
    const row = await testPrisma.sale.findUniqueOrThrow({ where: { id: rec.id } });
    expect(row).toMatchObject({ reviewStatus: "approved", reviewedById: owner, reviewNote: "Llegó la prenda" });
    expect(row.reviewedAt).toBeInstanceOf(Date);
    expect(await available(V1, storeA)).toBe(0);
    expect(await testPrisma.movement.count({ where: { saleId: rec.id } })).toBe(1);
  });

  it("rechazar con devolución reingresa quantity - shortfall", async () => {
    const rec = await pendingSale();
    const out = await ds.rejectReview(rec.id, owner, "No procede", true);
    expect(out).toMatchObject({ status: "cancelled", reviewStatus: "rejected" });
    expect(await available(V1, storeA)).toBe(1);
    const returns = await testPrisma.movement.findMany({ where: { saleId: rec.id, type: "RETURN" } });
    expect(returns).toHaveLength(1);
    expect(returns[0]).toMatchObject({ delta: 1, userId: owner });
    const row = await testPrisma.sale.findUniqueOrThrow({ where: { id: rec.id } });
    expect(row).toMatchObject({ cancelReason: "No procede", cancelledById: owner, reviewedById: owner });
    const sum = await testPrisma.movement.aggregate({ where: { variantId: V1 }, _sum: { delta: true } });
    expect(1 + (sum._sum.delta ?? 0)).toBe(1);
  });

  it("rechazar sin devolución no toca stock y deja cancelled", async () => {
    const rec = await pendingSale();
    const out = await ds.rejectReview(rec.id, owner, "No procede", false);
    expect(out).toMatchObject({ status: "cancelled", reviewStatus: "rejected" });
    expect(await available(V1, storeA)).toBe(0);
    expect(await testPrisma.movement.count({ where: { saleId: rec.id, type: "RETURN" } })).toBe(0);
  });

  it("rechazar sin motivo o con motivo de más de 200 lanza SalesRuleError", async () => {
    const rec = await pendingSale();
    await expect(ds.rejectReview(rec.id, owner, "   ", true)).rejects.toThrow(SalesRuleError);
    await expect(ds.rejectReview(rec.id, owner, "x".repeat(201), true)).rejects.toThrow(SalesRuleError);
    expect((await testPrisma.sale.findUniqueOrThrow({ where: { id: rec.id } })).reviewStatus).toBe("pending");
  });

  it("aprobar o rechazar una venta no pendiente lanza SalesRuleError", async () => {
    const rec = await pendingSale();
    await ds.approveReview(rec.id, owner);
    await expect(ds.approveReview(rec.id, owner)).rejects.toThrow("Esta venta ya no está por aprobar.");
    await expect(ds.rejectReview(rec.id, owner, "tarde", true)).rejects.toThrow("Esta venta ya no está por aprobar.");
    await expect(ds.approveReview(randomUUID(), owner)).rejects.toThrow(SalesRuleError);
    // Una venta sin revisión tampoco.
    await setStock(V2, storeA, 3);
    const clean = await ds.createSale(input(storeA, [{ variantId: V2, quantity: 1, unitPrice: 320 }]), owner);
    await expect(ds.approveReview(clean.id, owner)).rejects.toThrow("Esta venta ya no está por aprobar.");
    expect(await available(V2, storeA)).toBe(2);
  });

  it("nota de más de 200 lanza SalesRuleError", async () => {
    const rec = await pendingSale();
    await expect(ds.approveReview(rec.id, owner, "x".repeat(201))).rejects.toThrow(SalesRuleError);
    expect((await testPrisma.sale.findUniqueOrThrow({ where: { id: rec.id } })).reviewStatus).toBe("pending");
  });

  it("aprobar y rechazar a la vez: solo una gana", async () => {
    const rec = await pendingSale();
    const [a, r] = await Promise.allSettled([
      dsA.approveReview(rec.id, owner),
      dsB.rejectReview(rec.id, owner, "No procede", true),
    ]);
    expect([a.status, r.status].sort()).toEqual(["fulfilled", "rejected"]);
    const row = await testPrisma.sale.findUniqueOrThrow({ where: { id: rec.id } });
    if (a.status === "fulfilled") {
      expect(row).toMatchObject({ reviewStatus: "approved", status: "paid" });
      expect(await available(V1, storeA)).toBe(0);
    } else {
      expect(row).toMatchObject({ reviewStatus: "rejected", status: "cancelled" });
      expect(await available(V1, storeA)).toBe(1);
    }
  });

  it("dos rechazos a la vez reingresan una sola vez", async () => {
    const rec = await pendingSale();
    const res = await Promise.allSettled([
      dsA.rejectReview(rec.id, owner, "uno", true),
      dsB.rejectReview(rec.id, owner, "dos", true),
    ]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await available(V1, storeA)).toBe(1);
    expect(await testPrisma.movement.count({ where: { saleId: rec.id, type: "RETURN" } })).toBe(1);
  });

  it("listSalesForReview: solo pendientes, más vieja primero, con nombres y renglones", async () => {
    const first = await pendingSale();
    await setStock(V2, storeB, 0);
    const second = await ds.createSale(input(storeB, [{ variantId: V2, quantity: 1, unitPrice: 320 }]), owner, { offline: meta() });
    const items = await ds.listSalesForReview();
    expect(items.map((i) => i.saleId)).toEqual(expect.arrayContaining([first.id, second.id]));
    const created = items.map((i) => i.createdAt);
    expect([...created].sort()).toEqual(created);
    const item = items.find((i) => i.saleId === first.id)!;
    expect(item).toMatchObject({
      number: first.number,
      locationId: storeA,
      locationName: "Tienda A",
      cashierName: "Dueña",
      total: 600,
      paymentMethod: "cash",
      reasons: ["insufficient_stock"],
    });
    expect(item.soldAt).not.toBeNull();
    expect(item.lines).toEqual([{ variantId: V1, productTitle: "Playera", size: "M", quantity: 2, shortfall: 1, unitPrice: 300 }]);
    await ds.approveReview(first.id, owner);
    await ds.rejectReview(second.id, owner, "no", false);
    expect(await ds.listSalesForReview()).toEqual([]);
  });

  it("listSalesForReview devuelve como máximo 100", async () => {
    const base = await pendingSale();
    const row = await testPrisma.sale.findUniqueOrThrow({ where: { id: base.id }, include: { lines: true } });
    const copies = Array.from({ length: 100 }, () => ({
      clientRequestId: randomUUID(),
      channel: row.channel,
      paymentMethod: row.paymentMethod,
      status: row.status,
      locationId: row.locationId,
      total: row.total,
      businessDate: row.businessDate,
      createdById: row.createdById,
      origin: row.origin,
      soldAt: row.soldAt,
      reviewStatus: "pending" as const,
      reviewReasons: row.reviewReasons,
    }));
    await testPrisma.sale.createMany({ data: copies });
    expect(await ds.listSalesForReview()).toHaveLength(100);
  });

  describe("dashboard", () => {
    const today = () => businessDateMx(new Date());
    const q = (locationIds: string[] | "all") => ({ from: today(), to: today(), locationIds, pendingScope: "all_dates" as const });

    it("pendingReviewCount cuenta solo pending del alcance", async () => {
      await pendingSale(storeA);
      await setStock(V2, storeB, 0);
      await ds.createSale(input(storeB, [{ variantId: V2, quantity: 1, unitPrice: 320 }]), owner, { offline: meta() });
      expect((await ds.getDashboard(q("all"))).pendingReviewCount).toBe(2);
      expect((await ds.getDashboard(q([storeA]))).pendingReviewCount).toBe(1);
      expect((await ds.getDashboard(q([storeB]))).pendingReviewCount).toBe(1);
      // Una venta aprobada deja de contar.
      const [first] = await ds.listSalesForReview();
      await ds.approveReview(first.saleId, owner);
      expect((await ds.getDashboard(q("all"))).pendingReviewCount).toBe(1);
    });

    it("ventas en revisión cuentan en soldTotal y las rechazadas no", async () => {
      const rec = await pendingSale();
      expect((await ds.getDashboard(q("all"))).soldTotal).toBe(600);
      expect((await ds.getDashboard(q("all"))).pendingReviewTotal).toBe(600);
      await ds.rejectReview(rec.id, owner, "No procede", true);
      const d = await ds.getDashboard(q("all"));
      expect(d.soldTotal).toBe(0);
      expect(d.salesCount).toBe(0);
      expect(d.pendingReviewCount).toBe(0);
    });
  });
});

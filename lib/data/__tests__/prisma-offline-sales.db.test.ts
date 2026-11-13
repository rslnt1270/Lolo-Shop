import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { getTestDatabaseUrl } from "../../../test/db/guard";
import { resetDb } from "../../../test/db/reset";
import { PrismaSalesDataSource } from "../prisma-sales-source";
import { InsufficientStockError, SalesRuleError } from "../errors";
import { businessDateMx, type NewSaleInput } from "@/lib/domain/sale";
import type { OfflineMeta } from "@/lib/domain/offline-sale";

// Dos clientes con su propio pool, como dos teléfonos que sincronizan a la vez.
const url = getTestDatabaseUrl() ?? "postgresql://invalid:invalid@127.0.0.1:1/none";
const cajaA = new PrismaClient({ datasources: { db: { url } } });
const cajaB = new PrismaClient({ datasources: { db: { url } } });
const dsA = new PrismaSalesDataSource(cajaA);
const dsB = new PrismaSalesDataSource(cajaB);
const ds = new PrismaSalesDataSource(testPrisma);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

/** Venta de hace 1 h con copia de hace 2 h: vigente y sin sesgo. */
const meta = (soldMsAgo = HOUR, snapshotMsBefore = HOUR): OfflineMeta => ({
  soldAt: ago(soldMsAgo),
  snapshotAt: ago(soldMsAgo + snapshotMsBefore),
});

interface World {
  storeA: string;
  owner: string;
  collab: string;
  productId: string;
  v1: string;
  v2: string;
}

async function seed(): Promise<World> {
  const storeA = (await testPrisma.location.create({ data: { name: "Tienda A" } })).id;
  const owner = (await testPrisma.user.create({ data: { username: "owner", password: "x", role: "owner" } })).id;
  const collab = (
    await testPrisma.user.create({ data: { username: "colab", password: "x", role: "collaborator", locationId: storeA } })
  ).id;
  const product = await testPrisma.product.create({
    data: {
      title: "Playera",
      brand: "Guess",
      category: "Playeras",
      variants: {
        create: [
          { id: "00000000-0000-4000-8000-000000000001", title: "M", sku: "SKU-M", price: 300 },
          { id: "00000000-0000-4000-8000-000000000002", title: "L", sku: "SKU-L", price: 320 },
        ],
      },
    },
  });
  return {
    storeA,
    owner,
    collab,
    productId: product.id,
    v1: "00000000-0000-4000-8000-000000000001",
    v2: "00000000-0000-4000-8000-000000000002",
  };
}

async function setStock(variantId: string, locationId: string, available: number) {
  await testPrisma.inventoryLevel.create({ data: { variantId, locationId, available } });
}

async function available(variantId: string, locationId: string): Promise<number | null> {
  const lvl = await testPrisma.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId, locationId } } });
  return lvl?.available ?? null;
}

async function expectLedger(variantId: string, locationId: string, initial: number) {
  const sum = await testPrisma.movement.aggregate({ where: { variantId, locationId }, _sum: { delta: true } });
  expect(await available(variantId, locationId)).toBe(initial + (sum._sum.delta ?? 0));
}

function sale(locationId: string, lines: NewSaleInput["lines"], clientRequestId: string = randomUUID()): NewSaleInput {
  return { clientRequestId, locationId, channel: "store", paymentMethod: "cash", lines };
}

const one = (variantId: string, quantity = 1, unitPrice = 300) => ({ variantId, quantity, unitPrice });

describe.skipIf(!hasTestDb)("PrismaSalesDataSource sin internet", () => {
  let w: World;

  beforeEach(async () => {
    await resetDb();
    w = await seed();
  });

  // Criterio 4 del spec: ningún camino deja available < 0, después de cada caso.
  afterEach(async () => {
    expect(await testPrisma.inventoryLevel.count({ where: { available: { lt: 0 } } })).toBe(0);
  });

  afterAll(async () => {
    await Promise.all([testPrisma.$disconnect(), cajaA.$disconnect(), cajaB.$disconnect()]);
  });

  describe("createSale con offline", () => {
    it("sin internet con stock suficiente: descuenta, origin offline, sin revisión", async () => {
      await setStock(w.v1, w.storeA, 3);
      const m = meta();
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1, 2)]), w.owner, { offline: m });

      expect(rec.origin).toBe("offline");
      expect(rec.reviewStatus).toBeNull();
      expect(rec.reviewReasons).toEqual([]);
      expect(rec.soldAt).toBe(m.soldAt);
      expect(rec.lines).toEqual([{ variantId: w.v1, quantity: 2, unitPrice: 300, shortfall: 0 }]);
      expect(await available(w.v1, w.storeA)).toBe(1);
      const row = await testPrisma.sale.findUniqueOrThrow({ where: { id: rec.id } });
      expect(row.offlineSnapshotAt?.toISOString()).toBe(m.snapshotAt);
      expect(row.createdById).toBe(w.owner);
      const line = await testPrisma.saleLine.findFirstOrThrow({ where: { saleId: rec.id } });
      expect(line).toMatchObject({ productId: w.productId, category: "Playeras", shortfall: 0 });
      await expectLedger(w.v1, w.storeA, 3);
    });

    it("sin internet con stock insuficiente: available 1, pide 2 → available 0, shortfall 1, reviewStatus pending, reasons [insufficient_stock], Movement SALE delta -1", async () => {
      await setStock(w.v1, w.storeA, 1);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1, 2)]), w.owner, { offline: meta() });

      expect(rec.lines).toEqual([{ variantId: w.v1, quantity: 2, unitPrice: 300, shortfall: 1 }]);
      expect(rec.reviewStatus).toBe("pending");
      expect(rec.reviewReasons).toEqual(["insufficient_stock"]);
      expect(rec.total).toBe(600);
      expect(await available(w.v1, w.storeA)).toBe(0);
      const movs = await testPrisma.movement.findMany({ where: { saleId: rec.id } });
      expect(movs).toHaveLength(1);
      expect(movs[0]).toMatchObject({ type: "SALE", delta: -1, userId: w.owner });
      await expectLedger(w.v1, w.storeA, 1);
    });

    it("sin internet sin fila InventoryLevel: shortfall = quantity, sin Movement", async () => {
      await setStock(w.v2, w.storeA, 2);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1, 2), one(w.v2, 1, 320)]), w.owner, { offline: meta() });

      expect(rec.lines).toEqual([
        { variantId: w.v1, quantity: 2, unitPrice: 300, shortfall: 2 },
        { variantId: w.v2, quantity: 1, unitPrice: 320, shortfall: 0 },
      ]);
      expect(rec.reviewStatus).toBe("pending");
      expect(await available(w.v1, w.storeA)).toBeNull();
      expect(await available(w.v2, w.storeA)).toBe(1);
      const movs = await testPrisma.movement.findMany({ where: { saleId: rec.id } });
      expect(movs.map((m) => [m.variantId, m.delta])).toEqual([[w.v2, -1]]);
    });

    it("dos ventas sin internet concurrentes sobre la última pieza", async () => {
      await setStock(w.v1, w.storeA, 1);
      const [a, b] = await Promise.all([
        dsA.createSale(sale(w.storeA, [one(w.v1)]), w.owner, { offline: meta() }),
        dsB.createSale(sale(w.storeA, [one(w.v1)]), w.collab, { offline: meta() }),
      ]);

      expect([a.lines[0].shortfall, b.lines[0].shortfall].sort()).toEqual([0, 1]);
      const short = a.lines[0].shortfall === 1 ? a : b;
      const full = short === a ? b : a;
      expect(short.reviewStatus).toBe("pending");
      expect(short.reviewReasons).toEqual(["insufficient_stock"]);
      expect(full.reviewStatus).toBeNull();
      expect(await available(w.v1, w.storeA)).toBe(0);
      expect(await testPrisma.movement.count({ where: { type: "SALE" } })).toBe(1);
      await expectLedger(w.v1, w.storeA, 1);
    });

    it("replay sin internet no descuenta dos veces", async () => {
      await setStock(w.v1, w.storeA, 3);
      const input = sale(w.storeA, [one(w.v1, 2)]);
      const m = meta();
      const first = await ds.createSale(input, w.owner, { offline: m });
      const again = await ds.createSale(input, w.owner, { offline: m });

      expect(again.number).toBe(first.number);
      expect(await testPrisma.sale.count()).toBe(1);
      expect(await testPrisma.movement.count({ where: { saleId: first.id } })).toBe(1);
      expect(await available(w.v1, w.storeA)).toBe(1);
    });

    it("replay sin internet simultáneo (dos pestañas): una sola venta y un Movement por renglón", async () => {
      await setStock(w.v1, w.storeA, 3);
      const input = sale(w.storeA, [one(w.v1, 2)]);
      const m = meta();
      const [a, b] = await Promise.all([
        dsA.createSale(input, w.owner, { offline: m }),
        dsB.createSale(input, w.owner, { offline: m }),
      ]);

      expect(a.number).toBe(b.number);
      expect(await testPrisma.sale.count()).toBe(1);
      expect(await testPrisma.movement.count()).toBe(1);
      expect(await available(w.v1, w.storeA)).toBe(1);
    });

    it("replay sin internet de una venta que ya entró en línea devuelve la venta en línea", async () => {
      await setStock(w.v1, w.storeA, 3);
      const input = sale(w.storeA, [one(w.v1)]);
      const online = await ds.createSale(input, w.owner);
      const replay = await ds.createSale(input, w.owner, { offline: meta() });

      expect(replay.number).toBe(online.number);
      expect(replay.origin).toBe("online");
      expect(await available(w.v1, w.storeA)).toBe(2);
    });

    it("producto inactivo se acepta con inactive_product", async () => {
      await setStock(w.v1, w.storeA, 3);
      await testPrisma.product.update({ where: { id: w.productId }, data: { isActive: false } });
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1)]), w.owner, { offline: meta() });

      expect(rec.reviewStatus).toBe("pending");
      expect(rec.reviewReasons).toEqual(["inactive_product"]);
      expect(await available(w.v1, w.storeA)).toBe(2);
    });

    it("variante inactiva se acepta con inactive_product", async () => {
      await setStock(w.v1, w.storeA, 3);
      await testPrisma.variant.update({ where: { id: w.v1 }, data: { isActive: false } });
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1)]), w.owner, { offline: meta() });
      expect(rec.reviewReasons).toEqual(["inactive_product"]);
    });

    it("variante inexistente: SalesRuleError y nada escrito", async () => {
      const err = await ds
        .createSale(sale(w.storeA, [one(randomUUID())]), w.owner, { offline: meta() })
        .catch((e) => e);
      expect(err).toBeInstanceOf(SalesRuleError);
      expect(err.message).toBe("Un producto de la venta ya no existe.");
      expect(await testPrisma.sale.count()).toBe(0);
    });

    it("hora de venta no ISO: SalesRuleError", async () => {
      await setStock(w.v1, w.storeA, 3);
      const err = await ds
        .createSale(sale(w.storeA, [one(w.v1)]), w.owner, { offline: { soldAt: "ayer", snapshotAt: ago(HOUR) } })
        .catch((e) => e);
      expect(err).toBeInstanceOf(SalesRuleError);
      expect(await testPrisma.sale.count()).toBe(0);
    });
  });

  describe("precio (checkPrice)", () => {
    it("colaborador con precio fuera de PriceChange de 7 días → price_unverified; owner no", async () => {
      await setStock(w.v1, w.storeA, 5);
      const collabRec = await ds.createSale(sale(w.storeA, [one(w.v1, 1, 250)]), w.collab, {
        offline: meta(),
        checkPrice: true,
      });
      const ownerRec = await ds.createSale(sale(w.storeA, [one(w.v1, 1, 250)]), w.owner, { offline: meta() });

      expect(collabRec.reviewStatus).toBe("pending");
      expect(collabRec.reviewReasons).toEqual(["price_unverified"]);
      expect(ownerRec.reviewStatus).toBeNull();
      expect(ownerRec.reviewReasons).toEqual([]);
    });

    it("precio vigente con checkPrice no se marca", async () => {
      await setStock(w.v1, w.storeA, 5);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1, 1, 300)]), w.collab, { offline: meta(), checkPrice: true });
      expect(rec.reviewReasons).toEqual([]);
    });

    it("cambio de precio posterior a la copia: su oldPrice es el del teléfono y no se marca", async () => {
      await setStock(w.v1, w.storeA, 5);
      const m = meta(HOUR, 2 * HOUR); // copia de hace 3 h
      await testPrisma.priceChange.create({
        data: { variantId: w.v1, oldPrice: 250, newPrice: 300, changedById: w.owner, createdAt: new Date(Date.now() - 2 * HOUR) },
      });
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1, 1, 250)]), w.collab, { offline: m, checkPrice: true });
      expect(rec.reviewReasons).toEqual([]);
      expect(rec.reviewStatus).toBeNull();
    });

    it("cambio de precio anterior a la copia: el teléfono ya tenía el precio nuevo, se marca price_unverified", async () => {
      await setStock(w.v1, w.storeA, 5);
      const m = meta(HOUR, HOUR); // copia de hace 2 h
      await testPrisma.priceChange.create({
        data: { variantId: w.v1, oldPrice: 250, newPrice: 300, changedById: w.owner, createdAt: new Date(Date.now() - 3 * HOUR) },
      });
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1, 1, 250)]), w.collab, { offline: m, checkPrice: true });
      expect(rec.reviewReasons).toEqual(["price_unverified"]);
    });

    it("cambio posterior a la copia pero de hace más de 7 días no cuenta", async () => {
      await setStock(w.v1, w.storeA, 5);
      const m = meta(7 * DAY - HOUR, 2 * HOUR); // venta hace 6 d 23 h, copia hace 7 d 1 h
      await testPrisma.priceChange.create({
        data: {
          variantId: w.v1,
          oldPrice: 250,
          newPrice: 300,
          changedById: w.owner,
          createdAt: new Date(Date.now() - 7 * DAY - HOUR / 2), // después de la copia, antes de 7 días
        },
      });
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1, 1, 250)]), w.collab, { offline: m, checkPrice: true });
      expect(rec.reviewReasons).toEqual(["price_unverified"]);
    });

    it("checkPrice sin offline se ignora: camino en línea estricto", async () => {
      await setStock(w.v1, w.storeA, 5);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1, 1, 250)]), w.collab, { checkPrice: true });
      expect(rec.origin).toBe("online");
      expect(rec.reviewReasons).toEqual([]);
    });
  });

  describe("reloj", () => {
    it("soldAt 8 días atrás → clock_skew y businessDate de hoy", async () => {
      await setStock(w.v1, w.storeA, 3);
      const before = Date.now();
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1)]), w.owner, { offline: meta(8 * DAY) });

      expect(rec.reviewStatus).toBe("pending");
      expect(rec.reviewReasons).toEqual(["clock_skew"]);
      expect(rec.businessDate).toBe(businessDateMx(new Date()));
      expect(new Date(rec.soldAt!).getTime()).toBeGreaterThanOrEqual(before);
    });

    it("soldAt ayer → businessDate de ayer", async () => {
      await setStock(w.v1, w.storeA, 3);
      const m = meta(DAY);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1)]), w.owner, { offline: m });

      expect(rec.reviewReasons).toEqual([]);
      expect(rec.soldAt).toBe(m.soldAt);
      expect(rec.businessDate).toBe(businessDateMx(new Date(m.soldAt)));
      const row = await testPrisma.sale.findUniqueOrThrow({ where: { id: rec.id } });
      expect(Date.now() - row.createdAt.getTime()).toBeLessThan(60_000);
    });

    it("copia de más de 24 h respecto a la venta → clock_skew", async () => {
      await setStock(w.v1, w.storeA, 3);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1)]), w.owner, { offline: meta(HOUR, DAY + HOUR) });
      expect(rec.reviewReasons).toEqual(["clock_skew"]);
    });

    it("copia con fecha futura (desfase) → clock_skew", async () => {
      await setStock(w.v1, w.storeA, 3);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1)]), w.owner, {
        offline: { soldAt: ago(HOUR), snapshotAt: new Date(Date.now() + HOUR).toISOString() },
      });
      expect(rec.reviewReasons).toEqual(["clock_skew"]);
    });

    it("varias razones se guardan en orden fijo", async () => {
      await setStock(w.v1, w.storeA, 1);
      await testPrisma.product.update({ where: { id: w.productId }, data: { isActive: false } });
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1, 2, 1)]), w.collab, {
        offline: meta(8 * DAY),
        checkPrice: true,
      });
      expect(rec.reviewReasons).toEqual(["insufficient_stock", "price_unverified", "inactive_product", "clock_skew"]);
    });
  });

  describe("mapeo de SaleRecord", () => {
    it("toRecord descarta razones desconocidas guardadas en la base", async () => {
      await setStock(w.v1, w.storeA, 3);
      const input = sale(w.storeA, [one(w.v1)]);
      const m = meta();
      const rec = await ds.createSale(input, w.owner, { offline: m });
      await testPrisma.sale.update({
        where: { id: rec.id },
        data: { reviewStatus: "pending", reviewReasons: ["razon_futura", "clock_skew", ""] },
      });
      const replay = await ds.createSale(input, w.owner, { offline: m });
      expect(replay.reviewReasons).toEqual(["clock_skew"]);
      expect(replay.soldAt).toBe(m.soldAt);
    });
  });

  describe("regresión del camino en línea", () => {
    it("en línea sin stock sigue lanzando InsufficientStockError", async () => {
      await setStock(w.v1, w.storeA, 1);
      const err = await ds.createSale(sale(w.storeA, [one(w.v1, 2)]), w.owner).catch((e) => e);
      expect(err).toBeInstanceOf(InsufficientStockError);
      expect(await testPrisma.sale.count()).toBe(0);
      expect(await available(w.v1, w.storeA)).toBe(1);
    });

    it("en línea con producto inactivo sigue rechazando", async () => {
      await setStock(w.v1, w.storeA, 1);
      await testPrisma.product.update({ where: { id: w.productId }, data: { isActive: false } });
      await expect(ds.createSale(sale(w.storeA, [one(w.v1)]), w.owner)).rejects.toBeInstanceOf(SalesRuleError);
    });
  });

  describe("cancelSale con faltante", () => {
    it("cancelSale con itemsReturned reingresa quantity - shortfall", async () => {
      await setStock(w.v1, w.storeA, 1);
      await setStock(w.v2, w.storeA, 2);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1, 2), one(w.v2, 1, 320)]), w.owner, { offline: meta() });
      expect(await available(w.v1, w.storeA)).toBe(0);

      await ds.cancelSale(rec.id, w.owner, "Error de cobro", true);

      expect(await available(w.v1, w.storeA)).toBe(1);
      expect(await available(w.v2, w.storeA)).toBe(2);
      const returns = await testPrisma.movement.findMany({ where: { saleId: rec.id, type: "RETURN" }, orderBy: { variantId: "asc" } });
      expect(returns.map((m) => [m.variantId, m.delta])).toEqual([[w.v1, 1], [w.v2, 1]]);
      await expectLedger(w.v1, w.storeA, 1);
      await expectLedger(w.v2, w.storeA, 2);
    });

    it("renglón con todo faltante no reingresa ni crea fila", async () => {
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1, 2)]), w.owner, { offline: meta() });
      await ds.cancelSale(rec.id, w.owner, "No salió", true);
      expect(await available(w.v1, w.storeA)).toBeNull();
      expect(await testPrisma.movement.count()).toBe(0);
    });

    it("anular una venta en revisión la deja rejected", async () => {
      await setStock(w.v1, w.storeA, 1);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1, 2)]), w.owner, { offline: meta() });
      const cancelled = await ds.cancelSale(rec.id, w.owner, "Rechazada", false);

      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.reviewStatus).toBe("rejected");
      const row = await testPrisma.sale.findUniqueOrThrow({ where: { id: rec.id } });
      expect(row.reviewedById).toBe(w.owner);
      expect(row.reviewedAt).not.toBeNull();
      expect(await available(w.v1, w.storeA)).toBe(0);
    });

    it("anular una venta sin revisión deja reviewStatus en null", async () => {
      await setStock(w.v1, w.storeA, 3);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1)]), w.owner, { offline: meta() });
      const cancelled = await ds.cancelSale(rec.id, w.owner, "Error", true);
      expect(cancelled.reviewStatus).toBeNull();
      const row = await testPrisma.sale.findUniqueOrThrow({ where: { id: rec.id } });
      expect(row.reviewedById).toBeNull();
      expect(await available(w.v1, w.storeA)).toBe(3);
    });

    it("anular una venta ya aprobada no cambia su revisión", async () => {
      await setStock(w.v1, w.storeA, 1);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1, 2)]), w.owner, { offline: meta() });
      await testPrisma.sale.update({ where: { id: rec.id }, data: { reviewStatus: "approved" } });
      const cancelled = await ds.cancelSale(rec.id, w.owner, "Después", true);
      expect(cancelled.reviewStatus).toBe("approved");
      expect(await available(w.v1, w.storeA)).toBe(1);
    });
  });
});

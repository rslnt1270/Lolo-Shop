import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { getTestDatabaseUrl } from "../../../test/db/guard";
import { resetDb } from "../../../test/db/reset";
import { PrismaSalesDataSource } from "../prisma-sales-source";
import { PrismaDataSource } from "../prisma-source";
import { InsufficientStockError, SaleRequestConflictError, SalesRuleError } from "../errors";
import type { NewSaleInput, PaymentMethod } from "@/lib/domain/sale";

// Dos clientes con su propio pool, como dos funciones de Vercel atendiendo dos cajas.
const url = getTestDatabaseUrl() ?? "postgresql://invalid:invalid@127.0.0.1:1/none";
const cajaA = new PrismaClient({ datasources: { db: { url } } });
const cajaB = new PrismaClient({ datasources: { db: { url } } });
const dsA = new PrismaSalesDataSource(cajaA);
const dsB = new PrismaSalesDataSource(cajaB);
const ds = new PrismaSalesDataSource(testPrisma);

interface World {
  storeA: string;
  storeB: string;
  owner: string;
  collab: string;
  productId: string;
  brandId: string;
  departmentId: string;
  /** Variantes del mismo producto, con ids ordenables. */
  v1: string;
  v2: string;
}

async function seed(): Promise<World> {
  const storeA = (await testPrisma.location.create({ data: { name: "Tienda A" } })).id;
  const storeB = (await testPrisma.location.create({ data: { name: "Tienda B" } })).id;
  const owner = (
    await testPrisma.user.create({ data: { username: "owner", password: "x", role: "owner" } })
  ).id;
  const collab = (
    await testPrisma.user.create({
      data: { username: "colab", password: "x", role: "collaborator", locationId: storeB },
    })
  ).id;
  const brandId = (await testPrisma.brand.create({ data: { name: "Guess", slug: "guess" } })).id;
  const departmentId = (
    await testPrisma.department.create({ data: { slug: "dama", name: "Dama" } })
  ).id;
  const product = await testPrisma.product.create({
    data: {
      title: "Playera",
      brand: "Guess",
      brandId,
      departmentId,
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
    storeB,
    owner,
    collab,
    productId: product.id,
    brandId,
    departmentId,
    v1: "00000000-0000-4000-8000-000000000001",
    v2: "00000000-0000-4000-8000-000000000002",
  };
}

/** Fija el stock sin Movement: es el "inicial" del criterio 5. */
async function setStock(variantId: string, locationId: string, available: number) {
  await testPrisma.inventoryLevel.create({ data: { variantId, locationId, available } });
}

async function available(variantId: string, locationId: string): Promise<number | null> {
  const lvl = await testPrisma.inventoryLevel.findUnique({
    where: { variantId_locationId: { variantId, locationId } },
  });
  return lvl?.available ?? null;
}

/** Criterio 5: available final = inicial + Σ Movement.delta de la variante y tienda. */
async function expectLedger(variantId: string, locationId: string, initial: number) {
  const sum = await testPrisma.movement.aggregate({
    where: { variantId, locationId },
    _sum: { delta: true },
  });
  expect(await available(variantId, locationId)).toBe(initial + (sum._sum.delta ?? 0));
}

function sale(
  locationId: string,
  lines: NewSaleInput["lines"],
  paymentMethod: PaymentMethod = "cash",
  clientRequestId: string = randomUUID(),
): NewSaleInput {
  return { clientRequestId, locationId, channel: "store", paymentMethod, lines };
}

const one = (variantId: string, quantity = 1, unitPrice = 300) => ({ variantId, quantity, unitPrice });

describe.skipIf(!hasTestDb)("PrismaSalesDataSource", () => {
  let w: World;

  beforeEach(async () => {
    await resetDb();
    w = await seed();
  });

  afterAll(async () => {
    await Promise.all([testPrisma.$disconnect(), cajaA.$disconnect(), cajaB.$disconnect()]);
  });

  describe("criterios de concurrencia (ER §3.1)", () => {
    it("1. stock 1, dos ventas en paralelo por usuarios distintos: una gana, la otra InsufficientStockError", async () => {
      await setStock(w.v1, w.storeA, 1);

      const results = await Promise.allSettled([
        dsA.createSale(sale(w.storeA, [one(w.v1)]), w.owner),
        dsB.createSale(sale(w.storeA, [one(w.v1)]), w.collab),
      ]);

      const ok = results.filter((r) => r.status === "fulfilled");
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0].reason).toBeInstanceOf(InsufficientStockError);
      expect(await testPrisma.sale.count()).toBe(1);
      expect(await available(w.v1, w.storeA)).toBe(0);
      expect(await testPrisma.movement.count({ where: { type: "SALE" } })).toBe(1);
      await expectLedger(w.v1, w.storeA, 1);
    });

    it("2. stock 5 en A y 5 en B, 5 ventas en paralelo por tienda: 10 ventas, ambas en 0, sin negativos", async () => {
      await setStock(w.v1, w.storeA, 5);
      await setStock(w.v1, w.storeB, 5);

      const calls = [];
      for (let i = 0; i < 5; i++) {
        calls.push(dsA.createSale(sale(w.storeA, [one(w.v1)]), w.owner));
        calls.push(dsB.createSale(sale(w.storeB, [one(w.v1)]), w.collab));
      }
      const results = await Promise.allSettled(calls);

      expect(results.every((r) => r.status === "fulfilled")).toBe(true);
      expect(await testPrisma.sale.count()).toBe(10);
      expect(await available(w.v1, w.storeA)).toBe(0);
      expect(await available(w.v1, w.storeB)).toBe(0);
      expect(await testPrisma.inventoryLevel.count({ where: { available: { lt: 0 } } })).toBe(0);
      await expectLedger(w.v1, w.storeA, 5);
      await expectLedger(w.v1, w.storeB, 5);
    });

    it("3. tickets de 2 líneas con las mismas variantes en orden inverso, en paralelo: terminan sin deadlock", async () => {
      await setStock(w.v1, w.storeA, 10);
      await setStock(w.v2, w.storeA, 10);

      // 10 pares (20 tickets) para forzar intercalado; con stock 10 caben 10 de 20.
      const calls = [];
      for (let i = 0; i < 10; i++) {
        calls.push(dsA.createSale(sale(w.storeA, [one(w.v1), one(w.v2)]), w.owner));
        calls.push(dsB.createSale(sale(w.storeA, [one(w.v2), one(w.v1)]), w.collab));
      }
      const results = await Promise.allSettled(calls);

      for (const r of results) {
        if (r.status === "rejected") expect(r.reason).toBeInstanceOf(InsufficientStockError);
      }
      const ok = results.filter((r) => r.status === "fulfilled").length;
      expect(ok).toBe(10);
      expect(await available(w.v1, w.storeA)).toBe(0);
      expect(await available(w.v2, w.storeA)).toBe(0);
      await expectLedger(w.v1, w.storeA, 10);
      await expectLedger(w.v2, w.storeA, 10);
    });

    it("4. el mismo clientRequestId dos veces en paralelo: una sola Sale", async () => {
      await setStock(w.v1, w.storeA, 5);
      const input = sale(w.storeA, [one(w.v1)]);

      const [a, b] = await Promise.all([
        dsA.createSale(input, w.owner),
        dsB.createSale(input, w.owner),
      ]);

      expect(a.id).toBe(b.id);
      expect(await testPrisma.sale.count()).toBe(1);
      expect(await testPrisma.movement.count()).toBe(1);
      expect(await available(w.v1, w.storeA)).toBe(4);
      await expectLedger(w.v1, w.storeA, 5);
    });
  });

  describe("idempotencia por clientRequestId", () => {
    it("mismo id y mismos renglones (en otro orden): devuelve la misma venta sin descontar de nuevo", async () => {
      await setStock(w.v1, w.storeA, 5);
      await setStock(w.v2, w.storeA, 5);
      const rid = randomUUID();
      const first = await ds.createSale(sale(w.storeA, [one(w.v1, 1), one(w.v2, 2, 150)], "cash", rid), w.owner);
      const again = await ds.createSale(sale(w.storeA, [one(w.v2, 2, 150), one(w.v1, 1)], "cash", rid), w.owner);

      expect(again.id).toBe(first.id);
      expect(again.number).toBe(first.number);
      expect(await testPrisma.sale.count()).toBe(1);
      expect(await available(w.v1, w.storeA)).toBe(4);
      expect(await available(w.v2, w.storeA)).toBe(3);
    });

    it.each([
      ["otra cantidad", (w: World) => ({ lines: [one(w.v1, 2)] })],
      ["otro precio", (w: World) => ({ lines: [one(w.v1, 1, 250)] })],
      ["otra prenda", (w: World) => ({ lines: [one(w.v2, 1)] })],
      ["renglón de más", (w: World) => ({ lines: [one(w.v1, 1), one(w.v2, 1)] })],
      ["otro método", () => ({ paymentMethod: "card" as const })],
      ["otro canal", () => ({ channel: "whatsapp" as const })],
      ["otra tienda", (w: World) => ({ locationId: w.storeB })],
    ])("mismo id con %s: SaleRequestConflictError con el folio y sin tocar stock", async (_label, patch) => {
      await setStock(w.v1, w.storeA, 5);
      await setStock(w.v2, w.storeA, 5);
      await setStock(w.v1, w.storeB, 5);
      const rid = randomUUID();
      const first = await ds.createSale(sale(w.storeA, [one(w.v1, 1)], "cash", rid), w.owner);

      const err = await ds
        .createSale({ ...sale(w.storeA, [one(w.v1, 1)], "cash", rid), ...patch(w) }, w.owner)
        .catch((e) => e);

      expect(err).toBeInstanceOf(SaleRequestConflictError);
      expect(err.saleNumber).toBe(first.number);
      expect(await testPrisma.sale.count()).toBe(1);
      expect(await available(w.v1, w.storeA)).toBe(4);
      expect(await available(w.v2, w.storeA)).toBe(5);
      expect(await available(w.v1, w.storeB)).toBe(5);
    });

    it("carrera con el mismo id y carritos distintos: una venta y la otra recibe conflicto", async () => {
      await setStock(w.v1, w.storeA, 5);
      const rid = randomUUID();
      const results = await Promise.allSettled([
        dsA.createSale(sale(w.storeA, [one(w.v1, 1)], "cash", rid), w.owner),
        dsB.createSale(sale(w.storeA, [one(w.v1, 2)], "cash", rid), w.owner),
      ]);

      const ok = results.filter((r) => r.status === "fulfilled");
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0].reason).toBeInstanceOf(SaleRequestConflictError);
      expect(await testPrisma.sale.count()).toBe(1);
      await expectLedger(w.v1, w.storeA, 5);
    });
  });

  describe("createSale", () => {
    it("variante sin fila de InventoryLevel en la tienda: InsufficientStockError con available 0 y sin filas nuevas", async () => {
      const err = await ds.createSale(sale(w.storeA, [one(w.v1, 2)]), w.owner).catch((e) => e);

      expect(err).toBeInstanceOf(InsufficientStockError);
      expect(err).toMatchObject({ variantId: w.v1, available: 0, requested: 2 });
      expect(await testPrisma.sale.count()).toBe(0);
      expect(await testPrisma.saleLine.count()).toBe(0);
      expect(await testPrisma.movement.count()).toBe(0);
      expect(await testPrisma.inventoryLevel.count()).toBe(0);
    });

    it("si falla un renglón no descuenta los demás (rollback completo)", async () => {
      await setStock(w.v1, w.storeA, 3);
      await setStock(w.v2, w.storeA, 1);

      const err = await ds
        .createSale(sale(w.storeA, [one(w.v1, 2), one(w.v2, 2)]), w.owner)
        .catch((e) => e);

      expect(err).toBeInstanceOf(InsufficientStockError);
      expect(err).toMatchObject({ variantId: w.v2, available: 1, requested: 2 });
      expect(await available(w.v1, w.storeA)).toBe(3);
      expect(await available(w.v2, w.storeA)).toBe(1);
      expect(await testPrisma.sale.count()).toBe(0);
      expect(await testPrisma.movement.count()).toBe(0);
    });

    it("cash: status paid, Movement SALE -n con saleId y stockCommittedAt no nulo", async () => {
      await setStock(w.v1, w.storeA, 5);

      const rec = await ds.createSale(sale(w.storeA, [one(w.v1, 3, 299.5)], "cash"), w.collab);

      expect(rec.status).toBe("paid");
      expect(rec.total).toBe(898.5);
      expect(rec.lines).toEqual([{ variantId: w.v1, quantity: 3, unitPrice: 299.5 }]);
      expect(rec.createdById).toBe(w.collab);
      expect(rec.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const row = await testPrisma.sale.findUniqueOrThrow({ where: { id: rec.id } });
      expect(row.stockCommittedAt).not.toBeNull();
      const movements = await testPrisma.movement.findMany();
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({
        type: "SALE",
        delta: -3,
        saleId: rec.id,
        userId: w.collab,
        variantId: w.v1,
        locationId: w.storeA,
      });
      expect(await available(w.v1, w.storeA)).toBe(2);
      await expectLedger(w.v1, w.storeA, 5);
    });

    it("spay_transfer nace pending_payment", async () => {
      await setStock(w.v1, w.storeA, 1);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1)], "spay_transfer"), w.owner);
      expect(rec.status).toBe("pending_payment");
    });

    it("copia productId, brandId, departmentId y category del producto al vender", async () => {
      await setStock(w.v1, w.storeA, 1);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1)]), w.owner);

      // Reclasificar después no cambia el renglón.
      await testPrisma.product.update({
        where: { id: w.productId },
        data: { category: "Otra", brandId: null, departmentId: null },
      });

      const line = await testPrisma.saleLine.findFirstOrThrow({ where: { saleId: rec.id } });
      expect(line).toMatchObject({
        productId: w.productId,
        brandId: w.brandId,
        departmentId: w.departmentId,
        category: "Playeras",
      });
    });

    it("rechaza una variante inactiva sin tocar stock", async () => {
      await setStock(w.v1, w.storeA, 2);
      await testPrisma.variant.update({ where: { id: w.v1 }, data: { isActive: false } });

      await expect(ds.createSale(sale(w.storeA, [one(w.v1)]), w.owner)).rejects.toBeInstanceOf(
        SalesRuleError,
      );
      expect(await available(w.v1, w.storeA)).toBe(2);
      expect(await testPrisma.sale.count()).toBe(0);
    });

    it("rechaza una entrada inválida (cantidad no positiva) sin tocar stock", async () => {
      await setStock(w.v1, w.storeA, 2);
      await expect(
        ds.createSale(sale(w.storeA, [one(w.v1, -1)]), w.owner),
      ).rejects.toBeInstanceOf(SalesRuleError);
      expect(await available(w.v1, w.storeA)).toBe(2);
    });
  });

  describe("confirmPayment", () => {
    it("pending_payment pasa a paid con quién y cuándo", async () => {
      await setStock(w.v1, w.storeA, 1);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1)], "spay_transfer"), w.collab);

      const confirmed = await ds.confirmPayment(rec.id, w.owner, " RASTREO-123 ");

      expect(confirmed.status).toBe("paid");
      const row = await testPrisma.sale.findUniqueOrThrow({ where: { id: rec.id } });
      expect(row.paymentConfirmedById).toBe(w.owner);
      expect(row.paymentConfirmedAt).not.toBeNull();
      expect(row.paymentReference).toBe("RASTREO-123");
    });

    it("sobre una venta paid lanza error", async () => {
      await setStock(w.v1, w.storeA, 1);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1)], "cash"), w.owner);
      await expect(ds.confirmPayment(rec.id, w.owner)).rejects.toBeInstanceOf(SalesRuleError);
    });

    it("sobre una venta inexistente lanza error", async () => {
      await expect(ds.confirmPayment(randomUUID(), w.owner)).rejects.toBeInstanceOf(SalesRuleError);
    });
  });

  describe("cancelSale", () => {
    it("itemsReturned: true reingresa stock con Movement RETURN +n", async () => {
      await setStock(w.v1, w.storeA, 5);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1, 2)], "cash"), w.collab);

      const cancelled = await ds.cancelSale(rec.id, w.owner, "Error de captura", true);

      expect(cancelled.status).toBe("cancelled");
      expect(await available(w.v1, w.storeA)).toBe(5);
      const ret = await testPrisma.movement.findMany({ where: { type: "RETURN" } });
      expect(ret).toHaveLength(1);
      expect(ret[0]).toMatchObject({ delta: 2, saleId: rec.id, userId: w.owner, locationId: w.storeA });
      const row = await testPrisma.sale.findUniqueOrThrow({ where: { id: rec.id } });
      expect(row).toMatchObject({ status: "cancelled", cancelReason: "Error de captura", cancelledById: w.owner });
      expect(row.cancelledAt).not.toBeNull();
      await expectLedger(w.v1, w.storeA, 5);
    });

    it("itemsReturned: false no cambia available", async () => {
      await setStock(w.v1, w.storeA, 5);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1, 2)], "spay_transfer"), w.collab);

      const cancelled = await ds.cancelSale(rec.id, w.owner, "impago", false);

      expect(cancelled.status).toBe("cancelled");
      expect(await available(w.v1, w.storeA)).toBe(3);
      expect(await testPrisma.movement.count({ where: { type: "RETURN" } })).toBe(0);
      const row = await testPrisma.sale.findUniqueOrThrow({ where: { id: rec.id } });
      expect(row).toMatchObject({ status: "cancelled", cancelReason: "impago", cancelledById: w.owner });
      expect(row.cancelledAt).not.toBeNull();
      await expectLedger(w.v1, w.storeA, 5);
    });

    it("exige motivo y no anula dos veces", async () => {
      await setStock(w.v1, w.storeA, 5);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1)]), w.owner);

      await expect(ds.cancelSale(rec.id, w.owner, "   ", true)).rejects.toBeInstanceOf(SalesRuleError);
      await ds.cancelSale(rec.id, w.owner, "Error", true);
      await expect(ds.cancelSale(rec.id, w.owner, "Otra vez", true)).rejects.toBeInstanceOf(
        SalesRuleError,
      );
      expect(await available(w.v1, w.storeA)).toBe(5);
      await expectLedger(w.v1, w.storeA, 5);
    });

    it("dos anulaciones en paralelo reingresan una sola vez", async () => {
      await setStock(w.v1, w.storeA, 5);
      const rec = await ds.createSale(sale(w.storeA, [one(w.v1, 2)]), w.owner);

      const results = await Promise.allSettled([
        dsA.cancelSale(rec.id, w.owner, "Error", true),
        dsB.cancelSale(rec.id, w.owner, "Error", true),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await available(w.v1, w.storeA)).toBe(5);
      expect(await testPrisma.movement.count({ where: { type: "RETURN" } })).toBe(1);
      await expectLedger(w.v1, w.storeA, 5);
    });
  });

  describe("copia de productTypeId en SaleLine", () => {
    async function mkType(slug: string, name: string, sortOrder: number) {
      return testPrisma.productType.create({ data: { slug, name, sortOrder } });
    }

    it("createSale copia productTypeId de Playeras en SaleLine", async () => {
      const t = await mkType("playera", "Playeras", 1);
      await testPrisma.product.update({
        where: { id: w.productId },
        data: { productTypeId: t.id, style: "polo" },
      });
      await setStock(w.v1, w.storeA, 3);
      await ds.createSale(sale(w.storeA, [one(w.v1)]), w.owner);
      const line = await testPrisma.saleLine.findFirstOrThrow({ where: { variantId: w.v1 } });
      expect(line.productTypeId).toBe(t.id);
      expect(line.category).toBe("Playeras");
      // style y audience no se copian: SaleLine no tiene esas columnas.
      expect(Object.keys(line)).not.toContain("style");
      expect(Object.keys(line)).not.toContain("audience");
    });

    it("reclasificar el producto no cambia la copia de la venta", async () => {
      const playera = await mkType("playera", "Playeras", 1);
      const sudadera = await mkType("sudadera", "Sudaderas", 4);
      await testPrisma.product.update({ where: { id: w.productId }, data: { productTypeId: playera.id } });
      await setStock(w.v1, w.storeA, 3);
      await ds.createSale(sale(w.storeA, [one(w.v1)]), w.owner);
      await testPrisma.product.update({
        where: { id: w.productId },
        data: { productTypeId: sudadera.id, category: "Sudaderas" },
      });
      const line = await testPrisma.saleLine.findFirstOrThrow({ where: { variantId: w.v1 } });
      expect(line.productTypeId).toBe(playera.id);
      expect(line.category).toBe("Playeras");
    });

    it("createSale con producto sin tipo guarda SaleLine.productTypeId null", async () => {
      await setStock(w.v1, w.storeA, 3);
      await ds.createSale(sale(w.storeA, [one(w.v1)]), w.owner);
      const line = await testPrisma.saleLine.findFirstOrThrow({ where: { variantId: w.v1 } });
      expect(line.productTypeId).toBeNull();
    });
  });

  describe("venta sin código (búsqueda de productos)", () => {
    it("C22 (db): vender por referencia descuenta la talla", async () => {
      await setStock(w.v1, w.storeA, 3);
      await setStock(w.v2, w.storeA, 2);
      const products = new PrismaDataSource(testPrisma);

      // Se encuentra por tipo, se elige la talla con existencias y se vende sin escanear nada.
      const [hit] = await products.searchProducts("playeras");
      expect(hit.productId).toBe(w.productId);
      const rows = await products.listVariantStockAt(hit.productId, w.storeA);
      const m = rows.find((r) => r.variantId === w.v1)!;
      expect(m.available).toBe(3);

      const rec = await ds.createSale(sale(w.storeA, [one(m.variantId, 2, m.price)]), w.owner);

      expect(rec.lines).toEqual([{ variantId: w.v1, quantity: 2, unitPrice: 300 }]);
      expect(await available(w.v1, w.storeA)).toBe(1);
      expect(await available(w.v2, w.storeA)).toBe(2);
      await expectLedger(w.v1, w.storeA, 3);
    });
  });

  describe("umbral de stock bajo", () => {
    it("lee el AppSetting y vuelve a 2 si no existe", async () => {
      expect(await ds.getLowStockThreshold()).toBe(2);
      await ds.setLowStockThreshold(7, w.owner);
      expect(await ds.getLowStockThreshold()).toBe(7);
      const row = await testPrisma.appSetting.findUniqueOrThrow({ where: { key: "lowStockThreshold" } });
      expect(row).toMatchObject({ value: 7, updatedById: w.owner });
    });

    it("rechaza valores fuera de 0–99 o no enteros", async () => {
      for (const n of [-1, 100, 2.5, Number.NaN]) {
        await expect(ds.setLowStockThreshold(n, w.owner)).rejects.toBeInstanceOf(SalesRuleError);
      }
      await ds.setLowStockThreshold(0, w.owner);
      expect(await ds.getLowStockThreshold()).toBe(0);
    });
  });
});

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { getTestDatabaseUrl } from "../../../test/db/guard";
import { resetDb } from "../../../test/db/reset";
import { PrismaDataSource } from "../prisma-source";
import { InsufficientStockError } from "../errors";

// Dos clientes con su propio pool, como dos funciones atendiendo dos tabletas.
const url = getTestDatabaseUrl() ?? "postgresql://invalid:invalid@127.0.0.1:1/none";
const clientA = new PrismaClient({ datasources: { db: { url } } });
const clientB = new PrismaClient({ datasources: { db: { url } } });
const dsA = new PrismaDataSource(clientA);
const dsB = new PrismaDataSource(clientB);
const ds = new PrismaDataSource(testPrisma);

interface World {
  store: string;
  user: string;
  v1: string;
  v2: string;
}

async function seed(): Promise<World> {
  const store = (await testPrisma.location.create({ data: { name: "Tienda A" } })).id;
  const user = (await testPrisma.user.create({ data: { username: "owner", password: "x", role: "owner" } })).id;
  const brandId = (await testPrisma.brand.create({ data: { name: "Guess", slug: "guess" } })).id;
  const departmentId = (await testPrisma.department.create({ data: { slug: "dama", name: "Dama" } })).id;
  await testPrisma.product.create({
    data: {
      title: "Playera",
      brand: "Guess",
      brandId,
      departmentId,
      category: "Playeras",
      variants: {
        create: [
          { id: "00000000-0000-4000-8000-0000000000a1", title: "M", sku: "SKU-M", price: 300 },
          { id: "00000000-0000-4000-8000-0000000000a2", title: "L", sku: "SKU-L", price: 320 },
        ],
      },
    },
  });
  return { store, user, v1: "00000000-0000-4000-8000-0000000000a1", v2: "00000000-0000-4000-8000-0000000000a2" };
}

async function setStock(variantId: string, locationId: string, available: number) {
  await testPrisma.inventoryLevel.create({ data: { variantId, locationId, available } });
}

async function available(variantId: string, locationId: string): Promise<number | null> {
  const lvl = await testPrisma.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId, locationId } } });
  return lvl?.available ?? null;
}

describe.skipIf(!hasTestDb)("PrismaDataSource.recordStockMovement", () => {
  let w: World;

  beforeEach(async () => {
    await resetDb();
    w = await seed();
  });

  afterAll(async () => {
    await clientA.$disconnect();
    await clientB.$disconnect();
  });

  const move = (
    type: "RESTOCK" | "DAMAGE" | "ADJUSTMENT",
    delta: number,
    over: Partial<{ variantId: string; notes: string | null; requestId: string }> = {},
  ) => ({
    variantId: over.variantId ?? w.v1,
    locationId: w.store,
    type,
    delta,
    notes: over.notes === undefined ? null : over.notes,
    requestId: over.requestId ?? randomUUID(),
    userId: w.user,
  });

  it("stock 1 y merma de 2: InsufficientStockError, stock 1 y 0 Movement", async () => {
    await setStock(w.v1, w.store, 1);
    await expect(ds.recordStockMovement(move("DAMAGE", -2, { notes: "Manchada" }))).rejects.toBeInstanceOf(
      InsufficientStockError,
    );
    expect(await available(w.v1, w.store)).toBe(1);
    expect(await testPrisma.movement.count()).toBe(0);
  });

  it("dos mermas de 1 en paralelo sobre stock 1: exactamente una resuelve", async () => {
    await setStock(w.v1, w.store, 1);
    const results = await Promise.allSettled([
      dsA.recordStockMovement(move("DAMAGE", -1, { notes: "Manchada" })),
      dsB.recordStockMovement(move("DAMAGE", -1, { notes: "Rota" })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(InsufficientStockError);
    expect(await available(w.v1, w.store)).toBe(0);
    expect(await testPrisma.movement.count()).toBe(1);
  });

  it("merma sobre variante sin fila: error y no se crea fila", async () => {
    const before = await testPrisma.inventoryLevel.count();
    const err = await ds.recordStockMovement(move("DAMAGE", -1, { notes: "Manchada" })).catch((e) => e);
    expect(err).toBeInstanceOf(InsufficientStockError);
    expect(err.available).toBe(0);
    expect(await testPrisma.inventoryLevel.count()).toBe(before);
    expect(await testPrisma.movement.count()).toBe(0);
  });

  it("mismo requestId dos veces en paralelo: un Movement y una respuesta replayed", async () => {
    await setStock(w.v1, w.store, 1);
    const requestId = randomUUID();
    const [a, b] = await Promise.all([
      dsA.recordStockMovement(move("RESTOCK", 2, { requestId })),
      dsB.recordStockMovement(move("RESTOCK", 2, { requestId })),
    ]);
    expect(await testPrisma.movement.count({ where: { requestId } })).toBe(1);
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
    expect(a.available).toBe(3);
    expect(b.available).toBe(3);
    expect(await available(w.v1, w.store)).toBe(3);
  });

  it("merma con el mismo requestId en paralelo y stock exacto: un ok, un replayed, nunca INSUFFICIENT", async () => {
    await setStock(w.v1, w.store, 1);
    const requestId = randomUUID();
    const results = await Promise.allSettled([
      dsA.recordStockMovement(move("DAMAGE", -1, { requestId, notes: "Manchada" })),
      dsB.recordStockMovement(move("DAMAGE", -1, { requestId, notes: "Manchada" })),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const vals = results.map((r) => (r as PromiseFulfilledResult<{ available: number; replayed: boolean }>).value);
    expect(vals.map((v) => v.replayed).sort()).toEqual([false, true]);
    expect(await available(w.v1, w.store)).toBe(0);
    expect(await testPrisma.movement.count({ where: { requestId } })).toBe(1);
  });

  it("mismo requestId en serie: la segunda es replayed y no cambia el stock", async () => {
    const requestId = randomUUID();
    expect(await ds.recordStockMovement(move("RESTOCK", 2, { requestId }))).toEqual({ available: 2, replayed: false });
    expect(await ds.recordStockMovement(move("RESTOCK", 2, { requestId }))).toEqual({ available: 2, replayed: true });
    expect(await testPrisma.movement.count()).toBe(1);
  });

  it("cada tipo queda con su MovementType, delta, nota y usuario", async () => {
    await setStock(w.v1, w.store, 5);
    await ds.recordStockMovement(move("RESTOCK", 3));
    await ds.recordStockMovement(move("DAMAGE", -1, { notes: "Manchada" }));
    await ds.recordStockMovement(move("ADJUSTMENT", -2, { notes: "Conteo" }));
    const rows = await testPrisma.movement.findMany({ orderBy: { timestamp: "asc" } });
    expect(rows.map((r) => [r.type, r.delta, r.notes, r.userId])).toEqual([
      ["RESTOCK", 3, null, w.user],
      ["DAMAGE", -1, "Manchada", w.user],
      ["ADJUSTMENT", -2, "Conteo", w.user],
    ]);
  });

  it("entrada sobre variante sin fila la crea", async () => {
    expect(await ds.recordStockMovement(move("RESTOCK", 4, { variantId: w.v2 }))).toEqual({ available: 4, replayed: false });
    expect(await available(w.v2, w.store)).toBe(4);
  });

  it("variante inexistente lanza StockTargetNotFoundError", async () => {
    await expect(
      ds.recordStockMovement(move("RESTOCK", 1, { variantId: "00000000-0000-4000-8000-0000000000ff" })),
    ).rejects.toMatchObject({ name: "StockTargetNotFoundError" });
  });

  it("tras una secuencia mixta, available = inicial + Σ delta", async () => {
    await setStock(w.v1, w.store, 10);
    await ds.recordStockMovement(move("RESTOCK", 5));
    await ds.recordStockMovement(move("DAMAGE", -3, { notes: "Manchada" }));
    await ds.recordStockMovement(move("ADJUSTMENT", 2, { notes: "Conteo" }));
    await expect(ds.recordStockMovement(move("DAMAGE", -99, { notes: "Imposible" }))).rejects.toBeInstanceOf(
      InsufficientStockError,
    );
    await ds.recordStockMovement(move("ADJUSTMENT", -4, { notes: "Conteo" }));
    const sum = await testPrisma.movement.aggregate({ where: { variantId: w.v1, locationId: w.store }, _sum: { delta: true } });
    expect(await available(w.v1, w.store)).toBe(10 + (sum._sum.delta ?? 0));
    expect(await available(w.v1, w.store)).toBe(10);
  });
});

describe.skipIf(!hasTestDb)("PrismaDataSource.getStockAt / listVariantStockAt", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("getStockAt devuelve available de la talla en la tienda y sold=true solo si hay SaleLine", async () => {
    const w = await seed();
    const storeB = (await testPrisma.location.create({ data: { name: "Tienda B" } })).id;
    await setStock(w.v1, w.store, 3);
    expect(await ds.getStockAt(w.v1, w.store)).toEqual({ available: 3, sold: false });
    expect(await ds.getStockAt(w.v1, storeB)).toEqual({ available: 0, sold: false });
    expect(await testPrisma.inventoryLevel.count()).toBe(1); // sin upsert

    const product = await testPrisma.product.findFirstOrThrow({ where: { variants: { some: { id: w.v1 } } } });
    await testPrisma.sale.create({
      data: {
        clientRequestId: randomUUID(),
        channel: "store",
        status: "paid",
        paymentMethod: "cash",
        locationId: w.store,
        total: 300,
        businessDate: new Date(),
        createdById: w.user,
        lines: { create: [{ variantId: w.v1, productId: product.id, category: "Playeras", quantity: 1, unitPrice: 300 }] },
      },
    });
    await testPrisma.inventoryLevel.update({
      where: { variantId_locationId: { variantId: w.v1, locationId: w.store } },
      data: { available: 2 },
    });
    expect(await ds.getStockAt(w.v1, w.store)).toEqual({ available: 2, sold: true });
    expect(await ds.getStockAt(w.v2, w.store)).toEqual({ available: 0, sold: false });
  });

  it("listVariantStockAt lista las tallas activas del producto ordenadas por talla, 0 sin fila", async () => {
    const w = await seed();
    await setStock(w.v1, w.store, 4);
    await testPrisma.variant.update({ where: { id: w.v1 }, data: { size: "M" } });
    await testPrisma.variant.update({ where: { id: w.v2 }, data: { size: "L" } });
    const product = await testPrisma.product.findFirstOrThrow();
    const rows = await ds.listVariantStockAt(product.id, w.store);
    expect(rows.map((r) => [r.size, r.available])).toEqual([["M", 4], ["L", 0]]);
    expect(rows.find((r) => r.size === "M")).toMatchObject({ variantId: w.v1, sku: "SKU-M", price: 300 });
  });
});

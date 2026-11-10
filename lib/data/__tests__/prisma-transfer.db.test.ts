import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { getTestDatabaseUrl } from "../../../test/db/guard";
import { resetDb } from "../../../test/db/reset";
import { PrismaDataSource } from "../prisma-source";
import { PrismaSalesDataSource } from "../prisma-sales-source";
import { InsufficientStockError } from "../errors";

// Dos clientes con su propio pool, como dos funciones atendiendo dos tabletas.
const url = getTestDatabaseUrl() ?? "postgresql://invalid:invalid@127.0.0.1:1/none";
const clientA = new PrismaClient({ datasources: { db: { url } } });
const clientB = new PrismaClient({ datasources: { db: { url } } });
const dsA = new PrismaDataSource(clientA);
const dsB = new PrismaDataSource(clientB);
const salesB = new PrismaSalesDataSource(clientB);
const ds = new PrismaDataSource(testPrisma);

interface World {
  lomas: string;
  club: string;
  user: string;
  v1: string;
}

async function seed(): Promise<World> {
  const lomas = (await testPrisma.location.create({ data: { name: "Lomas" } })).id;
  const club = (await testPrisma.location.create({ data: { name: "ClubAlva" } })).id;
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
        create: [{ id: "00000000-0000-4000-8000-0000000000b1", title: "M", sku: "SKU-M", price: 300 }],
      },
    },
  });
  return { lomas, club, user, v1: "00000000-0000-4000-8000-0000000000b1" };
}

async function setStock(variantId: string, locationId: string, available: number) {
  await testPrisma.inventoryLevel.create({ data: { variantId, locationId, available } });
}

async function available(variantId: string, locationId: string): Promise<number | null> {
  const lvl = await testPrisma.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId, locationId } } });
  return lvl?.available ?? null;
}

describe.skipIf(!hasTestDb)("PrismaDataSource.transferStock", () => {
  let w: World;

  beforeEach(async () => {
    await resetDb();
    w = await seed();
  });

  afterAll(async () => {
    await clientA.$disconnect();
    await clientB.$disconnect();
  });

  const transfer = (from: string, to: string, quantity: number, over: { requestId?: string; note?: string | null } = {}) => ({
    variantId: w.v1,
    fromLocationId: from,
    toLocationId: to,
    quantity,
    requestId: over.requestId ?? randomUUID(),
    note: over.note === undefined ? null : over.note,
    userId: w.user,
  });

  it("mueve piezas, crea la fila destino y escribe dos Movement TRANSFER con la misma nota", async () => {
    await setStock(w.v1, w.lomas, 5);
    const rid = randomUUID();
    const res = await ds.transferStock(transfer(w.lomas, w.club, 2, { requestId: rid, note: "Reposición" }));
    expect(res).toEqual({ available: 3, replayed: false });
    expect(await available(w.v1, w.lomas)).toBe(3);
    expect(await available(w.v1, w.club)).toBe(2);
    const moves = await testPrisma.movement.findMany({ orderBy: { delta: "asc" } });
    expect(moves.map((m) => [m.type, m.delta, m.requestId, m.locationId, m.notes])).toEqual([
      ["TRANSFER", -2, `${rid}:out`, w.lomas, "Reposición"],
      ["TRANSFER", 2, `${rid}:in`, w.club, "Reposición"],
    ]);
  });

  it("sin stock suficiente: InsufficientStockError, nada cambia y 0 Movement", async () => {
    await setStock(w.v1, w.lomas, 1);
    await expect(ds.transferStock(transfer(w.lomas, w.club, 2))).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await available(w.v1, w.lomas)).toBe(1);
    expect(await available(w.v1, w.club)).toBeNull();
    expect(await testPrisma.movement.count()).toBe(0);
  });

  it("la suma del stock de las dos tiendas no cambia", async () => {
    await setStock(w.v1, w.lomas, 4);
    await setStock(w.v1, w.club, 3);
    await ds.transferStock(transfer(w.lomas, w.club, 3));
    expect((await available(w.v1, w.lomas))! + (await available(w.v1, w.club))!).toBe(7);
  });

  it("stock 1: traspaso y venta de 1 en paralelo, exactamente una pasa y nada queda negativo", async () => {
    await setStock(w.v1, w.lomas, 1);
    const results = await Promise.allSettled([
      dsA.transferStock(transfer(w.lomas, w.club, 1)),
      salesB.createSale(
        {
          clientRequestId: randomUUID(),
          locationId: w.lomas,
          channel: "store",
          paymentMethod: "cash",
          lines: [{ variantId: w.v1, quantity: 1, unitPrice: 300 }],
        },
        w.user,
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(InsufficientStockError);
    expect(await available(w.v1, w.lomas)).toBe(0);
    const transfers = await testPrisma.movement.count({ where: { type: "TRANSFER" } });
    if (results[0].status === "fulfilled") {
      // Ganó el traspaso: la pieza está en ClubAlva y hay el par de Movement.
      expect(await available(w.v1, w.club)).toBe(1);
      expect(transfers).toBe(2);
    } else {
      // Ganó la venta: nada llegó a ClubAlva y no hay TRANSFER.
      expect((await available(w.v1, w.club)) ?? 0).toBe(0);
      expect(transfers).toBe(0);
    }
  });

  it("dos traspasos opuestos en paralelo terminan los dos (sin interbloqueo)", async () => {
    await setStock(w.v1, w.lomas, 50);
    await setStock(w.v1, w.club, 50);
    for (let round = 0; round < 15; round++) {
      const results = await Promise.all([
        dsA.transferStock(transfer(w.lomas, w.club, 1)),
        dsB.transferStock(transfer(w.club, w.lomas, 1)),
      ]);
      expect(results.every((r) => !r.replayed)).toBe(true);
    }
    expect((await available(w.v1, w.lomas))! + (await available(w.v1, w.club))!).toBe(100);
    expect(await testPrisma.movement.count()).toBe(60);
  });

  it("mismo requestId dos veces: 2 Movement en total y la segunda replayed", async () => {
    await setStock(w.v1, w.lomas, 5);
    const rid = randomUUID();
    const first = await ds.transferStock(transfer(w.lomas, w.club, 2, { requestId: rid }));
    const second = await ds.transferStock(transfer(w.lomas, w.club, 2, { requestId: rid }));
    expect(first.replayed).toBe(false);
    expect(second).toEqual({ available: 3, replayed: true });
    expect(await testPrisma.movement.count()).toBe(2);
    expect(await available(w.v1, w.club)).toBe(2);
  });

  it("mismo requestId en paralelo: uno aplica y el otro es replayed, sin INSUFFICIENT", async () => {
    await setStock(w.v1, w.lomas, 2);
    const rid = randomUUID();
    const results = await Promise.all([
      dsA.transferStock(transfer(w.lomas, w.club, 2, { requestId: rid })),
      dsB.transferStock(transfer(w.lomas, w.club, 2, { requestId: rid })),
    ]);
    expect(results.filter((r) => r.replayed)).toHaveLength(1);
    expect(await testPrisma.movement.count()).toBe(2);
    expect(await available(w.v1, w.lomas)).toBe(0);
    expect(await available(w.v1, w.club)).toBe(2);
  });
});

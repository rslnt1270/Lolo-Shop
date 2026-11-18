import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { getTestDatabaseUrl } from "../../../test/db/guard";
import { resetDb } from "../../../test/db/reset";
import { PrismaDataSource } from "../prisma-source";
import { InsufficientStockError, StockTargetNotFoundError } from "../errors";
import type { TransferStockData } from "../source";

// Dos clientes con su propio pool, como dos tabletas traspasando a la vez.
const url = getTestDatabaseUrl() ?? "postgresql://invalid:invalid@127.0.0.1:1/none";
const clientA = new PrismaClient({ datasources: { db: { url } } });
const clientB = new PrismaClient({ datasources: { db: { url } } });
const dsA = new PrismaDataSource(clientA);
const dsB = new PrismaDataSource(clientB);
const ds = new PrismaDataSource(testPrisma);

const V1 = "00000000-0000-4000-8000-0000000000b1";

interface World {
  alva: string;
  lomas: string;
  user: string;
}

async function seed(): Promise<World> {
  const alva = (await testPrisma.location.create({ data: { name: "Club Alva" } })).id;
  const lomas = (await testPrisma.location.create({ data: { name: "Lomas" } })).id;
  const user = (await testPrisma.user.create({ data: { username: "colab", password: "x", role: "collaborator" } })).id;
  const brandId = (await testPrisma.brand.create({ data: { name: "Guess", slug: "guess" } })).id;
  const departmentId = (await testPrisma.department.create({ data: { slug: "dama", name: "Dama" } })).id;
  await testPrisma.product.create({
    data: {
      title: "Playera",
      brand: "Guess",
      brandId,
      departmentId,
      category: "Playeras",
      variants: { create: [{ id: V1, title: "M", sku: "SKU-T-M", price: 300 }] },
    },
  });
  return { alva, lomas, user };
}

async function setStock(locationId: string, available: number) {
  await testPrisma.inventoryLevel.create({ data: { variantId: V1, locationId, available } });
}

async function available(locationId: string): Promise<number | null> {
  const lvl = await testPrisma.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId: V1, locationId } } });
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

  const transfer = (over: Partial<TransferStockData> = {}): TransferStockData => ({
    variantId: V1,
    fromLocationId: w.alva,
    toLocationId: w.lomas,
    quantity: 2,
    notes: null,
    requestId: randomUUID(),
    userId: w.user,
    ...over,
  });

  it("mueve las piezas y deja una salida y una entrada TRANSFER con usuario, sufijos y notas", async () => {
    await setStock(w.alva, 3);
    const requestId = randomUUID();
    const res = await ds.transferStock(transfer({ requestId }));
    expect(res).toEqual({ fromAvailable: 1, toAvailable: 2, fromName: "Club Alva", toName: "Lomas", replayed: false });
    expect(await available(w.alva)).toBe(1);
    expect(await available(w.lomas)).toBe(2);
    const rows = await testPrisma.movement.findMany({ orderBy: { delta: "asc" } });
    expect(rows.map((r) => [r.type, r.delta, r.locationId, r.userId, r.requestId, r.notes])).toEqual([
      ["TRANSFER", -2, w.alva, w.user, `${requestId}:out`, "A Lomas"],
      ["TRANSFER", 2, w.lomas, w.user, `${requestId}:in`, "De Club Alva"],
    ]);
  });

  it("con motivo, las notas lo agregan tras dos puntos", async () => {
    await setStock(w.alva, 3);
    await ds.transferStock(transfer({ notes: "Alta en tienda equivocada" }));
    const rows = await testPrisma.movement.findMany({ orderBy: { delta: "asc" } });
    expect(rows.map((r) => r.notes)).toEqual([
      "A Lomas: Alta en tienda equivocada",
      "De Club Alva: Alta en tienda equivocada",
    ]);
  });

  it("con destino que ya tiene fila, la incrementa", async () => {
    await setStock(w.alva, 3);
    await setStock(w.lomas, 4);
    const res = await ds.transferStock(transfer({ quantity: 3 }));
    expect([res.fromAvailable, res.toAvailable]).toEqual([0, 7]);
    expect(await available(w.alva)).toBe(0);
    expect(await available(w.lomas)).toBe(7);
  });

  it("faltante: InsufficientStockError con available 1, sin Movement y destino igual", async () => {
    await setStock(w.alva, 1);
    const err = await ds.transferStock(transfer({ quantity: 2 })).catch((e) => e);
    expect(err).toBeInstanceOf(InsufficientStockError);
    expect(err).toMatchObject({ variantId: V1, available: 1, requested: 2 });
    expect(await available(w.alva)).toBe(1);
    expect(await available(w.lomas)).toBeNull();
    expect(await testPrisma.movement.count()).toBe(0);
  });

  it("sin fila en el origen: InsufficientStockError con available 0 y no crea filas", async () => {
    const err = await ds.transferStock(transfer({ quantity: 1 })).catch((e) => e);
    expect(err).toBeInstanceOf(InsufficientStockError);
    expect(err.available).toBe(0);
    expect(await testPrisma.inventoryLevel.count()).toBe(0);
    expect(await testPrisma.movement.count()).toBe(0);
  });

  it("mismo requestId dos veces en serie: la segunda es replayed con las existencias actuales", async () => {
    await setStock(w.alva, 3);
    const requestId = randomUUID();
    expect((await ds.transferStock(transfer({ requestId }))).replayed).toBe(false);
    expect(await ds.transferStock(transfer({ requestId }))).toEqual({
      fromAvailable: 1,
      toAvailable: 2,
      fromName: "Club Alva",
      toName: "Lomas",
      replayed: true,
    });
    expect(await available(w.alva)).toBe(1);
    expect(await available(w.lomas)).toBe(2);
    expect(await testPrisma.movement.count()).toBe(2);
  });

  it("mismo requestId dos veces en paralelo con stock exacto: un ok y un replayed, nunca INSUFFICIENT", async () => {
    await setStock(w.alva, 2);
    const requestId = randomUUID();
    const results = await Promise.allSettled([
      dsA.transferStock(transfer({ requestId })),
      dsB.transferStock(transfer({ requestId })),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const vals = results.map((r) => (r as PromiseFulfilledResult<{ replayed: boolean; fromAvailable: number; toAvailable: number }>).value);
    expect(vals.map((v) => v.replayed).sort()).toEqual([false, true]);
    expect(vals.every((v) => v.fromAvailable === 0 && v.toAvailable === 2)).toBe(true);
    expect(await available(w.alva)).toBe(0);
    expect(await available(w.lomas)).toBe(2);
    expect(await testPrisma.movement.count()).toBe(2);
  });

  it("dos traspasos simultáneos de la última pieza con requestId distintos: exactamente uno gana", async () => {
    await setStock(w.alva, 1);
    const results = await Promise.allSettled([
      dsA.transferStock(transfer({ quantity: 1 })),
      dsB.transferStock(transfer({ quantity: 1 })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(InsufficientStockError);
    expect(rejected.reason.available).toBe(0);
    expect(await available(w.alva)).toBe(0);
    expect(await available(w.lomas)).toBe(1);
    expect(await testPrisma.movement.count()).toBe(2);
    expect((await testPrisma.movement.aggregate({ _sum: { delta: true } }))._sum.delta).toBe(0);
  });

  it("destino inexistente: StockTargetNotFoundError y nada escrito", async () => {
    await setStock(w.alva, 3);
    const err = await ds
      .transferStock(transfer({ toLocationId: "00000000-0000-4000-8000-0000000000ff" }))
      .catch((e) => e);
    expect(err).toBeInstanceOf(StockTargetNotFoundError);
    expect(await available(w.alva)).toBe(3);
    expect(await testPrisma.inventoryLevel.count()).toBe(1);
    expect(await testPrisma.movement.count()).toBe(0);
  });

  it("origen o talla inexistente: StockTargetNotFoundError", async () => {
    await expect(
      ds.transferStock(transfer({ fromLocationId: "00000000-0000-4000-8000-0000000000fe" })),
    ).rejects.toBeInstanceOf(StockTargetNotFoundError);
    await expect(
      ds.transferStock(transfer({ variantId: "00000000-0000-4000-8000-0000000000fd" })),
    ).rejects.toBeInstanceOf(StockTargetNotFoundError);
    expect(await testPrisma.movement.count()).toBe(0);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { resetDb } from "../../../test/db/reset";
import { PrismaDataSource } from "../prisma-source";
import { MAX_SNAPSHOT_VARIANTS } from "../source";

const ds = new PrismaDataSource(testPrisma);

const V = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;

let storeA: string;
let storeB: string;

async function seed() {
  storeA = (await testPrisma.location.create({ data: { name: "Tienda A" } })).id;
  storeB = (await testPrisma.location.create({ data: { name: "Tienda B" } })).id;
  const playera = await testPrisma.product.create({
    data: {
      title: "Playera",
      brand: "Guess",
      category: "Playeras",
      variants: {
        create: [
          { id: V(1), title: "M", sku: "SKU-M", barcode: "7501234567890", size: "M", price: 300 },
          { id: V(2), title: "L", sku: "SKU-L", size: "L", price: 320 },
          // Talla dada de baja: no va en la copia.
          { id: V(3), title: "XL", sku: "SKU-XL", size: "XL", price: 320, isActive: false },
          // Sin fila de inventario en ninguna tienda: no va en la copia.
          { id: V(4), title: "S", sku: "SKU-S", size: "S", price: 300 },
        ],
      },
    },
  });
  // Producto dado de baja: no va en la copia.
  await testPrisma.product.create({
    data: {
      title: "Sudadera",
      brand: "Guess",
      category: "Sudaderas",
      isActive: false,
      variants: { create: [{ id: V(5), title: "M", sku: "SUD-M", size: "M", price: 500 }] },
    },
  });
  for (const [variantId, locationId, available] of [
    [V(1), storeA, 3],
    [V(2), storeA, 0],
    [V(3), storeA, 2],
    [V(5), storeA, 4],
    [V(1), storeB, 9],
    [V(2), storeB, 7],
  ] as const) {
    await testPrisma.inventoryLevel.create({ data: { variantId, locationId, available } });
  }
  return playera.id;
}

describe.skipIf(!hasTestDb)("PrismaDataSource.getOfflineSnapshot", () => {
  let playeraId: string;

  beforeEach(async () => {
    await resetDb();
    playeraId = await seed();
  });

  it("la copia trae solo la tienda pedida, activos y con 0 piezas", async () => {
    const before = Date.now();
    const snap = await ds.getOfflineSnapshot(storeA);
    expect(snap.locationId).toBe(storeA);
    const at = new Date(snap.generatedAt).getTime();
    expect(at).toBeGreaterThanOrEqual(before - 1000);
    expect(at).toBeLessThanOrEqual(Date.now() + 1000);
    expect(snap.variants).toEqual([
      {
        variantId: V(1),
        productId: playeraId,
        barcode: "7501234567890",
        sku: "SKU-M",
        productTitle: "Playera",
        variantTitle: "M",
        size: "M",
        price: 300,
        available: 3,
      },
      {
        variantId: V(2),
        productId: playeraId,
        barcode: null,
        sku: "SKU-L",
        productTitle: "Playera",
        variantTitle: "L",
        size: "L",
        price: 320,
        available: 0,
      },
    ]);
  });

  it("la copia de la otra tienda solo trae sus existencias", async () => {
    const snap = await ds.getOfflineSnapshot(storeB);
    expect(snap.variants.map((v) => [v.variantId, v.available])).toEqual([
      [V(1), 9],
      [V(2), 7],
    ]);
  });

  it("la copia excluye fusionados", async () => {
    const target = await testPrisma.product.create({
      data: {
        title: "Playera destino",
        brand: "Guess",
        category: "Playeras",
        variants: { create: [{ id: V(6), title: "M", sku: "DEST-M", size: "M", price: 300 }] },
      },
    });
    await testPrisma.inventoryLevel.create({ data: { variantId: V(6), locationId: storeA, available: 1 } });
    // Origen unido al destino pero aún marcado activo: la falta de mergedIntoId es lo que manda.
    await testPrisma.product.update({ where: { id: playeraId }, data: { mergedIntoId: target.id } });
    const snap = await ds.getOfflineSnapshot(storeA);
    expect(snap.variants.map((v) => v.variantId)).toEqual([V(6)]);
  });

  it("tienda sin inventario: copia vacía", async () => {
    const empty = (await testPrisma.location.create({ data: { name: "Bodega" } })).id;
    expect((await ds.getOfflineSnapshot(empty)).variants).toEqual([]);
  });

  it("MAX_SNAPSHOT_VARIANTS es 20 000", () => {
    expect(MAX_SNAPSHOT_VARIANTS).toBe(20_000);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { resetDb } from "../../../test/db/reset";

vi.mock("@/lib/prisma", async () => ({ default: (await import("../../../test/db/setup")).testPrisma }));
vi.mock("../../prisma", async () => ({ default: (await import("../../../test/db/setup")).testPrisma }));

import { PrismaDataSource } from "../prisma-source";
import { FixtureDataSource } from "../fixture-source";
import { getPublicCatalog } from "../public-projection";

/** Claves de un valor, recursivo: los arreglos aportan las claves de sus elementos con el índice quitado. */
function keyShape(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v) => keyShape(v, `${path}[]`));
  if (value && typeof value === "object") {
    return Object.keys(value).sort().flatMap((k) => [`${path}.${k}`, ...keyShape((value as Record<string, unknown>)[k], `${path}.${k}`)]);
  }
  return [];
}
const uniqueShape = (v: unknown) => [...new Set(keyShape(v))].sort();

const FRONT = "https://example.invalid/f.jpg";
const BACK = "https://example.invalid/b.jpg";

describe.skipIf(!hasTestDb)("contrato público: Prisma y Fixture devuelven la misma forma", () => {
  let storeId: string;
  let whId: string;

  beforeEach(async () => {
    await resetDb();
    storeId = (await testPrisma.location.create({ data: { name: "Tienda Contrato", type: "store" } })).id;
    whId = (await testPrisma.location.create({ data: { name: "Bodega Contrato", type: "warehouse" } })).id;
  });

  async function seedPrisma(
    title: string,
    code: string,
    createdAt: Date,
    over: Record<string, unknown> = {},
    sizes: { size: string; price: number; stock: number }[] = [{ size: "M", price: 350, stock: 2 }],
  ) {
    return testPrisma.product.create({
      data: {
        title, brand: "Marca", category: "Polos", publicCode: code, imageUrl: FRONT, backImageUrl: BACK, createdAt,
        ...over,
        variants: {
          create: sizes.map((s) => ({
            title: s.size, size: s.size, sku: `SKU-${code}-${s.size}`, barcode: `${code}${s.size}`.replace(/\W/g, ""), price: s.price,
            inventory: { create: [{ locationId: storeId, available: s.stock }, { locationId: whId, available: 9 }] },
          })),
        },
      },
    });
  }

  async function seedFixture(code: string, sizes: { size: string; price: number; stock: number }[]) {
    const fx = new FixtureDataSource();
    const store = (await fx.getLocations()).find((l) => l.type === "store")!;
    await fx.createProduct({
      title: "Uno", brand: "Marca", brandId: "b", departmentId: "d", category: "Polos", publicCode: code,
      imageUrl: FRONT, backImageUrl: BACK, locationId: store.id, userId: "u",
      variants: sizes.map((s) => ({ size: s.size, price: s.price, initialStock: s.stock, sku: `SKU-${code}-${s.size}`, barcode: `${code}${s.size}` })),
    });
    return fx;
  }

  it("mismas claves exactas (recursivo) y sin sku, barcode, inventory ni available a nivel producto", async () => {
    const sizes = [{ size: "S", price: 300, stock: 0 }, { size: "M", price: 350, stock: 2 }];
    await seedPrisma("Uno", "AAAA1", new Date("2026-01-01T00:00:00Z"), {}, sizes);
    const fx = await seedFixture("AAAA1", sizes);

    const fromDb = await getPublicCatalog(new PrismaDataSource(testPrisma));
    const fromFx = await getPublicCatalog(fx);
    expect(fromDb).toHaveLength(1);
    expect(fromFx).toHaveLength(1);
    expect(uniqueShape(fromDb[0])).toEqual(uniqueShape(fromFx[0]));
    for (const p of [fromDb[0], fromFx[0]]) {
      for (const k of ["sku", "barcode", "inventory", "available"]) expect(Object.keys(p)).not.toContain(k);
      expect(JSON.stringify(p)).not.toMatch(/sku|barcode|inventory|"available":\d/i);
      expect(p.sizes).toEqual([
        { size: "S", available: false, price: 300 },
        { size: "M", available: true, price: 350 },
      ]);
      expect(p.price).toBe(300);
    }
  });

  it("un producto unido no aparece; tampoco inactivos ni sin las dos fotos", async () => {
    const target = await seedPrisma("Destino", "TTTT1", new Date("2026-01-01T00:00:00Z"));
    await seedPrisma("Unido", "UUUU1", new Date("2026-01-02T00:00:00Z"), { mergedIntoId: target.id });
    await seedPrisma("Inactivo", "IIII1", new Date("2026-01-03T00:00:00Z"), { isActive: false });
    await seedPrisma("Sin atras", "SSSS1", new Date("2026-01-04T00:00:00Z"), { backImageUrl: null });
    await seedPrisma("Sin frente", "FFFF1", new Date("2026-01-05T00:00:00Z"), { imageUrl: null });
    const codes = (await getPublicCatalog(new PrismaDataSource(testPrisma))).map((p) => p.publicCode);
    expect(codes).toEqual(["TTTT1"]);
  });

  it("orden createdAt desc y, en empate, id asc", async () => {
    const same = new Date("2026-02-01T00:00:00Z");
    const a = await seedPrisma("A", "AAAA2", same);
    const b = await seedPrisma("B", "BBBB2", same);
    await seedPrisma("Viejo", "VVVV2", new Date("2026-01-01T00:00:00Z"));
    await seedPrisma("Nuevo", "NNNN2", new Date("2026-03-01T00:00:00Z"));
    const ids = (await getPublicCatalog(new PrismaDataSource(testPrisma))).map((p) => p.publicCode);
    const tie = [a, b].sort((x, y) => (x.id < y.id ? -1 : 1)).map((p) => p.publicCode);
    expect(ids).toEqual(["NNNN2", ...tie, "VVVV2"]);
  });
});

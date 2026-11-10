import { beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { resetDb } from "../../../test/db/reset";
import { PrismaDataSource } from "../prisma-source";
import type { MovementQuery } from "../source";
import { mexicoRangeToUtc } from "../../domain/movement-scope";

const ds = new PrismaDataSource(testPrisma);
const V1 = "00000000-0000-4000-8000-0000000000c1";

interface World { lomas: string; club: string; user: string; saleId: string }

async function seed(): Promise<World> {
  const lomas = (await testPrisma.location.create({ data: { name: "Lomas" } })).id;
  const club = (await testPrisma.location.create({ data: { name: "ClubAlva" } })).id;
  const user = (await testPrisma.user.create({ data: { username: "ana", name: "Ana", password: "x", role: "owner" } })).id;
  const brandId = (await testPrisma.brand.create({ data: { name: "Guess", slug: "guess" } })).id;
  const departmentId = (await testPrisma.department.create({ data: { slug: "dama", name: "Dama" } })).id;
  await testPrisma.product.create({
    data: {
      title: "Playera", brand: "Guess", brandId, departmentId, category: "Playeras",
      variants: { create: [{ id: V1, title: "M", size: "M", sku: "SKU-M", price: 300 }] },
    },
  });
  const sale = await testPrisma.sale.create({
    data: {
      clientRequestId: "req-1", channel: "store", status: "paid", paymentMethod: "cash",
      locationId: lomas, total: 300, businessDate: new Date("2026-11-10"), createdById: user,
      customerAlias: "Marisol",
    },
  });
  return { lomas, club, user, saleId: sale.id };
}

const OPEN = (w: World, over: Partial<MovementQuery> = {}): MovementQuery => ({
  locationIds: "all", from: "2026-11-10", to: "2026-11-10", ...over,
});

describe.skipIf(!hasTestDb)("PrismaDataSource.listMovements", () => {
  let w: World;
  beforeEach(async () => {
    await resetDb();
    w = await seed();
  });

  it("120 movimientos con timestamp repetidos: tres páginas por cursor, sin repetidos ni huecos", async () => {
    const ts = [new Date("2026-11-10T18:00:00Z"), new Date("2026-11-10T19:00:00Z")];
    await testPrisma.movement.createMany({
      data: Array.from({ length: 120 }, (_, i) => ({
        variantId: V1, locationId: w.lomas, userId: w.user, delta: 1, type: "RESTOCK" as const,
        timestamp: ts[i % 2], requestId: `r-${i}`,
      })),
    });
    const all = new Set((await testPrisma.movement.findMany({ select: { id: true } })).map((m) => m.id));
    expect(all.size).toBe(120);

    const seen: string[] = [];
    const sizes: number[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 5; guard++) {
      const page = await ds.listMovements(OPEN(w, { cursor }));
      sizes.push(page.rows.length);
      seen.push(...page.rows.map((r) => r.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(sizes).toEqual([50, 50, 20]);
    expect(new Set(seen).size).toBe(120);
    expect(new Set(seen)).toEqual(all);
  });

  it("saleNumber en los SALE, null en el resto, y ninguna clave customerAlias", async () => {
    await testPrisma.movement.createMany({
      data: [
        { variantId: V1, locationId: w.lomas, userId: w.user, delta: -1, type: "SALE", saleId: w.saleId, timestamp: new Date("2026-11-10T20:00:00Z") },
        { variantId: V1, locationId: w.lomas, userId: w.user, delta: -1, type: "DAMAGE", notes: "mancha", timestamp: new Date("2026-11-10T19:00:00Z") },
      ],
    });
    const sale = await testPrisma.sale.findUniqueOrThrow({ where: { id: w.saleId } });
    const { rows } = await ds.listMovements(OPEN(w));
    expect(rows[0]).toMatchObject({ type: "SALE", typeLabel: "Venta", saleNumber: sale.number, productTitle: "Playera", size: "M", locationName: "Lomas", userName: "Ana" });
    expect(rows[1]).toMatchObject({ type: "DAMAGE", typeLabel: "Merma", saleNumber: null, notes: "mancha" });
    for (const r of rows) {
      expect("customerAlias" in r).toBe(false);
      expect(JSON.stringify(r)).not.toContain("Marisol");
    }
  });

  it("el día de México es inclusivo: 23:30 del 10 (05:30Z del 11) entra en el 10 y no en el 11", async () => {
    await testPrisma.movement.createMany({
      data: [
        { variantId: V1, locationId: w.lomas, userId: w.user, delta: 1, type: "RESTOCK", notes: "tarde", timestamp: new Date("2026-11-11T05:30:00Z") },
        { variantId: V1, locationId: w.lomas, userId: w.user, delta: 1, type: "RESTOCK", notes: "madrugada", timestamp: new Date("2026-11-10T05:59:00Z") },
        { variantId: V1, locationId: w.lomas, userId: w.user, delta: 1, type: "RESTOCK", notes: "nueva", timestamp: new Date("2026-11-11T06:01:00Z") },
      ],
    });
    const d10 = await ds.listMovements(OPEN(w));
    expect(d10.rows.map((r) => r.notes)).toEqual(["tarde"]);
    const d11 = await ds.listMovements(OPEN(w, { from: "2026-11-11", to: "2026-11-11" }));
    expect(d11.rows.map((r) => r.notes)).toEqual(["nueva"]);
    const d9 = await ds.listMovements(OPEN(w, { from: "2026-11-09", to: "2026-11-09" }));
    expect(d9.rows.map((r) => r.notes)).toEqual(["madrugada"]);
    expect(mexicoRangeToUtc("2026-11-10", "2026-11-10").gte.toISOString()).toBe("2026-11-10T06:00:00.000Z");
  });

  it("filtra por tienda, tipo, persona y prenda", async () => {
    const other = (await testPrisma.user.create({ data: { username: "carlos", name: "Carlos", password: "x", role: "manager" } })).id;
    const at = new Date("2026-11-10T18:00:00Z");
    await testPrisma.movement.createMany({
      data: [
        { variantId: V1, locationId: w.lomas, userId: w.user, delta: 1, type: "RESTOCK", timestamp: at },
        { variantId: V1, locationId: w.club, userId: other, delta: -1, type: "DAMAGE", timestamp: at },
      ],
    });
    expect((await ds.listMovements(OPEN(w, { locationIds: [w.club] }))).rows).toHaveLength(1);
    expect((await ds.listMovements(OPEN(w, { type: "DAMAGE" }))).rows[0].userName).toBe("Carlos");
    expect((await ds.listMovements(OPEN(w, { userId: w.user }))).rows[0].type).toBe("RESTOCK");
    expect((await ds.listMovements(OPEN(w, { variantId: V1 }))).rows).toHaveLength(2);
    expect((await ds.listMovements(OPEN(w, { locationIds: [] }))).rows).toHaveLength(0);
    expect((await ds.listMovementActors()).map((a) => a.name).sort()).toEqual(["Ana", "Carlos"]);
  });
});

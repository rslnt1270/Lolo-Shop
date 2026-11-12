import { beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { resetDb } from "../../../test/db/reset";
import { PrismaDataSource } from "../prisma-source";

const ds = new PrismaDataSource(testPrisma);

describe.skipIf(!hasTestDb)("publicar: setProductPublished y getProductForPublish", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("setProductPublished cambia solo isPublished", async () => {
    const created = await testPrisma.product.create({
      data: { title: "Blusa", brand: "Guess", imageUrl: "f", backImageUrl: "b", description: "d", isActive: true },
    });
    await ds.setProductPublished(created.id, true);
    const after = await testPrisma.product.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.isPublished).toBe(true);
    expect(after).toMatchObject({ title: "Blusa", imageUrl: "f", backImageUrl: "b", description: "d", isActive: true, catalogPhotosCheckedAt: null });
    await ds.setProductPublished(created.id, false);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: created.id } })).isPublished).toBe(false);
  });

  it("getProductForPublish devuelve variantes e inventario", async () => {
    const loc = await testPrisma.location.create({ data: { name: "Tienda" } });
    const prod = await testPrisma.product.create({
      data: {
        title: "Blusa", brand: "Guess",
        variants: { create: [{ sku: "S1", title: "M", size: "M", price: 100, inventory: { create: { locationId: loc.id, available: 2 } } }] },
      },
    });
    const got = await ds.getProductForPublish(prod.id);
    expect(got?.variants[0].inventory).toEqual([{ locationId: loc.id, available: 2 }]);
  });

  it("getProductForPublish no devuelve productos unidos ni inactivos", async () => {
    const target = await testPrisma.product.create({ data: { title: "Destino", brand: "Guess" } });
    const inactive = await testPrisma.product.create({ data: { title: "Inactivo", brand: "Guess", isActive: false } });
    const merged = await testPrisma.product.create({ data: { title: "Unido", brand: "Guess", mergedIntoId: target.id } });
    expect(await ds.getProductForPublish(inactive.id)).toBeNull();
    expect(await ds.getProductForPublish(merged.id)).toBeNull();
    expect(await ds.getProductForPublish("no-existe")).toBeNull();
    expect(await ds.getProductForPublish(target.id)).not.toBeNull();
    await expect(ds.setProductPublished("no-existe", true)).rejects.toThrow();
  });
});

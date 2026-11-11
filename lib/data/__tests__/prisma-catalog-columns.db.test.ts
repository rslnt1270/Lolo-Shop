import { beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { resetDb } from "../../../test/db/reset";
import { PrismaDataSource } from "../prisma-source";

const ds = new PrismaDataSource(testPrisma);

describe.skipIf(!hasTestDb)("columnas de catálogo: color, publicación, fotos revisadas, tienda pública", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("getProducts lee color, isPublished false y catalogPhotosCheckedAt null por defecto", async () => {
    await testPrisma.product.create({ data: { title: "Blusa", brand: "Guess" } });
    const checked = new Date("2026-11-12T10:00:00.000Z");
    await testPrisma.product.create({
      data: { title: "Vestido", brand: "Guess", color: "Negro", isPublished: true, catalogPhotosCheckedAt: checked },
    });
    const prods = await ds.getProducts();
    const blusa = prods.find((p) => p.title === "Blusa")!;
    expect(blusa.color).toBeNull();
    expect(blusa.isPublished).toBe(false);
    expect(blusa.catalogPhotosCheckedAt).toBeNull();
    const vestido = prods.find((p) => p.title === "Vestido")!;
    expect(vestido.color).toBe("Negro");
    expect(vestido.isPublished).toBe(true);
    expect(vestido.catalogPhotosCheckedAt).toBe(checked.toISOString());
  });

  it("getLocations: una tienda nueva es pública por defecto; isPublic false se respeta", async () => {
    const created = await ds.createLocation({ name: "Tienda A" });
    expect(created.isPublic).toBe(true);
    await testPrisma.location.create({ data: { name: "Tienda B", isPublic: false } });
    const locs = await ds.getLocations();
    expect(locs.find((l) => l.name === "Tienda A")!.isPublic).toBe(true);
    expect(locs.find((l) => l.name === "Tienda B")!.isPublic).toBe(false);
  });
});

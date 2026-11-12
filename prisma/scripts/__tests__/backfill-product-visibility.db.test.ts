import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { resetDb } from "../../../test/db/reset";
import { assertVisibilityPrerequisites, backfillProductVisibility } from "../backfill-product-visibility";

describe.skipIf(!hasTestDb)("backfillProductVisibility", () => {
  beforeEach(async () => {
    await resetDb();
    await testPrisma.productType.create({ data: { slug: "playeras", name: "Playeras" } });
  });
  afterAll(() => testPrisma.$disconnect());

  let n = 0;
  async function mk(o: Record<string, unknown> = {}) {
    n++;
    return testPrisma.product.create({
      data: {
        title: `P${n}`, brand: "Marca", category: "Playeras",
        imageUrl: "https://x/f.jpg", backImageUrl: "https://x/b.jpg", description: "desc",
        ...o,
      },
    });
  }
  const none = { publishIds: [] as string[], forceUnpublishIds: [] as string[], allFalse: false };

  it("backfill: segunda corrida no modifica filas", async () => {
    const p = await mk();
    const first = await backfillProductVisibility(testPrisma, { ...none, publishIds: [p.id] });
    expect(first.published).toBe(1);
    const second = await backfillProductVisibility(testPrisma, { ...none, publishIds: [p.id] });
    expect(second.published).toBe(0);
    expect(second.unpublished).toBe(0);
    expect(second.checkedCleared).toBe(0);
  });

  it("backfill: --all-false deja todos los productos sin publicar", async () => {
    await mk({ isPublished: true });
    await mk({ isPublished: true });
    const r = await backfillProductVisibility(testPrisma, { ...none, allFalse: true });
    expect(r.unpublished).toBe(2);
    expect(await testPrisma.product.count({ where: { isPublished: true } })).toBe(0);
  });

  it("backfill: publicar pone catalogPhotosCheckedAt solo si era nulo", async () => {
    const old = new Date("2026-10-01T00:00:00Z");
    const checked = await mk({ catalogPhotosCheckedAt: old });
    const fresh = await mk();
    await backfillProductVisibility(testPrisma, { ...none, publishIds: [checked.id, fresh.id] });
    const a = await testPrisma.product.findUniqueOrThrow({ where: { id: checked.id } });
    const b = await testPrisma.product.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(a.isPublished).toBe(true);
    expect(a.catalogPhotosCheckedAt?.toISOString()).toBe(old.toISOString());
    expect(b.catalogPhotosCheckedAt).not.toBeNull();
  });

  it("backfill: --unpublish limpia catalogPhotosCheckedAt", async () => {
    const p = await mk({ isPublished: true, catalogPhotosCheckedAt: new Date() });
    const r = await backfillProductVisibility(testPrisma, { ...none, forceUnpublishIds: [p.id] });
    const row = await testPrisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.isPublished).toBe(false);
    expect(row.catalogPhotosCheckedAt).toBeNull();
    expect(r.unpublished).toBe(1);
    expect(r.checkedCleared).toBe(1);
  });

  it("backfill: no toca color ni Location.isPublic", async () => {
    const p = await mk({ color: "Negro" });
    const loc = await testPrisma.location.create({ data: { name: "Lomas", isPublic: false } });
    await backfillProductVisibility(testPrisma, { ...none, publishIds: [p.id] });
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: p.id } })).color).toBe("Negro");
    expect((await testPrisma.location.findUniqueOrThrow({ where: { id: loc.id } })).isPublic).toBe(false);
  });

  it("backfill: ids desconocidos o no publicables no publican nada a medias y se reportan", async () => {
    const good = await mk();
    const bad = await mk({ backImageUrl: null });
    const r = await backfillProductVisibility(testPrisma, { ...none, publishIds: [good.id, bad.id, "nope"] });
    expect(r.plan.unknownIds).toEqual(["nope"]);
    expect(r.plan.notPublishable).toEqual([bad.id]);
    expect(r.published).toBe(1);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: bad.id } })).isPublished).toBe(false);
  });

  describe("guardia de orden", () => {
    it("migración faltante: mensaje claro, sin escribir", async () => {
      const p = await mk({ isPublished: true });
      await expect(assertVisibilityPrerequisites(testPrisma, ["_no_existe"])).rejects.toThrow(
        "Aplica primero las migraciones (add_product_types y catalog_color_visibility).",
      );
      expect((await testPrisma.product.findUniqueOrThrow({ where: { id: p.id } })).isPublished).toBe(true);
    });

    it("consulta de migraciones falla: mensaje claro, no el error de Prisma", async () => {
      const stub = { $queryRaw: async () => { throw new Error("relation does not exist"); } } as never;
      await expect(assertVisibilityPrerequisites(stub)).rejects.toThrow(/^Aplica primero las migraciones/);
    });

    it("hay productos y cero ProductType: rechaza", async () => {
      await mk();
      await testPrisma.productType.deleteMany();
      await expect(backfillProductVisibility(testPrisma, none)).rejects.toThrow(/backfill-product-types/);
    });

    it("productos sin productTypeId no bloquean si existen tipos", async () => {
      await mk();
      await expect(backfillProductVisibility(testPrisma, none)).resolves.toBeDefined();
    });

    it("--all-false no se bloquea ni con tipos vacíos", async () => {
      await mk({ isPublished: true });
      await testPrisma.productType.deleteMany();
      const r = await backfillProductVisibility(testPrisma, { ...none, allFalse: true });
      expect(r.unpublished).toBe(1);
    });
  });
});

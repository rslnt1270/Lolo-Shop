import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { resetDb } from "../../../test/db/reset";
import { backfillBrandDepartment } from "../../../prisma/scripts/backfill-brand-department";
import { backfillProductTypes } from "../../../prisma/scripts/backfill-product-types";

vi.mock("@/lib/prisma", async () => ({ default: (await import("../../../test/db/setup")).testPrisma }));
vi.mock("../../prisma", async () => ({ default: (await import("../../../test/db/setup")).testPrisma }));

import { PrismaDataSource } from "../prisma-source";
import { InventoryRuleError } from "../errors";

describe.skipIf(!hasTestDb)("PrismaDataSource: tipos de producto", () => {
  const ds = new PrismaDataSource(testPrisma);
  let storeA: string;
  let storeB: string;
  let userId: string;
  let brandId: string;
  let dept: Record<string, string>;
  let type: Record<string, { id: string; name: string }>;
  let n = 0;

  beforeEach(async () => {
    await resetDb();
    await backfillBrandDepartment(testPrisma);
    await backfillProductTypes(testPrisma);
    storeA = (await testPrisma.location.create({ data: { name: "Tienda A", type: "store" } })).id;
    storeB = (await testPrisma.location.create({ data: { name: "Tienda B", type: "store" } })).id;
    userId = (await testPrisma.user.create({ data: { username: "owner", password: "x", role: "owner" } })).id;
    brandId = (await testPrisma.brand.create({ data: { name: "Guess", slug: "guess" } })).id;
    dept = Object.fromEntries((await testPrisma.department.findMany()).map((d) => [d.slug, d.id]));
    type = Object.fromEntries((await testPrisma.productType.findMany()).map((t) => [t.slug, { id: t.id, name: t.name }]));
  });

  /** Producto con una talla por entrada de `stock` ({ talla: { A: n, B: n } }). */
  async function mk(opts: {
    dept: string | null;
    type: string | null;
    audience?: string | null;
    style?: string | null;
    sizes: Record<string, Partial<Record<"A" | "B", number>>>;
    inactive?: boolean;
    inactiveSizes?: string[];
  }) {
    n++;
    const p = await testPrisma.product.create({
      data: {
        title: `P${n}`, brand: "Guess", brandId, category: opts.type ? type[opts.type].name : "General",
        departmentId: opts.dept ? dept[opts.dept] : null,
        productTypeId: opts.type ? type[opts.type].id : null,
        audience: opts.audience ?? null, style: opts.style ?? null, isActive: !opts.inactive,
      },
    });
    for (const [size, stock] of Object.entries(opts.sizes)) {
      const v = await testPrisma.variant.create({
        data: { productId: p.id, title: size, size, sku: `SKU-${n}-${size}`, price: 100, isActive: !opts.inactiveSizes?.includes(size) },
      });
      for (const [loc, available] of Object.entries(stock)) {
        await testPrisma.inventoryLevel.create({
          data: { variantId: v.id, locationId: loc === "A" ? storeA : storeB, available: available as number },
        });
      }
    }
    return p.id;
  }

  const read = (id: string) => testPrisma.product.findUniqueOrThrow({ where: { id } });

  const baseCreate = () => ({
    title: "Polo Guess", brand: "Guess", brandId, departmentId: dept.dama, publicCode: "ABCDE",
    variants: [{ sku: "LS-1", barcode: null, size: "M", price: 300, initialStock: 2 }],
    locationId: storeA, userId,
  });

  it("createProduct guarda productTypeId, style polo y category Playeras", async () => {
    const { product } = await ds.createProduct({
      ...baseCreate(), category: type.playera.name, productTypeId: type.playera.id, style: "polo", audience: null,
    });
    const row = await read(product.id);
    expect(row.productTypeId).toBe(type.playera.id);
    expect(row.style).toBe("polo");
    expect(row.audience).toBeNull();
    expect(row.category).toBe("Playeras");
    expect(product.productTypeId).toBe(type.playera.id);
    expect(product.style).toBe("polo");
  });

  it("updateProduct cambia tipo, estilo y para a la vez", async () => {
    const id = await mk({ dept: "calzado", type: "zapato", audience: "dama", style: null, sizes: {} });
    await ds.updateProduct(id, {
      productTypeId: type.tenis.id, category: type.tenis.name, style: null, audience: "nino",
    });
    const row = await read(id);
    expect(row).toMatchObject({ productTypeId: type.tenis.id, category: "Tenis", style: null, audience: "nino" });
    const listed = (await ds.getProducts()).find((p) => p.id === id)!;
    expect(listed).toMatchObject({ productTypeId: type.tenis.id, style: null, audience: "nino" });
  });

  describe("assignProductType", () => {
    const allowedStyles = ["polo", "cuello-redondo", "cuello-v", "sin-mangas"];

    it("reclasifica en lote y cuenta styleCleared", async () => {
      const a = await mk({ dept: "dama", type: "sudadera", style: "con-capucha", sizes: {} });
      const b = await mk({ dept: "dama", type: "sudadera", sizes: {} });
      const c = await mk({ dept: "dama", type: null, sizes: {} });
      const res = await ds.assignProductType([a, b, c], {
        productTypeId: type.playera.id, category: "Playeras", allowedStyles,
      });
      expect(res).toEqual({ updated: 3, styleCleared: 1 });
      for (const id of [a, b, c]) {
        expect(await read(id)).toMatchObject({ productTypeId: type.playera.id, category: "Playeras", style: null });
      }
    });

    it("conserva un estilo que el tipo nuevo admite", async () => {
      const a = await mk({ dept: "dama", type: "camisa", style: "polo", sizes: {} });
      const res = await ds.assignProductType([a], { productTypeId: type.playera.id, category: "Playeras", allowedStyles });
      expect(res).toEqual({ updated: 1, styleCleared: 0 });
      expect((await read(a)).style).toBe("polo");
    });

    it("con un par inválido lanza InventoryRuleError y no escribe", async () => {
      const ok = await mk({ dept: "dama", type: "sudadera", sizes: {} });
      const bad = await mk({ dept: "calzado", type: "tenis", audience: "dama", sizes: {} });
      const err = await ds
        .assignProductType([ok, bad], { productTypeId: type.playera.id, category: "Playeras", allowedStyles })
        .catch((e) => e);
      expect(err).toBeInstanceOf(InventoryRuleError);
      expect(err.message).toBe("«Playeras» no aplica a 1 de los productos elegidos. Quítalos de la selección.");
      expect((await read(ok)).productTypeId).toBe(type.sudadera.id);
      expect((await read(bad)).productTypeId).toBe(type.tenis.id);
    });

    it("no cambia departmentId ni audience", async () => {
      const id = await mk({ dept: "calzado", type: "zapato", audience: "nino", sizes: {} });
      await ds.assignProductType([id], { productTypeId: type.tenis.id, category: "Tenis", allowedStyles: [] });
      expect(await read(id)).toMatchObject({ departmentId: dept.calzado, audience: "nino", productTypeId: type.tenis.id });
    });
  });

  describe("getStockByType", () => {
    async function scenario() {
      await mk({ dept: "dama", type: "playera", sizes: { M: { A: 3, B: 1 }, L: { A: 2 } } });
      await mk({ dept: "dama", type: "playera", sizes: { S: { A: 0 } } });
      await mk({ dept: "calzado", type: "tenis", audience: "nino", sizes: { "22": { A: 4 } } });
      await mk({ dept: "calzado", type: "tenis", audience: "dama", sizes: { "24": { A: 2 } } });
      await mk({ dept: "dama", type: null, sizes: { U: { B: 7 } } });
      await mk({ dept: "dama", type: "playera", inactive: true, sizes: { M: { A: 9 } } });
      await mk({ dept: "dama", type: "playera", sizes: { M: { A: 5 } }, inactiveSizes: ["M"] });
    }
    const brief = (rows: Awaited<ReturnType<typeof ds.getStockByType>>) =>
      rows.map((r) => [r.departmentName, r.typeName, r.audience, r.locationName, r.pieces, r.products]);

    it("sin filtro devuelve las 5 filas esperadas en orden", async () => {
      await scenario();
      expect(brief(await ds.getStockByType({}))).toEqual([
        ["Dama", "Playeras", null, "Tienda A", 5, 1],
        ["Dama", "Playeras", null, "Tienda B", 1, 1],
        ["Dama", "Sin tipo", null, "Tienda B", 7, 1],
        ["Calzado", "Tenis", "dama", "Tienda A", 2, 1],
        ["Calzado", "Tenis", "nino", "Tienda A", 4, 1],
      ]);
    });

    it("Σ pieces = 19 y suma de playera = 6", async () => {
      await scenario();
      const rows = await ds.getStockByType({});
      expect(rows.reduce((s, r) => s + r.pieces, 0)).toBe(19);
      expect(rows.filter((r) => r.productTypeId === type.playera.id).reduce((s, r) => s + r.pieces, 0)).toBe(6);
      expect(rows[0]).toMatchObject({
        departmentId: dept.dama, productTypeId: type.playera.id, typeActive: true, locationId: storeA,
      });
      expect(rows[2]).toMatchObject({ productTypeId: null, typeActive: true });
    });

    it("con locationId de Tienda B devuelve solo sus 2 filas", async () => {
      await scenario();
      const rows = await ds.getStockByType({ locationId: storeB });
      expect(brief(rows)).toEqual([
        ["Dama", "Playeras", null, "Tienda B", 1, 1],
        ["Dama", "Sin tipo", null, "Tienda B", 7, 1],
      ]);
    });

    it("excluye productos o tallas inactivos y unidos", async () => {
      await scenario();
      const target = await mk({ dept: "dama", type: "playera", sizes: { M: { A: 0 } } });
      const merged = await mk({ dept: "dama", type: "playera", sizes: { M: { A: 40 } } });
      await testPrisma.product.update({ where: { id: merged }, data: { mergedIntoId: target } });
      const total = (await ds.getStockByType({})).reduce((s, r) => s + r.pieces, 0);
      expect(total).toBe(19);
    });
  });
});

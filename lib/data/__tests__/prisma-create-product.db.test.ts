import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { getTestDatabaseUrl } from "../../../test/db/guard";
import { resetDb } from "../../../test/db/reset";
import { PrismaDataSource } from "../prisma-source";
import { InventoryRuleError, uniqueViolationField } from "../errors";
import type { CreateProductData } from "../source";

// Dos clientes con su propio pool, como dos tabletas guardando a la vez.
const url = getTestDatabaseUrl() ?? "postgresql://invalid:invalid@127.0.0.1:1/none";
const clientA = new PrismaClient({ datasources: { db: { url } } });
const clientB = new PrismaClient({ datasources: { db: { url } } });
const dsA = new PrismaDataSource(clientA);
const dsB = new PrismaDataSource(clientB);
const ds = new PrismaDataSource(testPrisma);

interface World {
  store: string;
  user: string;
  brandId: string;
  departmentId: string;
}

async function seed(): Promise<World> {
  const store = (await testPrisma.location.create({ data: { name: "Tienda A" } })).id;
  const user = (await testPrisma.user.create({ data: { username: "owner", password: "x", role: "owner" } })).id;
  const brandId = (await testPrisma.brand.create({ data: { name: "Guess", slug: "guess" } })).id;
  const departmentId = (await testPrisma.department.create({ data: { slug: "dama", name: "Dama" } })).id;
  return { store, user, brandId, departmentId };
}

function data(w: World, patch: Partial<CreateProductData> = {}): CreateProductData {
  return {
    title: "Playera Logo",
    brand: "Guess",
    brandId: w.brandId,
    departmentId: w.departmentId,
    publicCode: "K7Q2M",
    category: "Playeras",
    locationId: w.store,
    userId: w.user,
    color: null,
    photosChecked: false,
    variants: [
      { sku: "LS-S00000-0", barcode: "TALLA-S", size: "S", price: 300, initialStock: 2 },
      { sku: "LS-M00000-0", barcode: null, size: "M", price: 300, initialStock: 0 },
      { sku: "LS-L00000-0", barcode: "TALLA-L", size: "L", price: 320, initialStock: 1 },
    ],
    ...patch,
  };
}

describe.skipIf(!hasTestDb)("PrismaDataSource.createProduct con varias tallas", () => {
  let w: World;

  beforeEach(async () => {
    await resetDb();
    w = await seed();
  });

  afterAll(async () => {
    await Promise.all([clientA.$disconnect(), clientB.$disconnect()]);
  });

  it("3 tallas (2, 0, 1 piezas) → 1 Product, 3 Variant con title = talla, 3 filas en la tienda, 2 RESTOCK, 1 publicCode", async () => {
    const created = await ds.createProduct(data(w));
    expect(created.variants.map((v) => v.size)).toEqual(["S", "M", "L"]);

    expect(await testPrisma.product.count()).toBe(1);
    const product = await testPrisma.product.findFirstOrThrow();
    expect(product.publicCode).toBe("K7Q2M");
    expect(created.product.id).toBe(product.id);

    const variants = await testPrisma.variant.findMany({ orderBy: { sku: "asc" } });
    expect(variants).toHaveLength(3);
    for (const v of variants) expect(v.title).toBe(v.size);

    const levels = await testPrisma.inventoryLevel.findMany({ include: { variant: true } });
    expect(levels).toHaveLength(3);
    expect(levels.every((l) => l.locationId === w.store)).toBe(true);
    expect(Object.fromEntries(levels.map((l) => [l.variant.size, l.available]))).toEqual({ S: 2, M: 0, L: 1 });

    const moves = await testPrisma.movement.findMany({ include: { variant: true } });
    expect(moves).toHaveLength(2);
    expect(moves.every((m) => m.type === "RESTOCK" && m.notes === "alta" && m.userId === w.user)).toBe(true);
    expect(Object.fromEntries(moves.map((m) => [m.variant.size, m.delta]))).toEqual({ S: 2, L: 1 });
  });

  it("stores product color and photos check; variant color stays General", async () => {
    const front = "https://abc.public.blob.vercel-storage.com/productos/f.jpg";
    const back = "https://abc.public.blob.vercel-storage.com/productos/b.jpg";
    const a = await ds.createProduct(data(w, { color: "Rosa", photosChecked: true, imageUrl: front, backImageUrl: back }));
    const row = await testPrisma.product.findUniqueOrThrow({ where: { id: a.product.id }, include: { variants: true } });
    expect(row.color).toBe("Rosa");
    expect(row.catalogPhotosCheckedAt).not.toBeNull();
    expect(a.product.color).toBe("Rosa");
    expect(row.variants.every((v) => v.color === "General")).toBe(true);

    const b = await ds.createProduct(data(w, {
      publicCode: "ZZZZ1", color: null, photosChecked: false,
      variants: [{ sku: "LS-Z00000-0", barcode: null, size: "U", price: 1, initialStock: 0 }],
    }));
    const row2 = await testPrisma.product.findUniqueOrThrow({ where: { id: b.product.id } });
    expect(row2.color).toBeNull();
    expect(row2.catalogPhotosCheckedAt).toBeNull();
  });

  it("photosChecked sin las dos URL no escribe catalogPhotosCheckedAt", async () => {
    const front = "https://abc.public.blob.vercel-storage.com/productos/f.jpg";
    const a = await ds.createProduct(data(w, { publicCode: "ONLY1", photosChecked: true, imageUrl: front, backImageUrl: null,
      variants: [{ sku: "LS-Y00000-0", barcode: null, size: "U", price: 1, initialStock: 0 }] }));
    const row = await testPrisma.product.findUniqueOrThrow({ where: { id: a.product.id } });
    expect(row.catalogPhotosCheckedAt).toBeNull();
  });

  it("setCatalogPhotos escribe las dos URL y catalogPhotosCheckedAt en una sola escritura", async () => {
    const a = await ds.createProduct(data(w));
    const front = "https://abc.public.blob.vercel-storage.com/productos/f.jpg";
    const back = "https://abc.public.blob.vercel-storage.com/productos/b.jpg";
    await ds.setCatalogPhotos(a.product.id, { imageUrl: front, backImageUrl: back });
    const row = await testPrisma.product.findUniqueOrThrow({ where: { id: a.product.id } });
    expect(row).toMatchObject({ imageUrl: front, backImageUrl: back });
    expect(row.catalogPhotosCheckedAt).not.toBeNull();
  });

  it("cambiar un lado no toca catalogPhotosCheckedAt", async () => {
    const a = await ds.createProduct(data(w));
    await ds.updateProductImage(a.product.id, "https://abc.public.blob.vercel-storage.com/productos/f.jpg");
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: a.product.id } })).catalogPhotosCheckedAt).toBeNull();
    await ds.setCatalogPhotos(a.product.id, {
      imageUrl: "https://abc.public.blob.vercel-storage.com/productos/f.jpg",
      backImageUrl: "https://abc.public.blob.vercel-storage.com/productos/b.jpg",
    });
    const before = (await testPrisma.product.findUniqueOrThrow({ where: { id: a.product.id } })).catalogPhotosCheckedAt;
    await ds.updateProductBackImage(a.product.id, "https://abc.public.blob.vercel-storage.com/productos/b2.jpg");
    const after = await testPrisma.product.findUniqueOrThrow({ where: { id: a.product.id } });
    expect(after.catalogPhotosCheckedAt).toEqual(before);
    expect(after.backImageUrl).toContain("b2.jpg");
  });

  it("una de las 3 con un código ya registrado → P2002 en barcode y no se crea nada", async () => {
    await ds.createProduct(data(w, {
      publicCode: "AAAAA",
      variants: [{ sku: "LS-OLD000-0", barcode: "TALLA-L", size: "U", price: 100, initialStock: 1 }],
    }));
    const before = {
      products: await testPrisma.product.count(),
      variants: await testPrisma.variant.count(),
      levels: await testPrisma.inventoryLevel.count(),
      moves: await testPrisma.movement.count(),
    };

    const err = await ds.createProduct(data(w)).catch((e) => e);
    expect(uniqueViolationField(err)).toBe("barcode");

    expect(await testPrisma.product.count()).toBe(before.products);
    expect(await testPrisma.variant.count()).toBe(before.variants);
    expect(await testPrisma.inventoryLevel.count()).toBe(before.levels);
    expect(await testPrisma.movement.count()).toBe(before.moves);
  });

  it("dos altas en paralelo (dos clientes) con el mismo código → una crea, la otra P2002 en barcode", async () => {
    const one = (code: string, sku: string) => data(w, {
      publicCode: code,
      variants: [{ sku, barcode: "7501234567897", size: "M", price: 300, initialStock: 1 }],
    });
    const results = await Promise.allSettled([
      dsA.createProduct(one("BBBBB", "LS-A00000-0")),
      dsB.createProduct(one("CCCCC", "LS-B00000-0")),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(uniqueViolationField(failed[0].reason)).toBe("barcode");
    expect(await testPrisma.product.count()).toBe(1);
    expect(await testPrisma.movement.count()).toBe(1);
  });

  it("el código alfanumérico queda en mayúsculas", async () => {
    await ds.createProduct(data(w, {
      variants: [{ sku: "LS-C00000-0", barcode: "abc-xyz", size: "M", price: 300, initialStock: 0 }],
    }));
    expect((await testPrisma.variant.findFirstOrThrow()).barcode).toBe("ABC-XYZ");
  });
});

describe.skipIf(!hasTestDb)("PrismaDataSource.addVariant", () => {
  let w: World;
  let productId: string;

  beforeEach(async () => {
    await resetDb();
    w = await seed();
    productId = (await ds.createProduct(data(w, {
      variants: [{ sku: "LS-M00000-0", barcode: "TALLA-M", size: "M", price: 300, initialStock: 1 }],
    }))).product.id;
  });

  const add = (patch: Record<string, unknown> = {}) => ({
    productId, sku: "LS-L11111-0", size: "L", barcode: null as string | null, price: 320, initialStock: 2,
    locationId: w.store, userId: w.user, ...patch,
  });

  it("agrega L a un producto con M: variante, fila en la tienda y RESTOCK", async () => {
    const match = await ds.addVariant(add({ barcode: "talla-l" }));
    expect(match.variant).toMatchObject({ size: "L", title: "L", barcode: "TALLA-L", price: 320 });
    expect(match.product.variants.map((v) => v.size).sort()).toEqual(["L", "M"]);
    expect(await testPrisma.variant.count({ where: { productId } })).toBe(2);
    const lvl = await testPrisma.inventoryLevel.findUniqueOrThrow({
      where: { variantId_locationId: { variantId: match.variant.id, locationId: w.store } },
    });
    expect(lvl.available).toBe(2);
    expect(await testPrisma.movement.count({ where: { variantId: match.variant.id, type: "RESTOCK", delta: 2 } })).toBe(1);
  });

  it("misma talla sin código → InventoryRuleError y nada nuevo", async () => {
    const err = await ds.addVariant(add({ size: "m" })).catch((e) => e);
    expect(err).toBeInstanceOf(InventoryRuleError);
    expect(err.message).toBe("Esa talla ya existe: suma piezas con Entrada");
    expect(await testPrisma.variant.count()).toBe(1);
  });

  it("misma talla con otro código → se permite", async () => {
    await expect(ds.addVariant(add({ size: "M", barcode: "OTRA-M" }))).resolves.toBeTruthy();
    expect(await testPrisma.variant.count({ where: { productId, size: "M" } })).toBe(2);
  });

  it("producto inactivo o unido → InventoryRuleError", async () => {
    await testPrisma.product.update({ where: { id: productId }, data: { isActive: false } });
    await expect(ds.addVariant(add())).rejects.toBeInstanceOf(InventoryRuleError);
    const target = await ds.createProduct(data(w, {
      publicCode: "DDDDD", variants: [{ sku: "LS-T00000-0", barcode: null, size: "U", price: 1, initialStock: 0 }],
    }));
    await testPrisma.product.update({ where: { id: productId }, data: { isActive: true, mergedIntoId: target.product.id } });
    await expect(ds.addVariant(add())).rejects.toBeInstanceOf(InventoryRuleError);
    expect(await testPrisma.variant.count({ where: { productId } })).toBe(1);
  });

  it("código ya registrado → P2002 en barcode", async () => {
    const err = await ds.addVariant(add({ barcode: "TALLA-M" })).catch((e) => e);
    expect(uniqueViolationField(err)).toBe("barcode");
  });
});

describe.skipIf(!hasTestDb)("PrismaDataSource.searchProducts", () => {
  let w: World;

  beforeEach(async () => {
    await resetDb();
    w = await seed();
  });

  it("código público exacto, título o marca; solo activos y sin unir; tallas ordenadas", async () => {
    const a = await ds.createProduct(data(w, { publicCode: "K7Q2M" }));
    await ds.createProduct(data(w, {
      title: "Sudadera", publicCode: "EEEEE",
      variants: [{ sku: "LS-E00000-0", barcode: null, size: "U", price: 1, initialStock: 0 }],
    }));
    const merged = await ds.createProduct(data(w, {
      title: "Playera Logo vieja", publicCode: "FFFFF",
      variants: [{ sku: "LS-F00000-0", barcode: null, size: "U", price: 1, initialStock: 0 }],
    }));
    await testPrisma.product.update({ where: { id: merged.product.id }, data: { mergedIntoId: a.product.id } });

    const byCode = await ds.searchProducts("k7q2m");
    expect(byCode).toEqual([{
      productId: a.product.id, title: "Playera Logo", brand: "Guess", publicCode: "K7Q2M", imageUrl: null, sizes: ["S", "M", "L"],
    }]);
    expect((await ds.searchProducts("playera")).map((h) => h.publicCode)).toEqual(["K7Q2M"]);
    expect((await ds.searchProducts("GUESS")).length).toBe(2);
    expect(await ds.searchProducts("  ")).toEqual([]);
  });

  it("el código público exacto va primero aunque haya 9 coincidencias más recientes por título", async () => {
    const exact = await ds.createProduct(data(w, {
      title: "Sudadera", publicCode: "HHHHH",
      variants: [{ sku: "LS-H00000-0", barcode: null, size: "U", price: 1, initialStock: 0 }],
    }));
    for (let i = 0; i < 9; i++) {
      await ds.createProduct(data(w, {
        title: `Playera HHHHH ${i}`, publicCode: `J000${i}`,
        variants: [{ sku: `LS-J0000${i}-0`, barcode: null, size: "U", price: 1, initialStock: 0 }],
      }));
    }
    const hits = await ds.searchProducts("hhhhh");
    expect(hits).toHaveLength(8);
    expect(hits[0].productId).toBe(exact.product.id);
    expect(new Set(hits.map((h) => h.productId)).size).toBe(8);
  });

  it("máximo 8 resultados", async () => {
    for (let i = 0; i < 10; i++) {
      await ds.createProduct(data(w, {
        publicCode: `G000${i}`,
        variants: [{ sku: `LS-G0000${i}-0`, barcode: null, size: "U", price: 1, initialStock: 0 }],
      }));
    }
    expect(await ds.searchProducts("playera")).toHaveLength(8);
  });
});

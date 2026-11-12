import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { getTestDatabaseUrl } from "../../../test/db/guard";
import { resetDb } from "../../../test/db/reset";
import { PrismaDataSource } from "../prisma-source";
import { PrismaSalesDataSource } from "../prisma-sales-source";
import { getPublicCatalog } from "../public-projection";
import { InventoryRuleError, SalesRuleError } from "../errors";
import { businessDateMx } from "@/lib/domain/sale";

// Dos clientes con su propio pool: dos personas guardando el precio al mismo tiempo.
const url = getTestDatabaseUrl() ?? "postgresql://invalid:invalid@127.0.0.1:1/none";
const clientA = new PrismaClient({ datasources: { db: { url } } });
const clientB = new PrismaClient({ datasources: { db: { url } } });
const dsA = new PrismaDataSource(clientA);
const dsB = new PrismaDataSource(clientB);
const ds = new PrismaDataSource(testPrisma);
const sales = new PrismaSalesDataSource(testPrisma);

const V1 = "00000000-0000-4000-8000-0000000000b1";
const V2 = "00000000-0000-4000-8000-0000000000b2";

describe.skipIf(!hasTestDb)("precio por talla, desactivar y departamento en lote", () => {
  let store: string;
  let owner: string;
  let manager: string;
  let productId: string;
  let departmentId: string;
  let otherDepartmentId: string;

  beforeEach(async () => {
    await resetDb();
    store = (await testPrisma.location.create({ data: { name: "Tienda A" } })).id;
    owner = (await testPrisma.user.create({ data: { username: "owner", name: "Lolo", password: "x", role: "owner" } })).id;
    manager = (await testPrisma.user.create({ data: { username: "ana", password: "x", role: "manager" } })).id;
    const brandId = (await testPrisma.brand.create({ data: { name: "Guess", slug: "guess" } })).id;
    departmentId = (await testPrisma.department.create({ data: { slug: "dama", name: "Dama" } })).id;
    otherDepartmentId = (await testPrisma.department.create({ data: { slug: "hombre", name: "Hombre" } })).id;
    const p = await testPrisma.product.create({
      data: {
        title: "Playera", brand: "Guess", brandId, departmentId, category: "Playeras",
        publicCode: "K7Q2M", imageUrl: "https://x.invalid/f.jpg", backImageUrl: "https://x.invalid/b.jpg",
        description: "Descripción", isPublished: true,
        variants: {
          create: [
            { id: V1, title: "M", sku: "SKU-M", size: "M", price: 899 },
            { id: V2, title: "L", sku: "SKU-L", size: "L", price: 320.5 },
          ],
        },
      },
    });
    productId = p.id;
    for (const v of [V1, V2]) {
      await testPrisma.inventoryLevel.create({ data: { variantId: v, locationId: store, available: 10 } });
    }
  });

  afterAll(async () => {
    await clientA.$disconnect();
    await clientB.$disconnect();
    await testPrisma.$disconnect();
  });

  it("dos ediciones con el mismo precio esperado: una pasa y la otra recibe el precio vigente", async () => {
    const [a, b] = await Promise.all([
      dsA.updateVariantPrice(V1, 899, 799, owner, "Promoción"),
      dsB.updateVariantPrice(V1, 899, 850, manager, null),
    ]);
    const oks = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);
    expect(oks).toHaveLength(1);
    expect(losers).toHaveLength(1);
    const winner = oks[0] as { ok: true; price: number };
    expect(losers[0]).toEqual({ ok: false, currentPrice: winner.price });

    const stored = await testPrisma.variant.findUniqueOrThrow({ where: { id: V1 } });
    expect(Number(stored.price)).toBe(winner.price);

    const changes = await testPrisma.priceChange.findMany({ where: { variantId: V1 } });
    expect(changes).toHaveLength(1);
    expect(Number(changes[0].oldPrice)).toBe(899);
    expect(Number(changes[0].newPrice)).toBe(winner.price);
    expect(changes[0].changedById).toBe(winner.price === 799 ? owner : manager);
  });

  it("precio esperado viejo: no cambia nada y no deja historial", async () => {
    const r = await ds.updateVariantPrice(V1, 700, 800, owner, null);
    expect(r).toEqual({ ok: false, currentPrice: 899 });
    expect(await testPrisma.priceChange.count()).toBe(0);
  });

  it("con decimales: 320.50 → 330.25 se guarda y se lista", async () => {
    await expect(ds.updateVariantPrice(V2, 320.5, 330.25, manager, "Ajuste")).resolves.toEqual({ ok: true, price: 330.25 });
    const rows = await ds.listPriceChanges(V2, 5);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ oldPrice: 320.5, newPrice: 330.25, userName: "ana" });
  });

  it("listPriceChanges devuelve las últimas N, la más nueva primero, con el nombre del usuario", async () => {
    let current = 899;
    for (let i = 1; i <= 7; i++) {
      const next = 899 + i;
      await ds.updateVariantPrice(V1, current, next, owner, null);
      current = next;
    }
    const rows = await ds.listPriceChanges(V1, 5);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.newPrice)).toEqual([906, 905, 904, 903, 902]);
    expect(rows[0].userName).toBe("Lolo");
    expect(new Date(rows[0].createdAt).toString()).not.toBe("Invalid Date");
  });

  it("talla inexistente: lanza", async () => {
    await expect(ds.updateVariantPrice(randomUUID(), 1, 2, owner, null)).rejects.toThrow();
  });

  it("producto desactivado: fuera del catálogo público, no se vende y sus ventas previas siguen en el dashboard", async () => {
    const today = businessDateMx(new Date());
    await sales.createSale(
      { clientRequestId: randomUUID(), locationId: store, channel: "store", paymentMethod: "cash", lines: [{ variantId: V1, quantity: 1, unitPrice: 899 }] },
      owner,
    );
    expect((await getPublicCatalog(new PrismaDataSource(testPrisma))).map((p) => p.title)).toContain("Playera");

    await ds.setProductActive(productId, false);

    expect(await getPublicCatalog(new PrismaDataSource(testPrisma))).toEqual([]);
    await expect(
      sales.createSale(
        { clientRequestId: randomUUID(), locationId: store, channel: "store", paymentMethod: "cash", lines: [{ variantId: V1, quantity: 1, unitPrice: 899 }] },
        owner,
      ),
    ).rejects.toBeInstanceOf(SalesRuleError);
    const d = await sales.getDashboard({ from: today, to: today, locationIds: "all", pendingScope: "all_dates" });
    expect(d.salesCount).toBe(1);
    expect(d.soldTotal).toBe(899);

    await ds.setProductActive(productId, true);
    // Desactivar despublica: reactivar no lo vuelve al sitio hasta un nuevo "Publicar".
    expect(await getPublicCatalog(new PrismaDataSource(testPrisma))).toEqual([]);
    await ds.setProductPublished(productId, true);
    expect((await getPublicCatalog(new PrismaDataSource(testPrisma))).map((p) => p.title)).toContain("Playera");
  });

  it("talla desactivada: ya no se vende ni se publica, la otra sí", async () => {
    await ds.setVariantActive(V1, false);
    await expect(
      sales.createSale(
        { clientRequestId: randomUUID(), locationId: store, channel: "store", paymentMethod: "cash", lines: [{ variantId: V1, quantity: 1, unitPrice: 899 }] },
        owner,
      ),
    ).rejects.toBeInstanceOf(SalesRuleError);
    const catalog = await getPublicCatalog(new PrismaDataSource(testPrisma));
    expect(JSON.stringify(catalog)).not.toContain('"M"');
  });

  it("reactivar una talla con otra igual activa lanza InventoryRuleError; sin duplicado sí reactiva", async () => {
    await ds.setVariantActive(V1, false);
    await testPrisma.variant.create({ data: { productId, title: "m", sku: "SKU-M2", size: "m", price: 1 } });
    await expect(ds.setVariantActive(V1, true)).rejects.toBeInstanceOf(InventoryRuleError);
    expect((await testPrisma.variant.findUniqueOrThrow({ where: { id: V1 } })).isActive).toBe(false);
    await testPrisma.variant.updateMany({ where: { sku: "SKU-M2" }, data: { isActive: false } });
    await ds.setVariantActive(V1, true);
    expect((await testPrisma.variant.findUniqueOrThrow({ where: { id: V1 } })).isActive).toBe(true);
  });

  it("poco stock: no lista tallas de productos desactivados", async () => {
    const today = businessDateMx(new Date());
    const q = { from: today, to: today, locationIds: "all" as const, pendingScope: "all_dates" as const };
    await testPrisma.inventoryLevel.updateMany({ where: { variantId: V1 }, data: { available: 0 } });
    expect((await sales.getDashboard(q)).lowStock.map((l) => l.variantId)).toContain(V1);
    await ds.setProductActive(productId, false);
    expect((await sales.getDashboard(q)).lowStock.map((l) => l.variantId)).not.toContain(V1);
  });

  it("updateProduct cambia título, marca, departamento y categoría sin tocar el código público", async () => {
    const other = await testPrisma.brand.create({ data: { name: "Nike", slug: "nike" } });
    await ds.updateProduct(productId, { title: "Playera lisa", brandId: other.id, brand: "Nike", departmentId: otherDepartmentId, category: "Hoodies" });
    const p = await testPrisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(p).toMatchObject({ title: "Playera lisa", brand: "Nike", brandId: other.id, departmentId: otherDepartmentId, category: "Hoodies", publicCode: "K7Q2M" });
  });

  it("assignDepartment actualiza en lote y devuelve cuántos", async () => {
    const extra = await testPrisma.product.create({ data: { title: "Gorra", brand: "Guess", category: "Accesorios", departmentId } });
    const n = await ds.assignDepartment([productId, extra.id, randomUUID()], otherDepartmentId);
    expect(n).toBe(2);
    const rows = await testPrisma.product.findMany({ select: { departmentId: true } });
    expect(rows.every((r) => r.departmentId === otherDepartmentId)).toBe(true);
  });
});

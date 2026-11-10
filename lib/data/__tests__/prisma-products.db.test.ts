import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { resetDb } from "../../../test/db/reset";

vi.mock("@/lib/prisma", async () => ({ default: (await import("../../../test/db/setup")).testPrisma }));
vi.mock("../../prisma", async () => ({ default: (await import("../../../test/db/setup")).testPrisma }));

import { PrismaDataSource } from "../prisma-source";

describe.skipIf(!hasTestDb)("PrismaDataSource.getProducts (campos de control)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("devuelve brandId, departmentId, mergedIntoId y createdAt", async () => {
    const brand = await testPrisma.brand.create({ data: { name: "Guess", slug: "guess" } });
    const dept = await testPrisma.department.create({ data: { slug: "dama", name: "Dama" } });
    const target = await testPrisma.product.create({
      data: { title: "Destino", brand: "Guess", brandId: brand.id, departmentId: dept.id },
    });
    const merged = await testPrisma.product.create({
      data: { title: "Duplicado", brand: "Guess", mergedIntoId: target.id },
    });

    const products = await new PrismaDataSource().getProducts();
    const t = products.find((p) => p.id === target.id)!;
    const m = products.find((p) => p.id === merged.id)!;

    expect(t.brandId).toBe(brand.id);
    expect(t.departmentId).toBe(dept.id);
    expect(t.mergedIntoId).toBeNull();
    expect(typeof t.createdAt).toBe("string");
    expect(Number.isNaN(Date.parse(t.createdAt!))).toBe(false);
    expect(m.mergedIntoId).toBe(target.id);
    expect(m.brandId).toBeNull();
  });
});

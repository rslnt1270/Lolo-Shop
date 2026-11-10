import { afterAll, describe, expect, it } from "vitest";
import { hasTestDb, testPrisma } from "./setup";
import { resetDb } from "./reset";

describe.skipIf(!hasTestDb)("infra de pruebas contra Postgres", () => {
  afterAll(() => testPrisma.$disconnect());

  it("resetDb deja las tablas vacías", async () => {
    await testPrisma.location.create({ data: { name: "Tienda X", type: "store" } });
    await resetDb();
    expect(await testPrisma.location.count()).toBe(0);
  });
});

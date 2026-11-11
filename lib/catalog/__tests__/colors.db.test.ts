import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, testPrisma } from "../../../test/db/setup";
import { resetDb } from "../../../test/db/reset";
import { BASE_COLORS, normalizeColorKey } from "../../domain/product-reference";
import { addColor, listColors } from "../colors";

describe.skipIf(!hasTestDb)("colores: base + tabla dinámica", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    userId = (await testPrisma.user.create({ data: { username: "owner", password: "x", role: "owner" } })).id;
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('C11 (db): "Rosa" y "rosas" no crean dos colores', async () => {
    const a = await addColor("Turquesa", userId, testPrisma);
    const b = await addColor("turquesas", userId, testPrisma);
    expect(b.label).toBe(a.label);
    expect(await testPrisma.colorOption.count({ where: { key: normalizeColorKey("Turquesa") } })).toBe(1);
    const rosa = await addColor("rosas", userId, testPrisma);
    expect(rosa.label).toBe("Rosa");
    const list = await listColors(testPrisma);
    expect(list.filter((c) => normalizeColorKey(c) === normalizeColorKey("Turquesa"))).toHaveLength(1);
    expect(list.filter((c) => normalizeColorKey(c) === normalizeColorKey("Rosa"))).toHaveLength(1);
  });

  it("un color base no crea fila nueva y los base van primero", async () => {
    expect((await addColor("MORADO", userId, testPrisma)).label).toBe("Morado");
    expect(await testPrisma.colorOption.count()).toBe(0);
    await addColor("Vino", userId, testPrisma);
    const list = await listColors(testPrisma);
    expect(list.slice(0, BASE_COLORS.length)).toEqual([...BASE_COLORS]);
    expect(list[list.length - 1]).toBe("Vino");
  });

  it("dos addColor en paralelo con la misma clave no fallan", async () => {
    const [a, b] = await Promise.all([addColor("Lila", userId, testPrisma), addColor("lilas", userId, testPrisma)]);
    expect(a.label).toBe(b.label);
    expect(await testPrisma.colorOption.count()).toBe(1);
  });

  it("listColors lee etiquetas de la tabla sin repetir las de H", async () => {
    await testPrisma.colorOption.create({ data: { key: normalizeColorKey("Mostaza"), label: "Mostaza" } });
    expect(await listColors(testPrisma)).toContain("Mostaza");
    expect((await addColor("mostazas", userId, testPrisma)).label).toBe("Mostaza");
  });
});

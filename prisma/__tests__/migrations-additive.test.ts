// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), "prisma", "migrations");
const folder = readdirSync(dir).find((d) => d.endsWith("_inventory_controls"));
const sql = folder ? readFileSync(join(dir, folder, "migration.sql"), "utf8") : "";

describe("migración inventory_controls", () => {
  it("existe la carpeta", () => {
    expect(folder).toBeDefined();
  });

  it("crea PriceChange y agrega requestId", () => {
    expect(sql).toContain('CREATE TABLE "PriceChange"');
    expect(sql).toMatch(/ADD COLUMN\s+"requestId"/);
  });

  it("es aditiva: sin DROP, ALTER COLUMN, SET NOT NULL ni CHECK", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/ALTER COLUMN/i);
    expect(sql).not.toMatch(/SET NOT NULL/i);
    expect(sql).not.toMatch(/\bCHECK\b/i);
  });

  it("ningún ADD COLUMN es NOT NULL", () => {
    const adds = sql.split("\n").filter((l) => /ADD COLUMN/i.test(l));
    expect(adds.length).toBeGreaterThan(0);
    for (const l of adds) expect(l).not.toMatch(/NOT NULL/i);
  });
});

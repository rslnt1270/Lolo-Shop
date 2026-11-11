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

describe("migración add_product_types", () => {
  const f = readdirSync(dir).find((d) => d.endsWith("_add_product_types"));
  const s = f ? readFileSync(join(dir, f, "migration.sql"), "utf8") : "";

  it("existe la carpeta *_add_product_types con timestamp posterior a 20261110120000", () => {
    expect(f).toBeDefined();
    expect(f!.split("_")[0] > "20261110120000").toBe(true);
  });

  it("crea ProductType y DepartmentProductType", () => {
    expect(s).toContain('CREATE TABLE "ProductType"');
    expect(s).toContain('CREATE TABLE "DepartmentProductType"');
  });

  it("agrega productTypeId exactamente 2 veces (Product y SaleLine)", () => {
    expect((s.match(/ADD COLUMN\s+"productTypeId"/g) ?? []).length).toBe(2);
    expect(s).toMatch(/ALTER TABLE "Product" ADD COLUMN[^;]*"productTypeId"/);
    expect(s).toMatch(/ALTER TABLE "SaleLine"\s+ADD COLUMN\s+"productTypeId"/);
  });

  it("agrega style y audience solo en Product", () => {
    expect((s.match(/ADD COLUMN\s+"style"/g) ?? []).length).toBe(1);
    expect((s.match(/ADD COLUMN\s+"audience"/g) ?? []).length).toBe(1);
    expect(s).not.toMatch(/ALTER TABLE "SaleLine"[^;]*"(style|audience)"/);
  });

  it("no contiene DROP, ALTER COLUMN, SET NOT NULL ni CHECK", () => {
    expect(s).not.toMatch(/\bDROP\b/i);
    expect(s).not.toMatch(/ALTER COLUMN/i);
    expect(s).not.toMatch(/SET NOT NULL/i);
    expect(s).not.toMatch(/\bCHECK\b/i);
  });

  it("ningún ADD COLUMN nuevo es NOT NULL", () => {
    const adds = s.split("\n").filter((l) => /ADD COLUMN/i.test(l));
    expect(adds.length).toBeGreaterThan(0);
    for (const l of adds) expect(l).not.toMatch(/NOT NULL/i);
  });
});

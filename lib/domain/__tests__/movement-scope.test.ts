import { describe, it, expect } from "vitest";
import { scopeMovementQuery, mexicoRangeToUtc, inclusiveDays } from "../movement-scope";
import { addDays } from "../../sales/format";

const TODAY = "2026-11-10";

describe("scopeMovementQuery", () => {
  it("colaborador pidiendo otra tienda y otro día: recibe su tienda y hoy", () => {
    const r = scopeMovementQuery(
      { role: "collaborator", locationId: "lomas" },
      { locationId: "club", from: "2026-10-01", to: "2026-10-05" },
      TODAY,
    );
    expect(r).toEqual({ ok: true, query: { locationIds: ["lomas"], from: TODAY, to: TODAY } });
  });

  it("colaborador sin tienda: lista vacía (no ve nada)", () => {
    const r = scopeMovementQuery({ role: "collaborator", locationId: null }, {}, TODAY);
    expect(r).toEqual({ ok: true, query: { locationIds: [], from: TODAY, to: TODAY } });
  });

  it("manager con tienda: su tienda aunque pida otra", () => {
    const r = scopeMovementQuery({ role: "manager", locationId: "lomas" }, { locationId: "club" }, TODAY);
    expect(r).toMatchObject({ ok: true, query: { locationIds: ["lomas"] } });
  });

  it("owner sin filtros: todas las tiendas y hoy", () => {
    expect(scopeMovementQuery({ role: "owner", locationId: null }, {}, TODAY)).toEqual({
      ok: true,
      query: { locationIds: "all", from: TODAY, to: TODAY },
    });
  });

  it("owner conserva tienda, tipo, persona, prenda y cursor; ignora un tipo desconocido", () => {
    const r = scopeMovementQuery(
      { role: "owner", locationId: null },
      { locationId: "club", type: "DAMAGE", userId: "u1", variantId: "v1", cursor: "c1" },
      TODAY,
    );
    expect(r).toEqual({
      ok: true,
      query: { locationIds: ["club"], type: "DAMAGE", userId: "u1", variantId: "v1", cursor: "c1", from: TODAY, to: TODAY },
    });
    const bad = scopeMovementQuery({ role: "owner", locationId: null }, { type: "DROP TABLE" }, TODAY);
    expect(bad).toMatchObject({ ok: true });
    expect((bad as { query: { type?: string } }).query.type).toBeUndefined();
  });

  it("93 días inclusivos: ok; 94: error con el mensaje", () => {
    const owner = { role: "owner" as const, locationId: null };
    expect(scopeMovementQuery(owner, { from: addDays(TODAY, -92), to: TODAY }, TODAY)).toMatchObject({ ok: true });
    expect(scopeMovementQuery(owner, { from: addDays(TODAY, -93), to: TODAY }, TODAY)).toEqual({
      ok: false,
      message: "El rango máximo es de 93 días.",
    });
  });

  it("fechas invertidas se acomodan; fechas basura caen a hoy", () => {
    const owner = { role: "owner" as const, locationId: null };
    expect(scopeMovementQuery(owner, { from: "2026-11-09", to: "2026-11-01" }, TODAY)).toMatchObject({
      query: { from: "2026-11-01", to: "2026-11-09" },
    });
    expect(scopeMovementQuery(owner, { from: "2026-02-31", to: "x" }, TODAY)).toMatchObject({
      query: { from: TODAY, to: TODAY },
    });
  });
});

describe("mexicoRangeToUtc", () => {
  it("el día de México va de 06:00Z a 06:00Z del día siguiente", () => {
    const { gte, lt } = mexicoRangeToUtc("2026-11-10", "2026-11-10");
    expect(gte.toISOString()).toBe("2026-11-10T06:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-11-11T06:00:00.000Z");
  });
  it("un movimiento a las 23:30 de México del día 10 (05:30Z del 11) cae en el 10, no en el 11", () => {
    const at = new Date("2026-11-11T05:30:00Z").getTime();
    const d10 = mexicoRangeToUtc("2026-11-10", "2026-11-10");
    const d11 = mexicoRangeToUtc("2026-11-11", "2026-11-11");
    expect(at >= d10.gte.getTime() && at < d10.lt.getTime()).toBe(true);
    expect(at >= d11.gte.getTime() && at < d11.lt.getTime()).toBe(false);
  });
  it("00:10 de México del día 11 (06:10Z) cae en el 11", () => {
    const at = new Date("2026-11-11T06:10:00Z").getTime();
    const d11 = mexicoRangeToUtc("2026-11-11", "2026-11-11");
    expect(at >= d11.gte.getTime() && at < d11.lt.getTime()).toBe(true);
  });
  it("inclusiveDays cuenta los dos extremos", () => {
    expect(inclusiveDays("2026-11-10", "2026-11-10")).toBe(1);
  });
});

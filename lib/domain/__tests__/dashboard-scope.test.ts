import { describe, expect, it } from "vitest";
import { scopeDashboardQuery } from "../dashboard-scope";

const today = "2026-11-05";

describe("scopeDashboardQuery", () => {
  it("collaborator: solo hoy y su tienda aunque pida otro rango y all", () => {
    const q = scopeDashboardQuery(
      { role: "collaborator", locationId: "A" },
      { from: "2026-10-01", to: "2026-11-05", locationIds: "all" },
      today,
    );
    expect(q).toEqual({ from: today, to: today, locationIds: ["A"] });
  });

  it("collaborator sin tienda no ve ninguna", () => {
    expect(scopeDashboardQuery({ role: "collaborator", locationId: null }, {}, today).locationIds).toEqual([]);
  });

  it("owner sin petición: últimos 30 días terminando hoy y all", () => {
    expect(scopeDashboardQuery({ role: "owner", locationId: null }, {}, today)).toEqual({
      from: "2026-10-07",
      to: today,
      locationIds: "all",
    });
  });

  it("owner respeta rango y tiendas pedidas", () => {
    expect(
      scopeDashboardQuery({ role: "owner", locationId: null }, { from: "2026-10-01", to: "2026-10-31", locationIds: ["B"] }, today),
    ).toEqual({ from: "2026-10-01", to: "2026-10-31", locationIds: ["B"] });
  });

  it("manager de A que pide all recibe [A]; ids ajenos se descartan", () => {
    const m = { role: "manager" as const, locationId: "A" };
    expect(scopeDashboardQuery(m, { locationIds: "all" }, today).locationIds).toEqual(["A"]);
    expect(scopeDashboardQuery(m, { locationIds: ["B"] }, today).locationIds).toEqual(["A"]);
  });

  it("manager sin tienda recibe all", () => {
    expect(scopeDashboardQuery({ role: "manager", locationId: null }, {}, today).locationIds).toBe("all");
  });

  it("si from > to se intercambian", () => {
    const q = scopeDashboardQuery({ role: "owner", locationId: null }, { from: "2026-11-05", to: "2026-10-01" }, today);
    expect([q.from, q.to]).toEqual(["2026-10-01", "2026-11-05"]);
  });

  it("fechas inválidas caen al valor por defecto", () => {
    const q = scopeDashboardQuery({ role: "owner", locationId: null }, { from: "basura", to: "2026-13-45" }, today);
    expect(q).toEqual({ from: "2026-10-07", to: today, locationIds: "all" });
  });
});

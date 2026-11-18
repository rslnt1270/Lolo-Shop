import { describe, expect, it } from "vitest";
import { scopeDashboardQuery } from "../dashboard-scope";

const today = "2026-11-05";

describe("scopeDashboardQuery", () => {
  it("collaborator: solo hoy y la tienda pedida (no la asignada) aunque pida otro rango", () => {
    const q = scopeDashboardQuery(
      { role: "collaborator", locationId: "A" },
      { locationIds: ["B"], from: "2026-01-01" },
      today,
    );
    expect(q).toEqual({ from: today, to: today, locationIds: ["B"], pendingScope: "range" });
  });

  it("collaborator con all o sin locationIds pedido: ninguna tienda", () => {
    expect(scopeDashboardQuery({ role: "collaborator", locationId: "A" }, { locationIds: "all" }, today).locationIds).toEqual([]);
    expect(scopeDashboardQuery({ role: "collaborator", locationId: "A" }, {}, today).locationIds).toEqual([]);
    expect(scopeDashboardQuery({ role: "collaborator", locationId: null }, {}, today).locationIds).toEqual([]);
    expect(scopeDashboardQuery({ role: "collaborator", locationId: null }, { locationIds: [""] }, today).locationIds).toEqual([]);
    expect(scopeDashboardQuery({ role: "collaborator", locationId: null }, { locationIds: [5] as unknown as string[] }, today).locationIds).toEqual([]);
  });

  it("owner sin petición: últimos 30 días terminando hoy y all", () => {
    expect(scopeDashboardQuery({ role: "owner", locationId: null }, {}, today)).toEqual({
      from: "2026-10-07",
      to: today,
      locationIds: "all",
      pendingScope: "all_dates",
      recentSalesDate: today,
    });
  });

  it("owner respeta rango y tiendas pedidas", () => {
    expect(
      scopeDashboardQuery({ role: "owner", locationId: null }, { from: "2026-10-01", to: "2026-10-31", locationIds: ["B"] }, today),
    ).toEqual({ from: "2026-10-01", to: "2026-10-31", locationIds: ["B"], pendingScope: "all_dates", recentSalesDate: today });
  });

  it("encargado con tienda A que pide B y un rango recibe B y el rango, sin recentSalesDate", () => {
    const m = { role: "manager" as const, locationId: "A" };
    const q = scopeDashboardQuery(m, { locationIds: ["B"], from: "2026-10-01", to: "2026-10-31" }, today);
    expect(q).toEqual({ from: "2026-10-01", to: "2026-10-31", locationIds: ["B"], pendingScope: "all_dates" });
    expect(q).not.toHaveProperty("recentSalesDate");
    expect(scopeDashboardQuery(m, { locationIds: "all" }, today).locationIds).toBe("all");
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
    expect(q).toEqual({ from: "2026-10-07", to: today, locationIds: "all", pendingScope: "all_dates", recentSalesDate: today });
  });

  it("manager: pendingScope all_dates", () => {
    expect(scopeDashboardQuery({ role: "manager", locationId: "A" }, {}, today).pendingScope).toBe("all_dates");
    expect(scopeDashboardQuery({ role: "manager", locationId: null }, {}, today).pendingScope).toBe("all_dates");
  });

  it("descarta ids de tienda no textuales o vacíos del cliente", () => {
    const o = { role: "owner" as const, locationId: null };
    const bad = ["B", "", "  ", 5, null, "B"] as unknown as string[];
    expect(scopeDashboardQuery(o, { locationIds: bad }, today).locationIds).toEqual(["B"]);
  });

  it("Ventas de hoy: solo el owner, siempre con el día en curso aunque pida otro", () => {
    const asked = { recentSalesDate: "2020-01-01", from: "2026-10-01", to: "2026-10-02" };
    expect(scopeDashboardQuery({ role: "owner", locationId: null }, asked, today).recentSalesDate).toBe(today);
    expect(scopeDashboardQuery({ role: "manager", locationId: "A" }, asked, today)).not.toHaveProperty("recentSalesDate");
    expect(scopeDashboardQuery({ role: "manager", locationId: null }, asked, today)).not.toHaveProperty("recentSalesDate");
    expect(scopeDashboardQuery({ role: "collaborator", locationId: "A" }, asked, today)).not.toHaveProperty("recentSalesDate");
  });
});

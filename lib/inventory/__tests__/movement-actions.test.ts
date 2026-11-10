import { describe, it, expect, vi, beforeEach } from "vitest";
import { FixtureDataSource } from "@/lib/data/fixture-source";
import { UnauthenticatedError } from "@/lib/auth/errors";
import { addDays, businessTodayMx } from "@/lib/sales/format";

const getCurrentUser = vi.fn();
let ds: FixtureDataSource;
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/data/get-source", () => ({ getDataSource: () => ds }));

import { listMovementsAction, movementFilterOptionsAction } from "../movement-actions";

const OWNER = { id: "u-owner", role: "owner", locationId: null };
const COLAB = { id: "u-col", role: "collaborator", locationId: "loc-1" };
const REQ = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

beforeEach(async () => {
  vi.clearAllMocks();
  ds = new FixtureDataSource();
  getCurrentUser.mockResolvedValue(OWNER);
  await ds.recordStockMovement({ variantId: "var-1", locationId: "loc-1", type: "DAMAGE", delta: -1, notes: "mancha", requestId: REQ(1), userId: "u-owner" });
  await ds.recordStockMovement({ variantId: "var-1", locationId: "loc-2", type: "RESTOCK", delta: 2, notes: null, requestId: REQ(2), userId: "u-col" });
});

describe("listMovementsAction", () => {
  it("sesión vencida: null y no toca el data source", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    const spy = vi.spyOn(ds, "listMovements");
    await expect(listMovementsAction({})).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("94 días: { error } sin lanzar", async () => {
    const today = businessTodayMx();
    const res = await listMovementsAction({ from: addDays(today, -93), to: today });
    expect(res).toEqual({ error: "El rango máximo es de 93 días." });
  });

  it("owner ve los movimientos de hoy de todas las tiendas, el más nuevo primero, con tipo en español", async () => {
    const res = await listMovementsAction({});
    expect(res && !("error" in res)).toBe(true);
    const page = res as { rows: { typeLabel: string; delta: number; notes: string | null; locationName: string }[]; nextCursor: string | null };
    expect(page.rows).toHaveLength(2);
    expect(page.rows[0]).toMatchObject({ typeLabel: "Entrada", delta: 2 });
    expect(page.rows[1]).toMatchObject({ typeLabel: "Merma", delta: -1, notes: "mancha", locationName: "Tienda 1" });
    expect(page.nextCursor).toBeNull();
  });

  it("colaborador pidiendo otra tienda y otro día recibe solo su tienda y hoy", async () => {
    getCurrentUser.mockResolvedValue(COLAB);
    const res = (await listMovementsAction({ locationId: "loc-2", from: "2020-01-01", to: "2020-01-02" })) as { rows: { locationName: string }[] };
    expect(res.rows.map((r) => r.locationName)).toEqual(["Tienda 1"]);
  });

  it("filtra por tipo y por persona", async () => {
    const byType = (await listMovementsAction({ type: "RESTOCK" })) as { rows: unknown[] };
    expect(byType.rows).toHaveLength(1);
    const byUser = (await listMovementsAction({ userId: "u-owner" })) as { rows: { typeLabel: string }[] };
    expect(byUser.rows.map((r) => r.typeLabel)).toEqual(["Merma"]);
  });

  it("ningún renglón trae la clave customerAlias", async () => {
    const res = (await listMovementsAction({})) as { rows: object[] };
    for (const r of res.rows) expect("customerAlias" in r).toBe(false);
  });

  it("si el data source falla devuelve { error } en vez de lanzar", async () => {
    vi.spyOn(ds, "listMovements").mockRejectedValue(new Error("db"));
    const res = await listMovementsAction({});
    expect(res).toEqual({ error: "No se pudo cargar el historial. Intenta de nuevo." });
  });
});

describe("movementFilterOptionsAction", () => {
  it("sesión vencida: null", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    await expect(movementFilterOptionsAction()).resolves.toBeNull();
  });
  it("owner: tiendas y personas; colaborador: sin personas", async () => {
    const o = await movementFilterOptionsAction();
    expect(o?.locations.map((l) => l.id)).toEqual(["loc-1", "loc-2"]);
    expect(o?.users.map((u) => u.id).sort()).toEqual(["u-col", "u-owner"]);
    getCurrentUser.mockResolvedValue(COLAB);
    expect((await movementFilterOptionsAction())?.users).toEqual([]);
  });
});

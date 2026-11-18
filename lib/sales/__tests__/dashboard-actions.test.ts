import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const getLocations = vi.fn();
const source = { getDashboard: vi.fn(), getLowStockThreshold: vi.fn(), setLowStockThreshold: vi.fn() };
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/data/get-sales-source", () => ({ getSalesSource: () => source }));
vi.mock("@/lib/data/get-source", () => ({ getDataSource: () => ({ getLocations }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getDashboardAction, getLowStockThresholdAction, setLowStockThresholdAction } from "../dashboard-actions";
import { UnauthenticatedError } from "@/lib/auth/errors";

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockRejectedValue(new UnauthenticatedError());
});

describe("dashboard-actions con sesión vencida", () => {
  it("getDashboardAction responde session_expired sin lanzar", async () => {
    await expect(getDashboardAction({})).resolves.toEqual({ error: "session_expired" });
    expect(source.getDashboard).not.toHaveBeenCalled();
  });
  it("getLowStockThresholdAction responde null sin lanzar", async () => {
    await expect(getLowStockThresholdAction()).resolves.toBeNull();
  });
  it("setLowStockThresholdAction responde ok:false con el aviso de sesión", async () => {
    await expect(setLowStockThresholdAction(3)).resolves.toEqual({
      ok: false,
      message: "Tu sesión terminó. Vuelve a iniciar sesión.",
      reason: "session_expired",
    });
  });
  it("otro error al leer el usuario se propaga", async () => {
    getCurrentUser.mockRejectedValue(new Error("db caída"));
    await expect(getDashboardAction({})).rejects.toThrow("db caída");
  });
});

describe("pendingReviewCount solo para el dueño", () => {
  const data = () => ({ pendingReviewCount: 3, pendingReviewTotal: 500, salesCount: 1 });
  it.each(["manager", "collaborator"])("%s recibe 0", async (role) => {
    getCurrentUser.mockResolvedValue({ id: "u", role, locationId: "l1" });
    source.getDashboard.mockResolvedValue(data());
    const res = await getDashboardAction({});
    expect((res as { data: { pendingReviewCount: number } }).data.pendingReviewCount).toBe(0);
    expect((res as { data: { pendingReviewTotal: number } }).data.pendingReviewTotal).toBe(0);
  });
  it("el dueño recibe el número real", async () => {
    getCurrentUser.mockResolvedValue({ id: "u", role: "owner", locationId: null });
    source.getDashboard.mockResolvedValue(data());
    const res = await getDashboardAction({});
    expect((res as { data: { pendingReviewCount: number } }).data.pendingReviewCount).toBe(3);
    expect((res as { data: { pendingReviewTotal: number } }).data.pendingReviewTotal).toBe(500);
  });
});

describe("tienda pedida por el colaborador", () => {
  beforeEach(() => {
    getLocations.mockResolvedValue([{ id: "A" }, { id: "B" }]);
    source.getDashboard.mockResolvedValue({ pendingReviewCount: 0, pendingReviewTotal: 0 });
    getCurrentUser.mockResolvedValue({ id: "u", role: "collaborator", locationId: "A" });
  });
  const sent = () => source.getDashboard.mock.calls[0][0];

  it("conserva un id que existe", async () => {
    await getDashboardAction({ locationIds: ["B"] });
    expect(sent().locationIds).toEqual(["B"]);
  });
  it("id inexistente: la consulta llega con [] y no lanza", async () => {
    await expect(getDashboardAction({ locationIds: ["zzz"], from: "2020-01-01" })).resolves.toHaveProperty("data");
    expect(sent().locationIds).toEqual([]);
    expect(sent().from).toBe(sent().to);
  });
  it("sin id pedido: []", async () => {
    await getDashboardAction({});
    expect(sent().locationIds).toEqual([]);
  });
  it("el dueño no consulta las tiendas", async () => {
    getCurrentUser.mockResolvedValue({ id: "u", role: "owner", locationId: null });
    await getDashboardAction({ locationIds: ["zzz"] });
    expect(getLocations).not.toHaveBeenCalled();
    expect(sent().locationIds).toEqual(["zzz"]);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const source = { getDashboard: vi.fn(), getLowStockThreshold: vi.fn(), setLowStockThreshold: vi.fn() };
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/data/get-sales-source", () => ({ getSalesSource: () => source }));
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
    });
  });
  it("otro error al leer el usuario se propaga", async () => {
    getCurrentUser.mockRejectedValue(new Error("db caída"));
    await expect(getDashboardAction({})).rejects.toThrow("db caída");
  });
});

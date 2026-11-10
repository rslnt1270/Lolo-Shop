import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));

import { assertCanOperate, requireRole, isStoreBound, currentUserOrNull } from "../permissions";
import { ForbiddenError, UnauthenticatedError } from "../errors";
import type { CurrentUser } from "../current-user";

const u = (role: CurrentUser["role"], locationId: string | null): CurrentUser => ({ id: "u1", role, locationId });

describe("assertCanOperate", () => {
  it("colaborador en su tienda pasa", () => {
    expect(() => assertCanOperate(u("collaborator", "L"), "L")).not.toThrow();
  });
  it("colaborador en otra tienda lanza ForbiddenError", () => {
    expect(() => assertCanOperate(u("collaborator", "L"), "C")).toThrow(ForbiddenError);
  });
  it("colaborador sin tienda lanza", () => {
    expect(() => assertCanOperate(u("collaborator", null), "L")).toThrow(ForbiddenError);
  });
  it("manager con tienda L en C lanza", () => {
    expect(() => assertCanOperate(u("manager", "L"), "C")).toThrow(ForbiddenError);
  });
  it("manager sin tienda y owner pasan en cualquiera", () => {
    expect(() => assertCanOperate(u("manager", null), "C")).not.toThrow();
    expect(() => assertCanOperate(u("owner", null), "C")).not.toThrow();
  });
});

describe("isStoreBound", () => {
  it("colaborador y manager con tienda sí; owner y manager sin tienda no", () => {
    expect(isStoreBound(u("collaborator", null))).toBe(true);
    expect(isStoreBound(u("manager", "L"))).toBe(true);
    expect(isStoreBound(u("manager", null))).toBe(false);
    expect(isStoreBound(u("owner", null))).toBe(false);
  });
});

describe("requireRole", () => {
  it("colaborador fuera de [owner, manager] lanza; owner pasa", () => {
    expect(() => requireRole(u("collaborator", "L"), ["owner", "manager"])).toThrow(ForbiddenError);
    expect(() => requireRole(u("owner", null), ["owner", "manager"])).not.toThrow();
  });
});

describe("currentUserOrNull", () => {
  beforeEach(() => { getCurrentUser.mockReset(); });
  it("null ante UnauthenticatedError", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    expect(await currentUserOrNull()).toBeNull();
  });
  it("relanza otros errores", async () => {
    getCurrentUser.mockRejectedValue(new Error("db caída"));
    await expect(currentUserOrNull()).rejects.toThrow("db caída");
  });
  it("devuelve el usuario", async () => {
    getCurrentUser.mockResolvedValue(u("owner", null));
    expect(await currentUserOrNull()).toMatchObject({ id: "u1" });
  });
});

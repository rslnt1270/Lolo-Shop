import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));

import { assertCanOperate, requireRole, currentUserOrNull, PRICE_EDIT_ROLES } from "../permissions";
import { ForbiddenError, UnauthenticatedError } from "../errors";
import type { CurrentUser } from "../current-user";

const u = (role: CurrentUser["role"], locationId: string | null): CurrentUser => ({ id: "u1", role, locationId });

describe("assertCanOperate", () => {
  it("colaborador opera en su tienda y en otra", () => {
    expect(() => assertCanOperate(u("collaborator", "L"), "L")).not.toThrow();
    expect(() => assertCanOperate(u("collaborator", "L"), "C")).not.toThrow();
  });
  it("colaborador sin tienda asignada opera en cualquiera", () => {
    expect(() => assertCanOperate(u("collaborator", null), "L")).not.toThrow();
  });
  it("manager con tienda L opera en C", () => {
    expect(() => assertCanOperate(u("manager", "L"), "C")).not.toThrow();
  });
  it("manager sin tienda y owner pasan en cualquiera", () => {
    expect(() => assertCanOperate(u("manager", null), "C")).not.toThrow();
    expect(() => assertCanOperate(u("owner", null), "C")).not.toThrow();
  });
  it.each([["collaborator"], ["manager"], ["owner"]] as const)(
    "%s sin tienda elegida (texto vacío) lanza \"Elige en qué tienda estás.\"",
    (role) => {
      expect(() => assertCanOperate(u(role, "L"), "")).toThrow(new ForbiddenError("Elige en qué tienda estás."));
      expect(() => assertCanOperate(u(role, "L"), "")).toThrow(ForbiddenError);
    },
  );
  it("tienda que no es texto lanza ForbiddenError", () => {
    expect(() => assertCanOperate(u("owner", null), undefined as unknown as string)).toThrow(
      "Elige en qué tienda estás.",
    );
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

describe("PRICE_EDIT_ROLES", () => {
  it("incluye owner, manager y collaborator; excluye cualquier otro valor", () => {
    expect([...PRICE_EDIT_ROLES].sort()).toEqual(["collaborator", "manager", "owner"]);
  });
});

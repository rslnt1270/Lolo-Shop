import { describe, it, expect, vi, beforeEach } from "vitest";

const getServerSession = vi.fn();
const findUnique = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock("../options", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ default: { user: { findUnique: (a: unknown) => findUnique(a) } } }));

import { getCurrentUser } from "../current-user";
import { UnauthenticatedError } from "../errors";

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "u1", role: "owner" } });
});

describe("getCurrentUser", () => {
  it("el rol sale de la base, no de la sesión", async () => {
    findUnique.mockResolvedValue({ id: "u1", role: "collaborator", locationId: "loc-1" });
    await expect(getCurrentUser()).resolves.toEqual({ id: "u1", role: "collaborator", locationId: "loc-1" });
  });

  it("usuario que ya no existe en la base: UnauthenticatedError", async () => {
    findUnique.mockResolvedValue(null);
    await expect(getCurrentUser()).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

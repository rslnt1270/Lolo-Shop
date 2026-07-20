import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: { user: { findUnique: mocks.findUnique } },
}));

import { findUser } from "../users";

const HASH_LOLO = bcrypt.hashSync("lolo123", 4);
const HASH_COLAB = bcrypt.hashSync("colab123", 4);

describe("findUser", () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
  });

  it("autentica al dueño con rol owner y sin tienda fija", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "u1",
      username: "lolo",
      name: "Dueño",
      password: HASH_LOLO,
      role: "owner",
      locationId: null,
    });
    const u = await findUser("lolo", "lolo123");
    expect(u?.role).toBe("owner");
    expect(u?.locationId).toBeNull();
    expect(u).not.toHaveProperty("password");
  });

  it("autentica colaborador con su tienda asignada", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "u3",
      username: "colab1",
      name: "Colaborador Tienda 1",
      password: HASH_COLAB,
      role: "collaborator",
      locationId: "loc-1",
    });
    const u = await findUser("colab1", "colab123");
    expect(u?.role).toBe("collaborator");
    expect(u?.locationId).toBe("loc-1");
  });

  it("rechaza contraseña incorrecta", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "u1",
      username: "lolo",
      name: "Dueño",
      password: HASH_LOLO,
      role: "owner",
      locationId: null,
    });
    expect(await findUser("lolo", "malo")).toBeNull();
  });

  it("rechaza usuario inexistente", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await findUser("nadie", "x")).toBeNull();
  });
});

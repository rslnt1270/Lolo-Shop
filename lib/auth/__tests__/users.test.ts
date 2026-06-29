import { describe, it, expect } from "vitest";
import { findUser } from "../users";

describe("findUser", () => {
  it("autentica al dueño con rol owner y sin tienda fija", () => {
    const u = findUser("lolo", "lolo123");
    expect(u?.role).toBe("owner");
    expect(u?.locationId).toBeNull();
  });

  it("autentica colaborador con su tienda asignada", () => {
    const u = findUser("colab1", "colab123");
    expect(u?.role).toBe("collaborator");
    expect(u?.locationId).toBe("loc-1");
  });

  it("rechaza contraseña incorrecta", () => {
    expect(findUser("lolo", "malo")).toBeNull();
  });

  it("rechaza usuario inexistente", () => {
    expect(findUser("nadie", "x")).toBeNull();
  });
});

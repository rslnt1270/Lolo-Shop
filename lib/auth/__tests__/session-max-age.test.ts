import { describe, it, expect, vi } from "vitest";

vi.mock("../users", () => ({ findUser: vi.fn() }));

import { authOptions } from "../options";

describe("sesión de 12 h", () => {
  it("el JWT vence a las 12 h (la identidad sin conexión usa el mismo límite)", () => {
    expect(authOptions.session?.strategy).toBe("jwt");
    expect(authOptions.session?.maxAge).toBe(12 * 60 * 60);
    expect(authOptions.jwt?.maxAge ?? authOptions.session?.maxAge).toBe(12 * 60 * 60);
  });
});

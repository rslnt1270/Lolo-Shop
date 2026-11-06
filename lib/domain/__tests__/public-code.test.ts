import { describe, it, expect } from "vitest";
import { generatePublicCode } from "../public-code";

describe("generatePublicCode", () => {
  it("usa 5 caracteres Crockford sin I, L, O, U", () => {
    for (let i = 0; i < 1000; i++) {
      expect(generatePublicCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}$/);
    }
  });
  it("es determinista con un random inyectado", () => {
    expect(generatePublicCode(() => 0)).toBe("00000");
    expect(generatePublicCode(() => 0.999999)).toBe("ZZZZZ");
  });
});

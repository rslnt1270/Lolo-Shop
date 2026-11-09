import { describe, it, expect } from "vitest";
import { generatePublicCode, normalizePublicCode, parsePublicCodeRequest } from "../public-code";

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
  it("acota un random fuera de rango", () => {
    expect(generatePublicCode(() => 1)).toBe("ZZZZZ");
    expect(generatePublicCode(() => -1)).toBe("00000");
    expect(generatePublicCode(() => NaN)).toBe("00000");
  });
});

describe("normalizePublicCode", () => {
  it("pasa a mayúsculas y recorta espacios", () => {
    expect(normalizePublicCode("  k7q2m ")).toBe("K7Q2M");
  });
  it("lee O como 0 e I/L como 1 (Crockford)", () => {
    expect(normalizePublicCode("KOQ2M")).toBe("K0Q2M");
    expect(normalizePublicCode("kiq2l")).toBe("K1Q21");
    expect(normalizePublicCode("oil00")).toBe("01100");
  });
  it("U sigue siendo inválida", () => {
    expect(normalizePublicCode("K7Q2U")).toBeNull();
  });
  it("rechaza largo distinto de 5", () => {
    expect(normalizePublicCode("K7Q2")).toBeNull();
    expect(normalizePublicCode("K7Q2MM")).toBeNull();
  });
  it("el parser del mensaje aplica la misma lectura", () => {
    expect(parsePublicCodeRequest("Hola, código KOQ2M talla m")).toEqual({ kind: "ok", code: "K0Q2M", size: "M" });
  });
});

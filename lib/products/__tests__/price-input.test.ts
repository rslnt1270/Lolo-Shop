import { describe, it, expect } from "vitest";
import { isBigPriceDrop, isBigPriceRise, parsePriceInput } from "@/lib/products/price-input";

describe("parsePriceInput (es-MX: la coma separa miles)", () => {
  it("'1,250' es 1250, no 1.25", () => {
    expect(parsePriceInput("1,250")).toBe(1250);
  });
  it("'1,234.50' es 1234.5", () => {
    expect(parsePriceInput("1,234.50")).toBe(1234.5);
  });
  it("acepta enteros y hasta dos decimales con espacios alrededor", () => {
    expect(parsePriceInput(" 899 ")).toBe(899);
    expect(parsePriceInput("320.5")).toBe(320.5);
    expect(parsePriceInput("12,345,678.99")).toBe(12345678.99);
  });
  it("rechaza vacío, letras, tres decimales, signos y puntos sueltos", () => {
    for (const bad of ["", "  ", "abc", "1.234", "-5", "1.2.3", ".5", "5.", "$100", "1 250"]) {
      expect(parsePriceInput(bad), bad).toBeNull();
    }
  });
});

describe("isBigPriceDrop", () => {
  it("es true cuando el precio nuevo es menor que la mitad del vigente", () => {
    expect(isBigPriceDrop(899, 400)).toBe(true);
    expect(isBigPriceDrop(899, 449.5)).toBe(false);
    expect(isBigPriceDrop(899, 1000)).toBe(false);
  });
});

describe("residual 2: coma con centavos", () => {
  it("'350,50' se rechaza; '1,250' y '1,250.50' siguen válidos", () => {
    expect(parsePriceInput("350,50")).toBeNull();
    expect(parsePriceInput("1,250")).toBe(1250);
    expect(parsePriceInput("1,250.50")).toBe(1250.5);
  });
});

describe("isBigPriceRise", () => {
  it("es true solo si el nuevo supera el doble del vigente", () => {
    expect(isBigPriceRise(350, 900)).toBe(true);
    expect(isBigPriceRise(350, 700)).toBe(false);
    expect(isBigPriceRise(0, 900)).toBe(false);
  });
});

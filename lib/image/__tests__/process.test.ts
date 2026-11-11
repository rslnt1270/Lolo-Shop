import { describe, it, expect } from "vitest";
import {
  computeSquareCrop,
  autoLevels,
  analyzeBackground,
  BG_MIN_LUMA,
  BG_MAX_LUMA_STDDEV,
  BG_MIN_WHITE_FRACTION,
} from "@/lib/image/process";
import {
  WHITE,
  OFFWHITE_NOISE,
  WHITE_WITH_PRODUCT,
  RED_WALL,
  GRAY_WALL,
  SHADOW_BOTTOM,
  GRADIENT,
  TINY,
  IMAGE_SIZE as S,
} from "./fixtures/background";

describe("computeSquareCrop", () => {
  it("recorta al centro en landscape (más ancho que alto)", () => {
    expect(computeSquareCrop(200, 100)).toEqual({ sx: 50, sy: 0, size: 100 });
  });
  it("recorta al centro en portrait (más alto que ancho)", () => {
    expect(computeSquareCrop(100, 200)).toEqual({ sx: 0, sy: 50, size: 100 });
  });
  it("no recorta cuando ya es cuadrado", () => {
    expect(computeSquareCrop(100, 100)).toEqual({ sx: 0, sy: 0, size: 100 });
  });
});

describe("autoLevels", () => {
  it("estira el rango de luminancia a 0..255", () => {
    // dos píxeles gris: luminancia 50 y 150
    const data = new Uint8ClampedArray([50, 50, 50, 255, 150, 150, 150, 255]);
    autoLevels(data);
    expect(Array.from(data)).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });
  it("no altera una imagen plana (rango cero)", () => {
    const data = new Uint8ClampedArray([120, 120, 120, 255]);
    autoLevels(data);
    expect(Array.from(data)).toEqual([120, 120, 120, 255]);
  });
});

describe("analyzeBackground", () => {
  it("C6: fondo claro y uniforme pasa", () => {
    expect(analyzeBackground(WHITE, S, S).ok).toBe(true);
    const n = analyzeBackground(OFFWHITE_NOISE, S, S);
    expect(n.ok).toBe(true);
    expect(n.meanLuma).toBeGreaterThan(230);
    expect(n.stdLuma).toBeLessThan(BG_MAX_LUMA_STDDEV);
  });

  it("C6: fondo de color no pasa", () => {
    const r = analyzeBackground(RED_WALL, S, S);
    expect(r.ok).toBe(false);
    expect(r.meanLuma).toBeLessThan(BG_MIN_LUMA);
  });

  it("C6: sombra en el borde no pasa", () => {
    const r = analyzeBackground(SHADOW_BOTTOM, S, S);
    expect(r.ok).toBe(false);
    expect(r.whiteFraction).toBeLessThan(BG_MIN_WHITE_FRACTION);
  });

  it("C6: gradiente y pared gris no pasan", () => {
    const g = analyzeBackground(GRADIENT, S, S);
    expect(g.ok).toBe(false);
    expect(g.stdLuma).toBeGreaterThan(BG_MAX_LUMA_STDDEV);
    const w = analyzeBackground(GRAY_WALL, S, S);
    expect(w.ok).toBe(false);
    expect(w.meanLuma).toBeLessThan(BG_MIN_LUMA);
  });

  it("C6: el producto al centro no afecta el resultado", () => {
    expect(analyzeBackground(WHITE_WITH_PRODUCT, S, S).ok).toBe(true);
  });

  it("C6: imagen muy pequeña no pasa", () => {
    const r = analyzeBackground(TINY, 8, 8);
    expect(r).toEqual({ ok: false, meanLuma: 0, stdLuma: 0, whiteFraction: 0, meanChroma: 0 });
  });
});

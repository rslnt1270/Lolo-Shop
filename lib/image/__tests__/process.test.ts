import { describe, it, expect } from "vitest";
import { computeSquareCrop, autoLevels } from "@/lib/image/process";

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

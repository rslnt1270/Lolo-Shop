export type Rgb = [number, number, number];

/** Genera RGBA (alfa 255) con una función de píxel. Solo datos sintéticos. */
export function makeImage(
  w: number,
  h: number,
  pixel: (x: number, y: number) => Rgb
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

const S = 100;
const gray = (v: number): Rgb => [v, v, v];

export const WHITE = makeImage(S, S, () => [255, 255, 255]);
export const OFFWHITE_NOISE = makeImage(S, S, (x, y) => gray(235 + ((x * 31 + y * 17) % 13) - 6));
export const WHITE_WITH_PRODUCT = makeImage(S, S, (x, y) =>
  x >= 20 && x < 80 && y >= 20 && y < 80 ? [200, 40, 40] : [255, 255, 255]
);
export const RED_WALL = makeImage(S, S, () => [200, 40, 40]);
export const GRAY_WALL = makeImage(S, S, () => gray(150));
export const SHADOW_BOTTOM = makeImage(S, S, (_x, y) => (y >= 95 ? gray(90) : gray(255)));
export const GRADIENT = makeImage(S, S, (x) => gray(180 + Math.round((x * 70) / 99)));
export const TINY = makeImage(8, 8, () => [255, 255, 255]);
export const IMAGE_SIZE = S;

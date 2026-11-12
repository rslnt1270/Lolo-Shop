/** Rectángulo de recorte centrado 1:1 para dimensiones dadas. */
export function computeSquareCrop(
  width: number,
  height: number
): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height);
  return {
    sx: Math.floor((width - size) / 2),
    sy: Math.floor((height - size) / 2),
    size,
  };
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Auto-brillo/contraste: estira el histograma de luminancia de modo que
 * la luminancia mínima mapee a 0 y la máxima a 255. Muta `data` (RGBA) in-place.
 */
export function autoLevels(data: Uint8ClampedArray): void {
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  if (max - min < 1) return; // imagen plana: nada que estirar
  const scale = 255 / (max - min);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp((data[i] - min) * scale);
    data[i + 1] = clamp((data[i + 1] - min) * scale);
    data[i + 2] = clamp((data[i + 2] - min) * scale);
    // alfa (i+3) sin tocar
  }
}

export const BORDER_RATIO = 0.05;
export const MIN_BORDER_PX = 4;
export const MIN_IMAGE_SIDE = 16;
export const BG_MIN_LUMA = 200;
export const BG_MAX_LUMA_STDDEV = 18;
export const BG_MIN_WHITE_FRACTION = 0.9;
export const BG_MAX_CHROMA = 25;

export type BackgroundAnalysis = {
  ok: boolean;
  meanLuma: number;
  stdLuma: number;
  whiteFraction: number;
  meanChroma: number;
};

/**
 * Analiza solo los bordes de la imagen (RGBA) para decidir si el fondo es
 * claro y uniforme. Es una ayuda, no una garantía. Sin dependencias del DOM.
 */
export function analyzeBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number
): BackgroundAnalysis {
  const minSide = Math.min(width, height);
  if (minSide < MIN_IMAGE_SIDE) {
    return { ok: false, meanLuma: 0, stdLuma: 0, whiteFraction: 0, meanChroma: 0 };
  }
  const band = Math.max(MIN_BORDER_PX, Math.round(minSide * BORDER_RATIO));
  let n = 0;
  let sumL = 0;
  let sumL2 = 0;
  let sumC = 0;
  let white = 0;
  for (let y = 0; y < height; y++) {
    const rowEdge = y < band || y >= height - band;
    for (let x = 0; x < width; x++) {
      if (!rowEdge && x >= band && x < width - band) {
        x = width - band - 1; // salta el interior de la fila
        continue;
      }
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      n++;
      sumL += l;
      sumL2 += l * l;
      sumC += Math.max(r, g, b) - Math.min(r, g, b);
      if (l >= BG_MIN_LUMA) white++;
    }
  }
  const meanLuma = sumL / n;
  const stdLuma = Math.sqrt(Math.max(0, sumL2 / n - meanLuma * meanLuma));
  const whiteFraction = white / n;
  const meanChroma = sumC / n;
  const ok =
    meanLuma >= BG_MIN_LUMA &&
    stdLuma <= BG_MAX_LUMA_STDDEV &&
    whiteFraction >= BG_MIN_WHITE_FRACTION &&
    meanChroma <= BG_MAX_CHROMA;
  return { ok, meanLuma, stdLuma, whiteFraction, meanChroma };
}

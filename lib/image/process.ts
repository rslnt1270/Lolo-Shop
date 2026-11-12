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

import { computeSquareCrop, autoLevels, analyzeBackground, type BackgroundAnalysis } from "./process";

const MAX_SIZE = 1080;
const MAX_BYTES = 1024 * 1024;

export type ProcessedPhoto = { file: File; analysis: BackgroundAnalysis };
export type ProcessFile = (file: File) => Promise<ProcessedPhoto>;

/**
 * Edita la foto en el navegador (recorte 1:1, tamaño, niveles) y analiza los
 * bordes ANTES de codificarla. `imageOrientation: "from-image"` aplica el EXIF
 * para que el análisis no lea la imagen de lado.
 */
export const defaultProcessFile: ProcessFile = async (file) => {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { sx, sy, size } = computeSquareCrop(bitmap.width, bitmap.height);
  const out = Math.min(size, MAX_SIZE);

  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, out, out);

  const imageData = ctx.getImageData(0, 0, out, out);
  autoLevels(imageData.data);
  const analysis = analyzeBackground(imageData.data, out, out);
  ctx.putImageData(imageData, 0, 0);

  const encode = (quality: number): Promise<Blob> =>
    new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob falló"))), "image/jpeg", quality)
    );
  // 1080x1080 a calidad 0.8 suele pesar 150-400 KB; si pasa de 1 MB, recomprime.
  let blob = await encode(0.8);
  if (blob.size > MAX_BYTES) blob = await encode(0.6);
  if (blob.size > MAX_BYTES) blob = await encode(0.45);
  return { file: new File([blob], "producto.jpg", { type: "image/jpeg" }), analysis };
};

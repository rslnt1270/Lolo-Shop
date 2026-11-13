import { computeSquareCrop, autoLevels } from "./process";

const MAX_SIZE = 1080;
const MAX_BYTES = 1024 * 1024;

export type ProcessedPhoto = { file: File };
export type ProcessFileOptions = { levels?: boolean };
export type ProcessFile = (file: File, opts?: ProcessFileOptions) => Promise<ProcessedPhoto>;

/**
 * Edita la foto en el navegador (recorte 1:1, tamaño, EXIF y, por defecto, niveles).
 * No analiza el fondo: cualquier foto se acepta (decisión del dueño, 2026-11-12).
 * `levels: false` conserva los tonos de una foto que el dueño ya editó.
 */
export const defaultProcessFile: ProcessFile = async (file, opts) => {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { sx, sy, size } = computeSquareCrop(bitmap.width, bitmap.height);
  const out = Math.min(size, MAX_SIZE);

  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, out, out);

  if (opts?.levels !== false) {
    const imageData = ctx.getImageData(0, 0, out, out);
    autoLevels(imageData.data);
    ctx.putImageData(imageData, 0, 0);
  }

  const encode = (quality: number): Promise<Blob> =>
    new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob falló"))), "image/jpeg", quality)
    );
  // 1080x1080 a calidad 0.8 suele pesar 150-400 KB; si pasa de 1 MB, recomprime.
  let blob = await encode(0.8);
  if (blob.size > MAX_BYTES) blob = await encode(0.6);
  if (blob.size > MAX_BYTES) blob = await encode(0.45);
  return { file: new File([blob], "producto.jpg", { type: "image/jpeg" }) };
};

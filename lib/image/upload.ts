import { put } from "@vercel/blob";

/**
 * Sube una imagen de producto a Vercel Blob y devuelve su URL pública CDN.
 * El token BLOB_READ_WRITE_TOKEN se lee del entorno server-side (nunca en cliente).
 */
export async function uploadImage(file: File): Promise<string> {
  const ext = file.type === "image/png" ? "png" : "jpg";
  const name = `productos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await put(name, file, {
    access: "public",
    addRandomSuffix: false,
    contentType: file.type,
  });
  return blob.url;
}

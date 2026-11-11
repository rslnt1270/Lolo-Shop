import { put } from "@vercel/blob";
import { MAX_IMAGE_BYTES } from "@/lib/domain/new-product";

/** Tope de tamaño por imagen de producto (definido en el dominio para que el cliente lo valide). */
export { MAX_IMAGE_BYTES };

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Error con mensaje apto para mostrar al operador. */
export class ImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageUploadError";
  }
}

/**
 * Sube una imagen de producto a Vercel Blob y devuelve su URL pública CDN.
 * Solo server-side: el token BLOB_READ_WRITE_TOKEN se lee del entorno.
 * Lanza ImageUploadError si falta configuración o el archivo no es válido.
 */
export async function uploadImage(file: File): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new ImageUploadError(
      "La subida de fotos no está configurada en el servidor (falta BLOB_READ_WRITE_TOKEN). Avísale al administrador.",
    );
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    throw new ImageUploadError("Formato de imagen no permitido: usa JPG, PNG o WebP.");
  }
  if (file.size === 0) {
    throw new ImageUploadError("La imagen está vacía.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageUploadError("La imagen pesa más de 4 MB. Toma la foto de nuevo o redúcela.");
  }
  const name = `productos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await put(name, file, {
    access: "public",
    addRandomSuffix: false,
    contentType: file.type,
  });
  return blob.url;
}

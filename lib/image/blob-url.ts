/**
 * Solo aceptamos como foto de producto una URL que nuestro propio servidor
 * haya subido a Vercel Blob (ver upload.ts, prefijo `productos/`).
 * Evita que un cliente guarde en el catálogo público una URL arbitraria.
 */
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

export function isProductBlobUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  // Si se configura el host exacto del store, se exige ese (leído en cada llamada).
  const exactHost = process.env.BLOB_PUBLIC_HOST;
  const hostOk = exactHost
    ? url.hostname === exactHost
    : url.hostname.endsWith(BLOB_HOST_SUFFIX) && url.hostname.length > BLOB_HOST_SUFFIX.length;
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    hostOk &&
    url.pathname.startsWith("/productos/")
  );
}

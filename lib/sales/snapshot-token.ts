// Sin "use server": firma de la copia local (spec F §5). Solo servidor.
import { createHmac, timingSafeEqual } from "node:crypto";

/** Contexto fijo: separa esta llave de cualquier otro uso de NEXTAUTH_SECRET. */
const CONTEXT = "loloshop-offline-snapshot-v1";
const MAX_TOKEN_LENGTH = 1024;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export interface SnapshotClaims {
  userId: string;
  locationId: string;
  /** ISO, reloj del servidor. */
  generatedAt: string;
}

function key(): Buffer | null {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(CONTEXT).digest();
}

const mac = (k: Buffer, payload: string) => createHmac("sha256", k).update(payload).digest();

/**
 * `base64url(JSON claims) + "." + base64url(HMAC-SHA256)`. No es una credencial:
 * solo prueba que el servidor generó esa copia para ese usuario y tienda.
 */
export function signSnapshotToken(claims: SnapshotClaims): string {
  const k = key();
  if (!k) throw new Error("NEXTAUTH_SECRET no está configurado.");
  const payload = Buffer.from(
    JSON.stringify({ userId: claims.userId, locationId: claims.locationId, generatedAt: claims.generatedAt }),
  ).toString("base64url");
  return `${payload}.${mac(k, payload).toString("base64url")}`;
}

/**
 * `generatedAt` del token si la firma es válida y es del usuario y la tienda
 * esperados; si no, `null` (nunca lanza).
 */
export function verifySnapshotToken(
  token: unknown,
  expected: { userId: string; locationId: string },
): { generatedAt: string } | null {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const k = key();
  if (!k) return null;
  const want = mac(k, payload);
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const c = claims as Partial<SnapshotClaims> | null;
  if (!c || c.userId !== expected.userId || c.locationId !== expected.locationId) return null;
  if (typeof c.generatedAt !== "string" || !ISO_RE.test(c.generatedAt)) return null;
  if (Number.isNaN(new Date(c.generatedAt).getTime())) return null;
  return { generatedAt: c.generatedAt };
}

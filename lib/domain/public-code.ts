/** Crockford base32 (sin I, L, O, U): 32 símbolos legibles para dictar. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 5;

/**
 * Código público corto de una venta. Por defecto usa `crypto.getRandomValues`
 * (256 % 32 === 0, sin sesgo); `random` permite inyectar un generador en [0, 1).
 */
export function generatePublicCode(random?: () => number): string {
  const indexes = random
    ? Array.from({ length: CODE_LENGTH }, () =>
        Math.min(ALPHABET.length - 1, Math.max(0, Math.floor(random() * ALPHABET.length) || 0)),
      )
    : Array.from(crypto.getRandomValues(new Uint8Array(CODE_LENGTH)), (b) => b % ALPHABET.length);
  return indexes.map((i) => ALPHABET[i]).join("");
}

const PUBLIC_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{5}$/;

/** Valida un código público (entrada no confiable): mayúsculas y 5 símbolos Crockford. */
export function normalizePublicCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return PUBLIC_CODE_RE.test(code) ? code : null;
}

export type PublicCodeRequest =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "ok"; code: string; size: string | null };

/** Extrae "Código XXXXX" (y "talla X" opcional) de un mensaje de cliente. */
export function parsePublicCodeRequest(text: string): PublicCodeRequest {
  const m = text.match(/c[oó]digo\s*:?\s*([A-Za-z0-9]+)(?:[\s,.;]+talla\s*:?\s*([A-Za-z0-9.\/-]{1,6}))?/i);
  if (!m) return { kind: "none" };
  const code = normalizePublicCode(m[1]);
  if (!code) return { kind: "invalid" };
  return { kind: "ok", code, size: m[2] ? m[2].toUpperCase() : null };
}

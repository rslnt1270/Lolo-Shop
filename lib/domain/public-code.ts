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

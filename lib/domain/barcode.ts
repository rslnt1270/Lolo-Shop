/**
 * Códigos de producto: normalización de lo que entrega el lector, candidatos
 * de búsqueda (UPC-A ↔ EAN-13), validación GTIN y SKU interno de LoloShop.
 * Puro: sin Prisma ni APIs de Node, usable en cliente y servidor.
 */

/** Alfabeto Crockford base32 (sin I, L, O, U). */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** El SKU interno solo usa [0-9A-Z-]: fácil de teclear en móvil y compatible con Code 39. */
const INTERNAL_SKU_RE = /^LS-([0-9A-HJKMNP-TV-Z]{6})-([0-9A-HJKMNP-TV-Z])$/;

/** Quita espacios, saltos de línea y caracteres de control (p. ej. GS de GS1). */
export function normalizeCode(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return String(raw ?? "").replace(/[\s\u0000-\u001f\u007f]/g, "");
}

/**
 * Formas equivalentes del código para buscar en barcode y sku:
 * UPC-A (12) ↔ EAN-13 con 0 inicial, y la versión en mayúsculas de códigos
 * alfanuméricos (SKU tecleado a mano). El primero siempre es el normalizado.
 */
export function codeCandidates(raw: string): string[] {
  const code = normalizeCode(raw);
  if (!code) return [];
  const out = [code];
  if (/^\d{12}$/.test(code)) out.push(`0${code}`);
  else if (/^0\d{12}$/.test(code)) out.push(code.slice(1));
  const upper = code.toUpperCase();
  if (upper !== code) out.push(upper);
  return [...new Set(out)];
}

/** Para guardar: los alfanuméricos van en MAYÚSCULAS; los numéricos (EAN/UPC) no cambian. */
export function canonicalCode(raw: string): string {
  const code = normalizeCode(raw);
  return /^\d+$/.test(code) ? code : code.toUpperCase();
}

/**
 * Dígito verificador mod-10 de GTIN-8/12/13/14. Para códigos no numéricos o
 * de otra longitud no aplica y devuelve true.
 */
export function isValidGtin(code: string): boolean {
  const c = normalizeCode(code);
  if (!/^\d+$/.test(c) || ![8, 12, 13, 14].includes(c.length)) return true;
  let sum = 0;
  for (let i = c.length - 2, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) {
    sum += Number(c[i]) * w;
  }
  return (10 - (sum % 10)) % 10 === Number(c[c.length - 1]);
}

/**
 * Dígito de control: Σ valor·(2i+1) mod 32, expresado en Crockford.
 * Pesos impares (invertibles mod 32): detecta cualquier sustitución de un
 * carácter y casi todas las transposiciones adyacentes.
 */
function checkSymbol(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += CROCKFORD.indexOf(body[i]) * (2 * i + 1);
  return CROCKFORD[sum % 32];
}

/** SKU interno `LS-XXXXXX-C`: 6 símbolos Crockford aleatorios + control ponderado mod 32. */
export function generateInternalSku(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  // 256 es múltiplo de 32: tomar 5 bits no introduce sesgo.
  const body = Array.from(bytes, (b) => CROCKFORD[b & 31]).join("");
  return `LS-${body}-${checkSymbol(body)}`;
}

export function isValidInternalSku(sku: string): boolean {
  const m = INTERNAL_SKU_RE.exec(normalizeCode(sku).toUpperCase());
  return !!m && checkSymbol(m[1]) === m[2];
}

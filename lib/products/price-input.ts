/**
 * Lee un precio escrito en la ficha. En México la coma separa miles ("1,250" = 1250)
 * y el punto separa centavos ("1,234.50" = 1234.5). Devuelve `null` si no es un precio válido.
 */
const PRICE_RE = /^\d+(\.\d{1,2})?$/;

export function parsePriceInput(text: string): number | null {
  const clean = text.trim().replace(/,/g, "");
  if (!PRICE_RE.test(clean)) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/** Bajar a menos de la mitad del precio vigente pide confirmación (evita un dedazo de "1,250" → "125"). */
export function isBigPriceDrop(current: number, next: number): boolean {
  return current > 0 && next < current * 0.5;
}

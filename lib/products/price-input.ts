/**
 * Lee un precio escrito en la ficha. En México la coma separa miles ("1,250" = 1250)
 * y el punto separa centavos ("1,234.50" = 1234.5). Devuelve `null` si no es un precio válido.
 */
const PRICE_RE = /^\d+(\.\d{1,2})?$/;

export const COMMA_CENTS_MESSAGE = "Usa punto para los centavos: 350.50";
/** Coma seguida de 1 o 2 dígitos al final ("350,50", "350,5"): se confunde con centavos y se leería como miles. */
const COMMA_CENTS_RE = /,\d{1,2}$/;

/** `true` si el texto parece usar coma como separador decimal ("350,50"). */
export function hasCommaCents(text: string): boolean {
  return COMMA_CENTS_RE.test(text.trim());
}

export function parsePriceInput(text: string): number | null {
  if (hasCommaCents(text)) return null;
  const clean = text.trim().replace(/,/g, "");
  if (!PRICE_RE.test(clean)) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/** Bajar a menos de la mitad del precio vigente pide confirmación (evita un dedazo de "1,250" → "125"). */
export function isBigPriceDrop(current: number, next: number): boolean {
  return current > 0 && next < current * 0.5;
}

/** Subir a más del doble del precio vigente también pide confirmación (evita "900" por "350"). */
export function isBigPriceRise(current: number, next: number): boolean {
  return current > 0 && next > current * 2;
}

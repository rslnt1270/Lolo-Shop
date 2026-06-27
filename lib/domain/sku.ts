export interface SkuInput {
  category: string;
  brand: string;
  size: string;
  color: string;
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Toma las primeras `len` letras/dígitos (sin espacios), en mayúsculas,
 *  rellenando con "X" si faltan caracteres. */
function code(value: string, len: number): string {
  const clean = stripAccents(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.padEnd(len, "X").slice(0, len);
}

export function generateSku(input: SkuInput): string {
  const cat = code(input.category, 3);
  const brand = code(input.brand, 3);
  const size = code(input.size, input.size.trim().length >= 3 ? 3 : input.size.trim().length || 1);
  const color = code(input.color, 3);
  return `LS-${cat}-${brand}-${size}-${color}`;
}

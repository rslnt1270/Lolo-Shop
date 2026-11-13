/**
 * Colores de la escena (SVG y estilos en línea, donde no aplican clases de Tailwind).
 * Mismos valores que los tokens de tailwind.config.ts; el turquesa solo como relleno, aro o halo.
 */
export const PALETTE = {
  turquesa: "#22B8B8",
  turquesaTexto: "#0C7C7C",
  turquesaLuz: "#5FE0DE",
  tinta: "#16302F",
  borde: "#7F9392",
  /** Zona de calzado (token tertiary-container / on-tertiary-container). */
  calzado: "#f69562",
  calzadoTexto: "#702d01",
} as const;

/** Halo de cada zona. Equivale a accentColor de lib/virtual-store/zones.ts, llevado a la paleta turquesa. */
const ZONE_HALO: Record<string, string> = {
  entrada: PALETTE.turquesa,
  percheros: PALETTE.turquesaTexto,
  calzado: PALETTE.calzado,
  caja: PALETTE.turquesaLuz,
};

export function zoneHalo(zoneId: string, fallback: string): string {
  return ZONE_HALO[zoneId] ?? fallback;
}

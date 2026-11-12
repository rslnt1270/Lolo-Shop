/** México no tiene horario de verano desde 2022: UTC−6 todo el año. */
const MEXICO_UTC_OFFSET_HOURS = 6;

/**
 * Rango UTC `[gte, lt)` de los días de México `from`..`to` (inclusivos): empieza a las
 * 00:00 de México de `from` (06:00Z) y termina antes de las 00:00 de México del día
 * siguiente a `to`.
 */
export function mexicoRangeToUtc(from: string, to: string): { gte: Date; lt: Date } {
  const gte = new Date(`${from}T00:00:00Z`);
  gte.setUTCHours(MEXICO_UTC_OFFSET_HOURS);
  const lt = new Date(`${to}T00:00:00Z`);
  lt.setUTCDate(lt.getUTCDate() + 1);
  lt.setUTCHours(MEXICO_UTC_OFFSET_HOURS);
  return { gte, lt };
}

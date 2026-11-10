import type { MovementType, Role } from "./types";
import { MOVEMENT_TYPES } from "./types";
import type { MovementQuery } from "../data/source";

export const MAX_MOVEMENT_RANGE_DAYS = 93;
/** México no tiene horario de verano desde 2022: UTC−6 todo el año. */
const MEXICO_UTC_OFFSET_HOURS = 6;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface MovementFilter {
  locationId?: string;
  type?: string;
  userId?: string;
  variantId?: string;
  from?: string;
  to?: string;
  cursor?: string;
}

function isBusinessDate(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v : undefined);

/** Días que abarca el rango, contando los dos extremos. */
export function inclusiveDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

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

/**
 * Recorte por rol del historial (RF-INV-09): el servidor fija tienda y día, la UI solo
 * pide. Colaborador: su tienda y hoy; manager con tienda: su tienda; el resto, lo
 * pedido. Rango de más de 93 días: `ok: false`.
 */
export function scopeMovementQuery(
  user: { role: Role; locationId: string | null },
  requested: MovementFilter,
  today: string,
): { ok: true; query: MovementQuery } | { ok: false; message: string } {
  const req = requested ?? {};
  let from = isBusinessDate(req.from) ? req.from : today;
  let to = isBusinessDate(req.to) ? req.to : today;
  if (from > to) [from, to] = [to, from];

  let locationIds: string[] | "all";
  if (user.role === "collaborator") {
    from = to = today;
    locationIds = user.locationId ? [user.locationId] : [];
  } else if (user.role === "manager" && user.locationId) {
    locationIds = [user.locationId];
  } else {
    const loc = text(req.locationId);
    locationIds = loc ? [loc] : "all";
  }

  if (inclusiveDays(from, to) > MAX_MOVEMENT_RANGE_DAYS) {
    return { ok: false, message: `El rango máximo es de ${MAX_MOVEMENT_RANGE_DAYS} días.` };
  }

  const query: MovementQuery = { locationIds, from, to };
  const type = text(req.type);
  if (type && (MOVEMENT_TYPES as readonly string[]).includes(type)) query.type = type as MovementType;
  const userId = text(req.userId);
  if (userId) query.userId = userId;
  const variantId = text(req.variantId);
  if (variantId) query.variantId = variantId;
  const cursor = text(req.cursor);
  if (cursor) query.cursor = cursor;
  return { ok: true, query };
}

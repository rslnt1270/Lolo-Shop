import type { Role } from "./types";
import type { DashboardQuery } from "../data/sales-source";

const DEFAULT_RANGE_DAYS = 30;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isBusinessDate(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Recorte por rol (ER §4): el servidor fija rango y tiendas, la UI solo pide.
 * `today` es el día de negocio en curso (America/Mexico_City).
 */
export function scopeDashboardQuery(
  user: { role: Role; locationId: string | null },
  requested: Partial<DashboardQuery>,
  today: string,
): DashboardQuery {
  if (user.role === "collaborator") {
    return {
      from: today,
      to: today,
      locationIds: user.locationId ? [user.locationId] : [],
      pendingScope: "range",
    };
  }

  let from = isBusinessDate(requested.from) ? requested.from : addDays(today, -(DEFAULT_RANGE_DAYS - 1));
  let to = isBusinessDate(requested.to) ? requested.to : today;
  if (from > to) [from, to] = [to, from];

  if (user.role === "manager" && user.locationId) {
    return { from, to, locationIds: [user.locationId], pendingScope: "all_dates" };
  }
  const ids = requested.locationIds;
  // Viene del cliente: solo se conservan textos no vacíos.
  const clean = Array.isArray(ids)
    ? [...new Set(ids.filter((id): id is string => typeof id === "string" && id.trim() !== ""))]
    : null;
  return { from, to, locationIds: clean ?? "all", pendingScope: "all_dates" };
}

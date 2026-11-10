import type { PaymentMethod, SaleChannel } from "@/lib/domain/sale";

export const CHANNEL_LABEL: Record<SaleChannel, string> = { store: "Tienda", whatsapp: "WhatsApp" };
export const METHOD_LABEL: Record<PaymentMethod, string> = {
  spay_transfer: "Transferencia SPAY",
  cash: "Efectivo",
  card: "Tarjeta",
};

/** Antigüedad corta: "hace 3 h". */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const min = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

/** Día de negocio (YYYY-MM-DD) en America/Mexico_City, solo para sugerir rangos; el servidor decide. */
export function businessTodayMx(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "5 nov" */
export function shortDate(date: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "numeric", month: "short" })
    .format(new Date(`${date}T00:00:00Z`))
    .replace(".", "");
}

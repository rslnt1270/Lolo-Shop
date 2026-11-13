import { validateNewSale, type NewSaleInput, type ReviewReason } from "./sale";

export interface OfflineMeta {
  /** Instante ISO en que el teléfono cobró. */
  soldAt: string;
  /** Instante ISO de la copia de precios/stock con la que se cobró. */
  snapshotAt: string;
}
export type OfflineSaleInput = NewSaleInput & OfflineMeta;
export type OfflineSaleValidation = { ok: true; value: OfflineSaleInput } | { ok: false; message: string };

export const CLOCK_SKEW_FUTURE_MS = 5 * 60 * 1000;
export const CLOCK_SKEW_PAST_MS = 7 * 24 * 60 * 60 * 1000;

export const REVIEW_REASON_TEXT: Record<ReviewReason, string> = {
  insufficient_stock: "Faltó stock",
  price_unverified: "Precio distinto al registrado",
  inactive_product: "Prenda dada de baja",
  clock_skew: "Hora del teléfono incorrecta",
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function parseIso(value: unknown): Date | null {
  if (typeof value !== "string" || !ISO_RE.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Valida una venta hecha sin internet: la venta normal más sus dos marcas de tiempo. */
export function validateOfflineSale(input: unknown): OfflineSaleValidation {
  const base = validateNewSale(input);
  if (!base.ok) return base;
  const raw = input as Record<string, unknown>;
  if (!parseIso(raw.soldAt)) return { ok: false, message: "La hora de la venta no es válida." };
  if (!parseIso(raw.snapshotAt)) return { ok: false, message: "La fecha de la copia de precios no es válida." };
  return { ok: true, value: { ...base.value, soldAt: raw.soldAt as string, snapshotAt: raw.snapshotAt as string } };
}

/** Descuenta hasta 0; lo que no alcanza queda como faltante. Sin fila de stock = 0. */
export function planOfflineLine(
  available: number | null,
  quantity: number,
): { taken: number; shortfall: number } {
  const have = Math.max(0, available ?? 0);
  const taken = Math.min(have, quantity);
  return { taken, shortfall: quantity - taken };
}

/** Si la hora del teléfono es absurda (futuro > 5 min o pasado > 7 días) se usa `now` y se marca. */
export function resolveSoldAt(soldAt: string, now: Date): { at: Date; skewed: boolean } {
  const at = parseIso(soldAt);
  if (!at) return { at: now, skewed: true };
  const diff = at.getTime() - now.getTime();
  if (diff > CLOCK_SKEW_FUTURE_MS || diff < -CLOCK_SKEW_PAST_MS) return { at: now, skewed: true };
  return { at, skewed: false };
}

const cents = (n: number) => Math.round(n * 100);

/** ¿El precio cobrado es el vigente o uno de los registrados en cambios recientes? (centavos) */
export function isPriceKnown(
  unitPrice: number,
  current: number,
  recent: { oldPrice: number; newPrice: number }[],
): boolean {
  const c = cents(unitPrice);
  if (c === cents(current)) return true;
  return recent.some((r) => c === cents(r.oldPrice) || c === cents(r.newPrice));
}

export function offlineFolio(clientRequestId: string): string {
  return "L-" + clientRequestId.slice(0, 8);
}

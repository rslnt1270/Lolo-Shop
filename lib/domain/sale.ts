import { MAX_PRICE } from "./new-product";

export type SaleChannel = "store" | "whatsapp";
export type PaymentMethod = "spay_transfer" | "cash" | "card";
export type SaleStatus = "pending_payment" | "paid" | "cancelled" | "refunded";

export interface SaleLineInput {
  variantId: string;
  quantity: number;
  unitPrice: number;
}

export interface NewSaleInput {
  clientRequestId: string;
  locationId: string;
  channel: SaleChannel;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  customerAlias?: string;
  lines: SaleLineInput[];
}

export const SALE_CHANNELS: readonly SaleChannel[] = ["store", "whatsapp"];
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["spay_transfer", "cash", "card"];
export const MAX_ALIAS_LENGTH = 40;
export const MAX_REFERENCE_LENGTH = 80;
const BUSINESS_TIME_ZONE = "America/Mexico_City";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SaleValidation = { ok: true; value: NewSaleInput } | { ok: false; message: string };

const fail = (message: string): SaleValidation => ({ ok: false, message });

function optionalText(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  return value.trim() || undefined;
}

/** Valida la venta que llega del cliente; los mensajes son para el operador. */
export function validateNewSale(input: unknown): SaleValidation {
  if (typeof input !== "object" || input === null) return fail("La venta no es válida.");
  const raw = input as Record<string, unknown>;

  if (typeof raw.clientRequestId !== "string" || !UUID_RE.test(raw.clientRequestId)) {
    return fail("El identificador de la venta no es válido.");
  }
  if (typeof raw.locationId !== "string" || !raw.locationId.trim()) {
    return fail("Elige la tienda de la venta.");
  }
  if (!SALE_CHANNELS.includes(raw.channel as SaleChannel)) return fail("Elige un canal válido.");
  if (!PAYMENT_METHODS.includes(raw.paymentMethod as PaymentMethod)) {
    return fail("Elige un método de pago válido.");
  }

  const customerAlias = optionalText(raw.customerAlias);
  if (customerAlias === null) return fail("El alias no es válido.");
  if (customerAlias !== undefined) {
    if (customerAlias.length > MAX_ALIAS_LENGTH) {
      return fail(`El alias no puede pasar de ${MAX_ALIAS_LENGTH} caracteres.`);
    }
    if (/\d{7,}/.test(customerAlias)) {
      return fail("El alias no puede incluir teléfonos ni números largos.");
    }
  }

  const paymentReference = optionalText(raw.paymentReference);
  if (paymentReference === null) return fail("La referencia de pago no es válida.");
  if (paymentReference !== undefined && paymentReference.length > MAX_REFERENCE_LENGTH) {
    return fail(`La referencia no puede pasar de ${MAX_REFERENCE_LENGTH} caracteres.`);
  }

  if (!Array.isArray(raw.lines) || raw.lines.length === 0) {
    return fail("Agrega al menos un producto a la venta.");
  }
  const seen = new Set<string>();
  const lines: SaleLineInput[] = [];
  for (const item of raw.lines as unknown[]) {
    const l = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    if (typeof l.variantId !== "string" || !l.variantId.trim()) {
      return fail("Una línea no tiene producto.");
    }
    if (typeof l.quantity !== "number" || !Number.isInteger(l.quantity) || l.quantity < 1) {
      return fail("La cantidad debe ser un entero mayor a cero.");
    }
    if (
      typeof l.unitPrice !== "number" ||
      !Number.isFinite(l.unitPrice) ||
      l.unitPrice < 0 ||
      l.unitPrice > MAX_PRICE
    ) {
      return fail("El precio de una línea no es válido.");
    }
    if (seen.has(l.variantId)) return fail("Un producto está repetido; junta las cantidades.");
    seen.add(l.variantId);
    lines.push({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice });
  }

  const value: NewSaleInput = {
    clientRequestId: raw.clientRequestId,
    locationId: raw.locationId,
    channel: raw.channel as SaleChannel,
    paymentMethod: raw.paymentMethod as PaymentMethod,
    lines,
  };
  if (paymentReference !== undefined) value.paymentReference = paymentReference;
  if (customerAlias !== undefined) value.customerAlias = customerAlias;
  return { ok: true, value };
}

/** SPAY espera confirmación del pago; efectivo y tarjeta nacen pagadas. */
export function initialStatus(method: PaymentMethod): SaleStatus {
  return method === "spay_transfer" ? "pending_payment" : "paid";
}

/** Total en pesos; suma en centavos enteros para evitar deriva de flotantes. */
export function saleTotal(lines: SaleLineInput[]): number {
  const cents = lines.reduce((sum, l) => sum + l.quantity * Math.round(l.unitPrice * 100), 0);
  return cents / 100;
}

/** Día de negocio (YYYY-MM-DD) en America/Mexico_City. */
export function businessDateMx(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

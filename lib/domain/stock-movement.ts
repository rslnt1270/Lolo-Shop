export type StockMovementKind = "restock";

export const MIN_STOCK_QUANTITY = 1;
export const MAX_STOCK_QUANTITY = 200;
export const MIN_REASON_LENGTH = 3;
export const MAX_REASON_LENGTH = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_DIGITS_RE = /\d{7,}/;

export interface ValidStockMovement {
  variantId: string;
  locationId: string;
  kind: StockMovementKind;
  delta: number;
  reason: string | null;
  requestId: string;
}

export type StockMovementValidation =
  | { ok: true; value: ValidStockMovement }
  | { ok: false; message: string };

/**
 * Motivo de entrada o de cambio de precio: 3–120 caracteres, sin secuencias de 7 o
 * más dígitos (evita guardar teléfonos). Lanza `Error` con el mensaje para el
 * operador. Vacío y no obligatorio devuelve null.
 */
export function validateReason(raw: unknown, required: boolean): string | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) {
    if (required) throw new Error("Escribe el motivo.");
    return null;
  }
  if (text.length < MIN_REASON_LENGTH) {
    throw new Error(`El motivo debe tener al menos ${MIN_REASON_LENGTH} caracteres.`);
  }
  if (text.length > MAX_REASON_LENGTH) {
    throw new Error(`El motivo no puede pasar de ${MAX_REASON_LENGTH} caracteres.`);
  }
  if (LONG_DIGITS_RE.test(text)) {
    throw new Error("El motivo no debe incluir números largos (teléfonos o referencias).");
  }
  return text;
}

const fail = (message: string): StockMovementValidation => ({ ok: false, message });

export function validateStockMovement(input: unknown): StockMovementValidation {
  if (!input || typeof input !== "object") return fail("Datos del movimiento inválidos.");
  const i = input as Record<string, unknown>;

  if (typeof i.variantId !== "string" || !i.variantId) return fail("Falta la prenda.");
  if (typeof i.locationId !== "string" || !i.locationId) return fail("Falta la tienda.");
  if (typeof i.requestId !== "string" || !UUID_RE.test(i.requestId)) {
    return fail("Identificador de la operación inválido.");
  }
  if (i.kind !== "restock") return fail("Tipo de movimiento inválido.");
  const q = i.quantity;
  if (typeof q !== "number" || !Number.isInteger(q) || q < MIN_STOCK_QUANTITY || q > MAX_STOCK_QUANTITY) {
    return fail(`La cantidad debe ser un entero entre ${MIN_STOCK_QUANTITY} y ${MAX_STOCK_QUANTITY}.`);
  }

  let reason: string | null;
  try {
    reason = validateReason(i.reason, false);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Motivo inválido.");
  }

  return {
    ok: true,
    value: {
      variantId: i.variantId,
      locationId: i.locationId,
      kind: "restock",
      delta: q,
      reason,
      requestId: i.requestId,
    },
  };
}

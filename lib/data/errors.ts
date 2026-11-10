/** Error de unicidad con la misma forma que `PrismaClientKnownRequestError` P2002. */
export class UniqueConstraintError extends Error {
  readonly code = "P2002";
  readonly meta: { target: string[] };
  constructor(field: string) {
    super(`Unique constraint failed on the fields: (\`${field}\`)`);
    this.name = "UniqueConstraintError";
    this.meta = { target: [field] };
  }
}

/**
 * Si `err` es una violación de unicidad (P2002) devuelve el campo afectado
 * ("barcode", "sku", "publicCode" o "unknown"); si no, null.
 */
export function uniqueViolationField(err: unknown): "barcode" | "sku" | "publicCode" | "unknown" | null {
  if (!err || typeof err !== "object" || (err as { code?: unknown }).code !== "P2002") return null;
  const target = (err as { meta?: { target?: unknown } }).meta?.target;
  const text = Array.isArray(target) ? target.join(",") : String(target ?? "");
  if (/barcode/i.test(text)) return "barcode";
  if (/sku/i.test(text)) return "sku";
  if (/public_?code/i.test(text)) return "publicCode";
  return "unknown";
}

/** Un renglón pide más piezas de las que hay en la tienda; la venta no se registra. */
export class InsufficientStockError extends Error {
  readonly variantId: string;
  readonly available: number;
  readonly requested: number;
  constructor(variantId: string, available: number, requested: number) {
    super(`Stock insuficiente: hay ${available} y se piden ${requested}.`);
    this.name = "InsufficientStockError";
    this.variantId = variantId;
    this.available = available;
    this.requested = requested;
  }
}

/** La variante o la tienda de un movimiento de stock no existe. */
export class StockTargetNotFoundError extends Error {
  constructor(message = "La prenda o la tienda no existe.") {
    super(message);
    this.name = "StockTargetNotFoundError";
  }
}

/**
 * Regla de negocio de ventas incumplida (venta inexistente, estado que no
 * permite la operación, motivo vacío, dato inválido). El mensaje es para el operador.
 */
export class SalesRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesRuleError";
  }
}

/**
 * Reintento con un `clientRequestId` ya usado pero con otros datos (tienda,
 * canal, método o renglones distintos): no es el mismo cobro. La venta
 * guardada no cambia; el cliente debe cobrar con un identificador nuevo.
 */
export class SaleRequestConflictError extends Error {
  readonly saleNumber: number;
  constructor(saleNumber: number) {
    super(`La venta #${saleNumber} ya se registró con otros datos.`);
    this.name = "SaleRequestConflictError";
    this.saleNumber = saleNumber;
  }
}

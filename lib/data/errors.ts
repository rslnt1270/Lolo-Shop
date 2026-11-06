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
 * ("barcode", "sku" o "unknown"); si no, null.
 */
export function uniqueViolationField(err: unknown): "barcode" | "sku" | "unknown" | null {
  if (!err || typeof err !== "object" || (err as { code?: unknown }).code !== "P2002") return null;
  const target = (err as { meta?: { target?: unknown } }).meta?.target;
  const text = Array.isArray(target) ? target.join(",") : String(target ?? "");
  if (/barcode/i.test(text)) return "barcode";
  if (/sku/i.test(text)) return "sku";
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

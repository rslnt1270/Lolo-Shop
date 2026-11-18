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

/**
 * Regla de inventario incumplida (producto inactivo o unido, talla ya
 * existente sin código, …). El mensaje es para el operador.
 */
export class InventoryRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryRuleError";
  }
}

/** El producto o la talla que se quiere editar ya no existe. */
export class ProductNotFoundError extends Error {
  constructor(message = "El producto o la talla ya no existe.") {
    super(message);
    this.name = "ProductNotFoundError";
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
 * canal, método o renglones distintos) o por otro usuario: no es el mismo
 * cobro. La venta guardada no cambia; el cliente debe cobrar con un
 * identificador nuevo. `saleNumber` es `null` cuando la venta es de otro
 * usuario: no se revela ningún dato de esa venta.
 */
export class SaleRequestConflictError extends Error {
  readonly saleNumber: number | null;
  constructor(saleNumber: number | null) {
    super(
      saleNumber === null
        ? "Este cobro ya se registró con otros datos."
        : `La venta #${saleNumber} ya se registró con otros datos.`,
    );
    this.name = "SaleRequestConflictError";
    this.saleNumber = saleNumber;
  }
}

/** Texto para el operador cuando la transacción vence o no consigue conexión a tiempo. */
export const DB_TIMEOUT_TEXT = "La base tardó en responder; reintenta.";

/**
 * P2028: la transacción interactiva venció (`timeout`) o no arrancó a tiempo (`maxWait`).
 * P2024: no hubo conexión libre del pool a tiempo. En ambos casos no se escribió nada.
 */
export function isTransactionTimeout(err: unknown): boolean {
  const code = !!err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  return code === "P2028" || code === "P2024";
}

/**
 * Interbloqueo o conflicto de escritura: P2034 de Prisma, o SQLSTATE 40P01 (`deadlock detected`)
 * en `meta` o en el mensaje. Postgres aborta y revierte la transacción: no se escribió nada y basta reintentar.
 */
export function isDeadlock(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; meta?: unknown; message?: unknown };
  if (e.code === "P2034") return true;
  if (e.meta && typeof e.meta === "object" && (e.meta as { code?: unknown }).code === "40P01") return true;
  return typeof e.message === "string" && e.message.includes("40P01");
}

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

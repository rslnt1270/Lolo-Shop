// Sin "use server": helpers compartidos por las acciones de venta (en línea y sin internet).
import type { SaleRecord } from "@/lib/data/sales-source";
import { InsufficientStockError, SaleRequestConflictError, SalesRuleError } from "@/lib/data/errors";
import { UnauthenticatedError } from "@/lib/auth/errors";

export type SaleActionResult =
  | { ok: true; sale: SaleRecord }
  | {
      ok: false;
      /** `UNAVAILABLE`: el servidor no terminó; se reintenta con el mismo identificador. */
      code: "INVALID" | "FORBIDDEN" | "NO_STOCK" | "NOT_FOUND" | "UNAVAILABLE" | "PRICE_CHANGED";
      message: string;
      /** NO_STOCK: la prenda que no alcanzó. */
      variantId?: string;
      /** PRICE_CHANGED: el precio vigente de cada renglón que ya no coincide. */
      lines?: { variantId: string; price: number }[];
      /**
       * `request_conflict`: el identificador ya se usó en otra venta; el cliente
       * cobra con uno nuevo. `session_expired`: hay que volver a iniciar sesión.
       */
      reason?: "request_conflict" | "session_expired";
    };

export type Failure = Extract<SaleActionResult, { ok: false }>;

export const fail = (code: Failure["code"], message: string, extra: Partial<Failure> = {}): Failure => ({
  ok: false,
  code,
  message,
  ...extra,
});

export const sessionExpired = (): Failure =>
  fail("FORBIDDEN", "Tu sesión terminó. Vuelve a iniciar sesión.", { reason: "session_expired" });

function prismaCode(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^P\d{4}$/.test(code) ? code : null;
}

export function mapError(err: unknown, retryVerb: "cobrar" | "confirmar" | "anular"): Failure {
  if (err instanceof InsufficientStockError) {
    return fail(
      "NO_STOCK",
      `Solo hay ${err.available} de esta prenda en la tienda (pediste ${err.requested}).`,
      { variantId: err.variantId },
    );
  }
  if (err instanceof SaleRequestConflictError) {
    return fail(
      "INVALID",
      `La venta #${err.saleNumber} ya se registró con otros datos. Revisa el carrito y vuelve a cobrar.`,
      { reason: "request_conflict" },
    );
  }
  if (err instanceof SalesRuleError) {
    return fail(/no existe|no encontr/i.test(err.message) ? "NOT_FOUND" : "INVALID", err.message);
  }
  if (err instanceof UnauthenticatedError) return sessionExpired();
  switch (prismaCode(err)) {
    // Llave foránea: la tienda o la prenda se borró entre la pantalla y el cobro.
    case "P2003":
      return fail("INVALID", "La tienda o la prenda ya no existe.");
    // Transacción vencida (timeout o maxWait): Prisma hizo rollback.
    case "P2028":
      return fail("UNAVAILABLE", `El servidor tardó en responder. Intenta ${retryVerb} de nuevo.`);
  }
  throw err;
}

/**
 * Mapeo de la venta sin internet: el de `mapError` más P2024 (pool sin conexión
 * libre: no se escribió nada) como `UNAVAILABLE`, para que el teléfono reintente
 * con el mismo identificador. `NO_STOCK` no aplica (el modo sin internet descuenta
 * hasta 0); si apareciera sería un defecto y se reporta `INVALID` para que la venta
 * quede a la vista en el teléfono en lugar de reintentarse sin fin.
 */
export function mapOfflineError(err: unknown): Failure {
  if (prismaCode(err) === "P2024") {
    return fail("UNAVAILABLE", "El servidor tardó en responder. Intenta cobrar de nuevo.");
  }
  if (err instanceof InsufficientStockError) {
    return fail("INVALID", "No se pudo registrar la venta sin internet. Avisa al dueño.");
  }
  return mapError(err, "cobrar");
}

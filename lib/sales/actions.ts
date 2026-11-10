"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { UnauthenticatedError } from "@/lib/auth/errors";
import { getSalesSource } from "@/lib/data/get-sales-source";
import type { SaleRecord } from "@/lib/data/sales-source";
import { InsufficientStockError, SaleRequestConflictError, SalesRuleError } from "@/lib/data/errors";
import { MAX_CANCEL_REASON_LENGTH, validateNewSale } from "@/lib/domain/sale";
import prisma from "@/lib/prisma";

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

type Failure = Extract<SaleActionResult, { ok: false }>;

const fail = (code: Failure["code"], message: string, extra: Partial<Failure> = {}): Failure => ({
  ok: false,
  code,
  message,
  ...extra,
});
const toCents = (n: number) => Math.round(n * 100);

const sessionExpired = (): Failure =>
  fail("FORBIDDEN", "Tu sesión terminó. Vuelve a iniciar sesión.", { reason: "session_expired" });

function prismaCode(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^P\d{4}$/.test(code) ? code : null;
}

function mapError(err: unknown, retryVerb: "cobrar" | "confirmar" | "anular"): Failure {
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

/** Usuario de la sesión, o null si falta o expiró (la action responde FORBIDDEN, no lanza). */
async function sessionUser(): Promise<CurrentUser | null> {
  try {
    return await getCurrentUser();
  } catch (err) {
    if (err instanceof UnauthenticatedError) return null;
    throw err;
  }
}

export async function createSaleAction(input: unknown): Promise<SaleActionResult> {
  const user = await sessionUser();
  if (!user) return sessionExpired();
  const parsed = validateNewSale(input);
  if (!parsed.ok) return fail("INVALID", parsed.message);
  const sale = parsed.value;

  // Colaborador: solo su tienda. Manager con tienda asignada: solo esa (como R13).
  // Owner y manager sin tienda pueden vender en cualquiera.
  const storeBound =
    user.role === "collaborator" || (user.role === "manager" && !!user.locationId);
  if (storeBound && sale.locationId !== user.locationId) {
    return fail("FORBIDDEN", "Solo puedes vender en tu tienda.");
  }

  try {
    if (user.role === "collaborator") {
      const variants = await prisma.variant.findMany({
        where: { id: { in: sale.lines.map((l) => l.variantId) } },
        select: { id: true, price: true },
      });
      const prices = new Map(variants.map((v) => [v.id, Number(v.price)]));
      const changed = sale.lines.flatMap((l) => {
        const current = prices.get(l.variantId);
        return current !== undefined && toCents(current) !== toCents(l.unitPrice)
          ? [{ variantId: l.variantId, price: current }]
          : [];
      });
      if (changed.length > 0) {
        // El precio cambió desde que se escaneó: el colaborador cobra al vigente (el carrito se actualiza).
        return fail("PRICE_CHANGED", "Cambió el precio de una prenda. Revisa el total y cobra de nuevo.", {
          lines: changed,
        });
      }
    }

    const record = await getSalesSource().createSale(sale, user.id);
    revalidatePath("/ventas");
    return { ok: true, sale: record };
  } catch (err) {
    return mapError(err, "cobrar");
  }
}

export async function confirmSalePaymentAction(
  saleId: string,
  reference?: string,
): Promise<SaleActionResult> {
  const user = await sessionUser();
  if (!user) return sessionExpired();
  if (user.role !== "owner" && user.role !== "manager") {
    return fail("FORBIDDEN", "Solo el dueño o el encargado pueden confirmar pagos.");
  }
  if (typeof saleId !== "string" || !saleId) return fail("INVALID", "La venta no es válida.");
  try {
    // El encargado con tienda solo confirma cobros de esa tienda (R13).
    if (user.role === "manager" && user.locationId) {
      const target = await prisma.sale.findUnique({ where: { id: saleId }, select: { locationId: true } });
      if (!target) return fail("NOT_FOUND", "La venta no existe.");
      if (target.locationId !== user.locationId) {
        return fail("FORBIDDEN", "Solo puedes confirmar pagos de tu tienda.");
      }
    }
    const sale = await getSalesSource().confirmPayment(saleId, user.id, reference);
    revalidatePath("/ventas");
    return { ok: true, sale };
  } catch (err) {
    return mapError(err, "confirmar");
  }
}

export async function cancelSaleAction(
  saleId: string,
  reason: string,
  itemsReturned: boolean,
): Promise<SaleActionResult> {
  const user = await sessionUser();
  if (!user) return sessionExpired();
  if (user.role !== "owner") {
    return fail("FORBIDDEN", "Solo el dueño puede anular ventas.");
  }
  if (typeof saleId !== "string" || !saleId) return fail("INVALID", "La venta no es válida.");
  const cleanReason = typeof reason === "string" ? reason.trim() : "";
  if (cleanReason === "") {
    return fail("INVALID", "Indica el motivo de la anulación.");
  }
  if (cleanReason.length > MAX_CANCEL_REASON_LENGTH) {
    return fail("INVALID", `El motivo no puede pasar de ${MAX_CANCEL_REASON_LENGTH} caracteres.`);
  }
  if (typeof itemsReturned !== "boolean") {
    return fail("INVALID", "Indica si la prenda regresó a la tienda.");
  }
  try {
    const sale = await getSalesSource().cancelSale(saleId, user.id, cleanReason, itemsReturned);
    revalidatePath("/ventas");
    return { ok: true, sale };
  } catch (err) {
    return mapError(err, "anular");
  }
}

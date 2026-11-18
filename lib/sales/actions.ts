"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth/errors";
import { assertCanOperate } from "@/lib/auth/permissions";
import { getSalesSource } from "@/lib/data/get-sales-source";
import { MAX_CANCEL_REASON_LENGTH, validateNewSale } from "@/lib/domain/sale";
import prisma from "@/lib/prisma";
import { fail, mapError, sessionExpired, type SaleActionResult } from "./action-errors";

export type { SaleActionResult } from "./action-errors";

const toCents = (n: number) => Math.round(n * 100);

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

  // Cualquier rol vende en la tienda elegida; si no existe, la llave foránea responde (P2003 → INVALID).
  try {
    assertCanOperate(user, sale.locationId);
  } catch (err) {
    if (err instanceof ForbiddenError) return fail("FORBIDDEN", err.message);
    throw err;
  }

  try {
    // Un reintento (id ya registrado) lo resuelve createSale: replay o request_conflict, sin evaluar el precio.
    if (user.role === "collaborator" && !(await getSalesSource().hasClientRequest(sale.clientRequestId))) {
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

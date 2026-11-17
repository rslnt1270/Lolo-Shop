"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { UnauthenticatedError } from "@/lib/auth/errors";
import { getSalesSource } from "@/lib/data/get-sales-source";
import { MAX_REVIEW_NOTE_LENGTH, type ReviewItem } from "@/lib/data/sales-source";
import { MAX_CANCEL_REASON_LENGTH } from "@/lib/domain/sale";
import { fail, mapError, sessionExpired, type SaleActionResult } from "./action-errors";

const NOT_OWNER = "Solo el dueño aprueba ventas sin internet.";

/** Usuario de la sesión (rol releído de la BD), o null si falta o expiró. */
async function sessionUser(): Promise<CurrentUser | null> {
  try {
    return await getCurrentUser();
  } catch (err) {
    if (err instanceof UnauthenticatedError) return null;
    throw err;
  }
}

function refresh() {
  revalidatePath("/ventas");
  revalidatePath("/ventas/revision");
}

/** `null`: la sesión terminó. Otro rol recibe lista vacía (nunca datos). */
export async function listReviewAction(): Promise<ReviewItem[] | null> {
  const user = await sessionUser();
  if (!user) return null;
  if (user.role !== "owner") return [];
  return getSalesSource().listSalesForReview();
}

export async function approveReviewAction(saleId: string, note?: string): Promise<SaleActionResult> {
  const user = await sessionUser();
  if (!user) return sessionExpired();
  if (user.role !== "owner") return fail("FORBIDDEN", NOT_OWNER);
  if (typeof saleId !== "string" || !saleId) return fail("INVALID", "La venta no es válida.");
  if (note !== undefined && typeof note !== "string") return fail("INVALID", "La nota no es válida.");
  const clean = note?.trim() || undefined;
  if (clean && clean.length > MAX_REVIEW_NOTE_LENGTH) {
    return fail("INVALID", `La nota no puede pasar de ${MAX_REVIEW_NOTE_LENGTH} caracteres.`);
  }
  try {
    const sale = await getSalesSource().approveReview(saleId, user.id, clean);
    refresh();
    return { ok: true, sale };
  } catch (err) {
    return mapError(err, "confirmar");
  }
}

export async function rejectReviewAction(
  saleId: string,
  reason: string,
  itemsReturned: boolean,
): Promise<SaleActionResult> {
  const user = await sessionUser();
  if (!user) return sessionExpired();
  if (user.role !== "owner") return fail("FORBIDDEN", NOT_OWNER);
  if (typeof saleId !== "string" || !saleId) return fail("INVALID", "La venta no es válida.");
  const clean = typeof reason === "string" ? reason.trim() : "";
  if (clean === "") return fail("INVALID", "Indica el motivo del rechazo.");
  if (clean.length > MAX_CANCEL_REASON_LENGTH) {
    return fail("INVALID", `El motivo no puede pasar de ${MAX_CANCEL_REASON_LENGTH} caracteres.`);
  }
  if (typeof itemsReturned !== "boolean") return fail("INVALID", "Indica si la prenda regresó a la tienda.");
  try {
    const sale = await getSalesSource().rejectReview(saleId, user.id, clean, itemsReturned);
    refresh();
    return { ok: true, sale };
  } catch (err) {
    return mapError(err, "anular");
  }
}

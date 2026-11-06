"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getSalesSource } from "@/lib/data/get-sales-source";
import type { SaleRecord } from "@/lib/data/sales-source";
import { InsufficientStockError, SalesRuleError } from "@/lib/data/errors";
import { validateNewSale } from "@/lib/domain/sale";
import prisma from "@/lib/prisma";

export type SaleActionResult =
  | { ok: true; sale: SaleRecord }
  | { ok: false; code: "INVALID" | "FORBIDDEN" | "NO_STOCK" | "NOT_FOUND"; message: string };

type Failure = Extract<SaleActionResult, { ok: false }>;

const fail = (code: Failure["code"], message: string): Failure => ({ ok: false, code, message });
const toCents = (n: number) => Math.round(n * 100);

function mapError(err: unknown): Failure {
  if (err instanceof InsufficientStockError) {
    return fail(
      "NO_STOCK",
      `Solo hay ${err.available} de esta prenda en la tienda (pediste ${err.requested}).`,
    );
  }
  if (err instanceof SalesRuleError) {
    return fail(/no existe|no encontr/i.test(err.message) ? "NOT_FOUND" : "INVALID", err.message);
  }
  throw err;
}

export async function createSaleAction(input: unknown): Promise<SaleActionResult> {
  const user = await getCurrentUser();
  const parsed = validateNewSale(input);
  if (!parsed.ok) return fail("INVALID", parsed.message);
  const sale = parsed.value;

  if (user.role === "collaborator" && sale.locationId !== user.locationId) {
    return fail("FORBIDDEN", "Solo puedes vender en tu tienda.");
  }

  if (user.role === "collaborator") {
    const variants = await prisma.variant.findMany({
      where: { id: { in: sale.lines.map((l) => l.variantId) } },
      select: { id: true, price: true },
    });
    const prices = new Map(variants.map((v) => [v.id, toCents(Number(v.price))]));
    const changed = sale.lines.some((l) => {
      const current = prices.get(l.variantId);
      return current !== undefined && current !== toCents(l.unitPrice);
    });
    if (changed) {
      return fail("INVALID", "Solo el dueño o el encargado pueden cambiar el precio.");
    }
  }

  try {
    const record = await getSalesSource().createSale(sale, user.id);
    if (record.locationId !== sale.locationId) {
      return fail("INVALID", "Esta venta ya se registró con otros datos. Recarga la pantalla.");
    }
    revalidatePath("/ventas");
    return { ok: true, sale: record };
  } catch (err) {
    return mapError(err);
  }
}

export async function confirmSalePaymentAction(
  saleId: string,
  reference?: string,
): Promise<SaleActionResult> {
  const user = await getCurrentUser();
  if (user.role !== "owner" && user.role !== "manager") {
    return fail("FORBIDDEN", "Solo el dueño o el encargado pueden confirmar pagos.");
  }
  try {
    const sale = await getSalesSource().confirmPayment(saleId, user.id, reference);
    revalidatePath("/ventas");
    return { ok: true, sale };
  } catch (err) {
    return mapError(err);
  }
}

export async function cancelSaleAction(
  saleId: string,
  reason: string,
  itemsReturned: boolean,
): Promise<SaleActionResult> {
  const user = await getCurrentUser();
  if (user.role !== "owner") {
    return fail("FORBIDDEN", "Solo el dueño puede anular ventas.");
  }
  if (typeof reason !== "string" || reason.trim() === "") {
    return fail("INVALID", "Indica el motivo de la anulación.");
  }
  try {
    const sale = await getSalesSource().cancelSale(saleId, user.id, reason.trim(), itemsReturned);
    revalidatePath("/ventas");
    return { ok: true, sale };
  } catch (err) {
    return mapError(err);
  }
}

"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { getSalesSource } from "@/lib/data/get-sales-source";
import type { DashboardData, DashboardQuery } from "@/lib/data/sales-source";
import { UnauthenticatedError } from "@/lib/auth/errors";
import { SalesRuleError } from "@/lib/data/errors";
import { scopeDashboardQuery } from "@/lib/domain/dashboard-scope";
import { businessDateMx } from "@/lib/domain/sale";

const SESSION_EXPIRED = "Tu sesión terminó. Vuelve a iniciar sesión.";

/** Usuario de la sesión, o null si falta o expiró (las actions responden con su forma de error, no lanzan). */
async function sessionUser(): Promise<CurrentUser | null> {
  try {
    return await getCurrentUser();
  } catch (err) {
    if (err instanceof UnauthenticatedError) return null;
    throw err;
  }
}

/** El rango y las tiendas se recortan aquí por rol; la UI solo sugiere. */
export async function getDashboardAction(
  requested: Partial<DashboardQuery> = {},
): Promise<{ query: DashboardQuery; data: DashboardData } | { error: "session_expired" }> {
  const user = await sessionUser();
  if (!user) return { error: "session_expired" };
  const query = scopeDashboardQuery(user, requested, businessDateMx(new Date()));
  const data = await getSalesSource().getDashboard(query);
  return { query, data };
}

/** `null`: la sesión terminó. */
export async function getLowStockThresholdAction(): Promise<number | null> {
  if (!(await sessionUser())) return null;
  return getSalesSource().getLowStockThreshold();
}

export async function setLowStockThresholdAction(n: number): Promise<{ ok: boolean; message?: string }> {
  const user = await sessionUser();
  if (!user) return { ok: false, message: SESSION_EXPIRED };
  if (user.role !== "owner") return { ok: false, message: "Solo el dueño puede cambiar el umbral." };
  try {
    await getSalesSource().setLowStockThreshold(n, user.id);
  } catch (err) {
    if (err instanceof SalesRuleError) return { ok: false, message: err.message };
    throw err;
  }
  revalidatePath("/ventas");
  return { ok: true };
}

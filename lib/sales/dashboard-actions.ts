"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getSalesSource } from "@/lib/data/get-sales-source";
import type { DashboardData, DashboardQuery } from "@/lib/data/sales-source";
import { SalesRuleError } from "@/lib/data/errors";
import { scopeDashboardQuery } from "@/lib/domain/dashboard-scope";
import { businessDateMx } from "@/lib/domain/sale";

/** El rango y las tiendas se recortan aquí por rol; la UI solo sugiere. */
export async function getDashboardAction(
  requested: Partial<DashboardQuery> = {},
): Promise<{ query: DashboardQuery; data: DashboardData }> {
  const user = await getCurrentUser();
  const query = scopeDashboardQuery(user, requested, businessDateMx(new Date()));
  const data = await getSalesSource().getDashboard(query);
  return { query, data };
}

export async function getLowStockThresholdAction(): Promise<number> {
  await getCurrentUser();
  return getSalesSource().getLowStockThreshold();
}

export async function setLowStockThresholdAction(n: number): Promise<{ ok: boolean; message?: string }> {
  const user = await getCurrentUser();
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

"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { UnauthenticatedError } from "@/lib/auth/errors";
import { DB_TIMEOUT_TEXT, isTransactionTimeout } from "@/lib/data/errors";
import { INVENTORY_TX_OPTIONS } from "@/lib/data/tx-options";
import { checkBrandName } from "@/lib/domain/brand";
import prisma from "@/lib/prisma";

export interface BrandOption {
  id: string;
  name: string;
  slug: string;
}

export interface DepartmentOption {
  id: string;
  slug: string;
  name: string;
}

export type CreateBrandResult = { ok: true; brand: BrandOption } | { ok: false; message: string };

export type MergeBrandsResult =
  | { ok: true }
  | { ok: false; code: "FORBIDDEN" | "INVALID" | "NOT_FOUND" | "ERROR"; message: string };

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

const toOption = (b: { id: string; name: string; slug: string }): BrandOption => ({
  id: b.id,
  name: b.name,
  slug: b.slug,
});

/** Marcas activas para el combo del alta, por nombre. `null`: la sesión terminó. */
export async function listBrandsAction(): Promise<BrandOption[] | null> {
  if (!(await sessionUser())) return null;
  const rows = await prisma.brand.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  return rows.map(toOption);
}

/** Departamentos activos en el orden que fija el owner. `null`: la sesión terminó. */
export async function listDepartmentsAction(): Promise<DepartmentOption[] | null> {
  if (!(await sessionUser())) return null;
  const rows = await prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((d) => ({ id: d.id, slug: d.slug, name: d.name }));
}

/**
 * Crea una marca durante el alta (cualquier rol, ER §2.3 D7). Si el slug ya
 * existe reutiliza esa marca: "GUESS" y "guess " caen en `guess`.
 */
export async function createBrandAction(name: string): Promise<CreateBrandResult> {
  const user = await sessionUser();
  if (!user) return { ok: false, message: SESSION_EXPIRED };
  const checked = checkBrandName(name);
  if (!checked.ok) return checked;

  const reuse = (existing: { id: string; name: string; slug: string; isActive: boolean }): CreateBrandResult =>
    existing.isActive
      ? { ok: true, brand: toOption(existing) }
      : { ok: false, message: `«${existing.name}» se fusionó con otra marca. Elige la marca vigente de la lista.` };

  const existing = await prisma.brand.findUnique({ where: { slug: checked.slug } });
  if (existing) return reuse(existing);

  try {
    const created = await prisma.brand.create({
      data: { name: checked.name, slug: checked.slug, createdById: user.id },
    });
    return { ok: true, brand: toOption(created) };
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code !== "P2002") throw err;
    // Otra caja creó la misma marca al mismo tiempo: se usa la ganadora.
    const winner = await prisma.brand.findUnique({ where: { slug: checked.slug } });
    if (!winner) throw err;
    return reuse(winner);
  }
}

/**
 * Fusiona una marca duplicada en la canónica (solo owner, ER §2.3): reasigna
 * productos y líneas de venta y deja la duplicada inactiva (no se borra).
 */
export async function mergeBrandsAction(fromId: string, intoId: string): Promise<MergeBrandsResult> {
  const user = await sessionUser();
  if (!user) return { ok: false, code: "FORBIDDEN", message: SESSION_EXPIRED };
  if (user.role !== "owner") {
    return { ok: false, code: "FORBIDDEN", message: "Solo el dueño puede fusionar marcas." };
  }
  if (!fromId || !intoId || fromId === intoId) {
    return { ok: false, code: "INVALID", message: "Elige dos marcas distintas." };
  }
  const [from, into] = await Promise.all([
    prisma.brand.findUnique({ where: { id: fromId } }),
    prisma.brand.findUnique({ where: { id: intoId } }),
  ]);
  if (!from || !into || !into.isActive) {
    return { ok: false, code: "NOT_FOUND", message: "La marca no existe o ya no está activa." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.updateMany({ where: { brandId: from.id }, data: { brandId: into.id, brand: into.name } });
      await tx.saleLine.updateMany({ where: { brandId: from.id }, data: { brandId: into.id } });
      await tx.brand.update({ where: { id: from.id }, data: { isActive: false } });
    }, INVENTORY_TX_OPTIONS);
  } catch (err) {
    // P2028/P2024: la transacción venció sin escribir nada; el dueño puede reintentar.
    if (isTransactionTimeout(err)) return { ok: false, code: "ERROR", message: DB_TIMEOUT_TEXT };
    throw err;
  }
  revalidatePath("/productos");
  return { ok: true };
}

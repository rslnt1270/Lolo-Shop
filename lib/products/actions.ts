"use server";
import { revalidatePath } from "next/cache";
import { ForbiddenError } from "@/lib/auth/errors";
import { PRICE_EDIT_ROLES, currentUserOrNull, requireRole } from "@/lib/auth/permissions";
import { getDataSource } from "@/lib/data/get-source";
import { DB_TIMEOUT_TEXT, InventoryRuleError, ProductNotFoundError, isTransactionTimeout } from "@/lib/data/errors";
import type { ProductPatch } from "@/lib/data/source";
import { loadTypeRule } from "@/lib/catalog/type-rule";
import { MAX_PRICE, MAX_TITLE_LENGTH, roundToCents } from "@/lib/domain/new-product";
import { STYLE_OPTIONS } from "@/lib/domain/product-types-catalog";
import { MSG_PICK_TYPE, MSG_TYPE_INACTIVE, validateClassification } from "@/lib/domain/product-taxonomy";
import { validateReason } from "@/lib/domain/stock-movement";
import type { Role } from "@/lib/domain/types";
import prisma from "@/lib/prisma";
import { SESSION_EXPIRED_TEXT } from "@/lib/session-text";

export type UpdateVariantPriceResult =
  | { ok: true; price: number }
  | {
      ok: false;
      code: "SESSION" | "FORBIDDEN" | "INVALID" | "CONFLICT" | "NOT_FOUND" | "ERROR";
      message: string;
      /** CONFLICT: el precio que tiene la talla ahora. */
      currentPrice?: number;
    };

export type PriceChangeRow = { oldPrice: number; newPrice: number; userName: string; createdAt: string };

export type ProductAdminResult =
  | { ok: true; updated?: number; /** Solo si > 0: productos que perdieron un estilo que el tipo nuevo no admite. */ styleCleared?: number }
  | { ok: false; code: "SESSION" | "FORBIDDEN" | "INVALID" | "NOT_FOUND" | "ERROR"; message: string };

export type MergeResult =
  | { ok: true; movedVariants: number; movedSaleLines: number; alreadyMerged: number }
  | { ok: false; code: "SESSION" | "FORBIDDEN" | "INVALID" | "ERROR"; message: string };

const MAX_BATCH = 100;
const HISTORY_LIMIT = 5;
const ROLES = ["owner", "manager"] as const;
const OWNER_ONLY = ["owner"] as const;

type Gate = { ok: true; userId: string } | { ok: false; code: "SESSION" | "FORBIDDEN"; message: string };

/** Sesión vigente de la base y rol owner o manager (o el que se indique). */
async function gate(roles: readonly Role[] = ROLES): Promise<Gate> {
  const user = await currentUserOrNull();
  if (!user) return { ok: false, code: "SESSION", message: SESSION_EXPIRED_TEXT };
  try {
    requireRole(user, roles);
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, code: "FORBIDDEN", message: err.message };
    throw err;
  }
  return { ok: true, userId: user.id };
}

const invalid = (message: string) => ({ ok: false as const, code: "INVALID" as const, message });
const notFound = (message: string) => ({ ok: false as const, code: "NOT_FOUND" as const, message });
/** P2028/P2024: la transacción venció sin escribir nada; el operador puede reintentar. */
const dbTimeout = () => ({ ok: false as const, code: "ERROR" as const, message: DB_TIMEOUT_TEXT });

function refresh() {
  revalidatePath("/productos");
  revalidatePath("/catalogo");
}

export async function updateVariantPriceAction(input: {
  variantId: string;
  newPrice: number;
  expectedPrice: number;
  reason?: string;
}): Promise<UpdateVariantPriceResult> {
  const g = await gate(PRICE_EDIT_ROLES);
  if (!g.ok) return g;

  const { variantId, newPrice, expectedPrice } = input ?? ({} as typeof input);
  if (typeof variantId !== "string" || !variantId) return invalid("Falta la talla.");
  if (typeof newPrice !== "number" || !Number.isFinite(newPrice) || newPrice <= 0) {
    return invalid("El precio debe ser mayor que cero.");
  }
  if (newPrice > MAX_PRICE) return invalid("El precio no puede pasar de $99,999,999.99.");
  if (roundToCents(newPrice) !== newPrice) return invalid("El precio puede tener máximo 2 decimales.");
  if (typeof expectedPrice !== "number" || !Number.isFinite(expectedPrice)) return invalid("Falta el precio actual.");
  if (roundToCents(expectedPrice) === newPrice) return invalid("Ese ya es el precio actual.");

  let reason: string | null;
  try {
    reason = validateReason(input.reason, false);
  } catch (err) {
    return invalid(err instanceof Error ? err.message : "Motivo inválido.");
  }

  try {
    const res = await getDataSource().updateVariantPrice(variantId, roundToCents(expectedPrice), newPrice, g.userId, reason);
    if (!res.ok) {
      if (res.currentPrice === newPrice) return invalid("Ese ya es el precio actual.");
      return {
        ok: false,
        code: "CONFLICT",
        message: "Alguien cambió este precio. Revisa el precio vigente y guarda de nuevo.",
        currentPrice: res.currentPrice,
      };
    }
    refresh();
    return { ok: true, price: res.price };
  } catch (err) {
    if (err instanceof ProductNotFoundError) return notFound(err.message);
    if (isTransactionTimeout(err)) return dbTimeout();
    throw err;
  }
}

/** Últimos 5 cambios de precio de la talla. `null`: sin sesión o sin permiso. */
export async function listPriceChangesAction(variantId: string): Promise<PriceChangeRow[] | null> {
  const g = await gate(PRICE_EDIT_ROLES);
  if (!g.ok) return null;
  if (typeof variantId !== "string" || !variantId) return [];
  return await getDataSource().listPriceChanges(variantId, HISTORY_LIMIT);
}

export async function updateProductAction(input: {
  productId: string;
  title?: string;
  brandId?: string;
  departmentId?: string;
  /** Bloque de clasificación: con cualquiera de estos cuatro, `departmentId` y `productTypeId` son obligatorios. */
  productTypeId?: string;
  style?: string | null;
  audience?: string | null;
}): Promise<ProductAdminResult> {
  const g = await gate();
  if (!g.ok) return g;

  const { productId } = input ?? ({} as typeof input);
  if (typeof productId !== "string" || !productId) return invalid("Falta el producto.");

  const patch: ProductPatch = {};
  if (input.title !== undefined) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title) return invalid("Escribe el título.");
    if (title.length > MAX_TITLE_LENGTH) return invalid(`El título no puede pasar de ${MAX_TITLE_LENGTH} caracteres.`);
    patch.title = title;
  }
  if (input.brandId !== undefined) {
    const brand =
      typeof input.brandId === "string" && input.brandId
        ? await prisma.brand.findUnique({ where: { id: input.brandId }, select: { name: true, isActive: true } })
        : null;
    if (!brand?.isActive) return invalid("Esa marca ya no está activa. Elige otra de la lista.");
    patch.brandId = input.brandId;
    patch.brand = brand.name;
  }
  const hasBlock =
    input.departmentId !== undefined || input.productTypeId !== undefined ||
    input.style !== undefined || input.audience !== undefined;
  if (hasBlock) {
    // Departamento, tipo, estilo y «para» se validan juntos y se escriben juntos.
    const departmentId = typeof input.departmentId === "string" ? input.departmentId : "";
    const productTypeId = typeof input.productTypeId === "string" ? input.productTypeId : "";
    if (!departmentId || !productTypeId) return invalid("Elige departamento y tipo.");
    const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { isActive: true, slug: true } });
    if (!department?.isActive) return invalid("Ese departamento ya no está activo. Elige otro de la lista.");
    const type = await loadTypeRule(productTypeId, departmentId);
    let classification;
    try {
      classification = validateClassification({
        departmentSlug: department.slug,
        type: type?.rule ?? null,
        style: input.style,
        audience: input.audience,
      });
    } catch (err) {
      return invalid(err instanceof Error ? err.message : MSG_PICK_TYPE);
    }
    patch.departmentId = departmentId;
    patch.productTypeId = productTypeId;
    patch.category = type!.name;
    patch.style = classification.style;
    patch.audience = classification.audience;
  }
  if (Object.keys(patch).length === 0) return invalid("No hay cambios que guardar.");

  try {
    await getDataSource().updateProduct(productId, patch);
    refresh();
    return { ok: true };
  } catch (err) {
    if (err instanceof ProductNotFoundError) return notFound(err.message);
    throw err;
  }
}

export async function setProductActiveAction(productId: string, active: boolean): Promise<ProductAdminResult> {
  const g = await gate();
  if (!g.ok) return g;
  if (typeof productId !== "string" || !productId) return invalid("Falta el producto.");
  if (typeof active !== "boolean") return invalid("Indica si el producto se activa o se desactiva.");
  try {
    await getDataSource().setProductActive(productId, active);
    refresh();
    return { ok: true };
  } catch (err) {
    if (err instanceof ProductNotFoundError) return notFound(err.message);
    if (err instanceof InventoryRuleError) return invalid(err.message);
    throw err;
  }
}

export async function setVariantActiveAction(variantId: string, active: boolean): Promise<ProductAdminResult> {
  const g = await gate();
  if (!g.ok) return g;
  if (typeof variantId !== "string" || !variantId) return invalid("Falta la talla.");
  if (typeof active !== "boolean") return invalid("Indica si la talla se activa o se desactiva.");
  try {
    await getDataSource().setVariantActive(variantId, active);
    refresh();
    return { ok: true };
  } catch (err) {
    if (err instanceof ProductNotFoundError) return notFound(err.message);
    if (err instanceof InventoryRuleError) return invalid(err.message);
    throw err;
  }
}

export async function assignDepartmentAction(productIds: string[], departmentId: string): Promise<ProductAdminResult> {
  const g = await gate();
  if (!g.ok) return g;
  if (!Array.isArray(productIds) || productIds.some((id) => typeof id !== "string" || !id)) {
    return invalid("La selección no es válida.");
  }
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return invalid("Elige al menos un producto.");
  if (ids.length > MAX_BATCH) return invalid(`Puedes asignar hasta ${MAX_BATCH} productos a la vez.`);
  const department =
    typeof departmentId === "string" && departmentId
      ? await prisma.department.findUnique({ where: { id: departmentId }, select: { isActive: true } })
      : null;
  if (!department?.isActive) return invalid("Ese departamento ya no está activo. Elige otro de la lista.");

  const updated = await getDataSource().assignDepartment(ids, departmentId);
  refresh();
  return { ok: true, updated };
}

/**
 * Reclasifica en lote por tipo (owner o manager). El tipo debe estar activo; si
 * algún producto con departamento no lo admite, nada cambia. El estilo que el
 * tipo nuevo no admite se borra (`styleCleared`).
 */
export async function assignProductTypeAction(productIds: string[], productTypeId: string): Promise<ProductAdminResult> {
  const g = await gate();
  if (!g.ok) return g;
  if (!Array.isArray(productIds) || productIds.some((id) => typeof id !== "string" || !id)) {
    return invalid("La selección no es válida.");
  }
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return invalid("Elige al menos un producto.");
  if (ids.length > MAX_BATCH) return invalid(`Puedes asignar hasta ${MAX_BATCH} productos a la vez.`);
  const type = await loadTypeRule(typeof productTypeId === "string" ? productTypeId : "", null);
  if (!type) return invalid(MSG_PICK_TYPE);
  if (!type.rule.isActive) return invalid(MSG_TYPE_INACTIVE);

  try {
    const res = await getDataSource().assignProductType(ids, {
      productTypeId,
      category: type.name,
      allowedStyles: (STYLE_OPTIONS[type.slug] ?? []).map((s) => s.slug),
    });
    refresh();
    return { ok: true, updated: res.updated, ...(res.styleCleared > 0 ? { styleCleared: res.styleCleared } : {}) };
  } catch (err) {
    if (err instanceof InventoryRuleError) return invalid(err.message);
    if (isTransactionTimeout(err)) return dbTimeout();
    throw err;
  }
}

/** Une productos duplicados por talla. Solo el dueño, releído de la base. */
export async function mergeProductsAction(input: { targetId: string; sourceIds: string[] }): Promise<MergeResult> {
  const g = await gate(OWNER_ONLY);
  if (!g.ok) return g;

  const { targetId, sourceIds } = input ?? ({} as typeof input);
  if (typeof targetId !== "string" || !targetId) return invalid("Elige el producto que se queda.");
  if (!Array.isArray(sourceIds) || sourceIds.some((id) => typeof id !== "string" || !id)) {
    return invalid("La selección no es válida.");
  }
  const sources = [...new Set(sourceIds)];
  if (sources.length === 0) return invalid("Elige al menos un producto para unir.");
  if (sources.includes(targetId)) return invalid("El producto que se queda no puede ser también uno de los que se unen.");
  if (sources.length > MAX_BATCH) return invalid(`Puedes unir hasta ${MAX_BATCH} productos a la vez.`);

  try {
    const res = await getDataSource().mergeProducts(targetId, sources, g.userId);
    refresh();
    return { ok: true, ...res };
  } catch (err) {
    if (err instanceof InventoryRuleError) return invalid(err.message);
    if (isTransactionTimeout(err)) return dbTimeout();
    throw err;
  }
}

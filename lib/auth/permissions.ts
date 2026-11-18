import type { Role } from "@/lib/domain/types";
import { getCurrentUser, type CurrentUser } from "./current-user";
import { ForbiddenError, UnauthenticatedError } from "./errors";

/** Roles que pueden editar el precio de una talla y ver su historial. */
export const PRICE_EDIT_ROLES = ["owner", "manager", "collaborator"] as const satisfies readonly Role[];

/**
 * Cualquier rol opera en la tienda que eligió (spec traspaso §5.1): ya no se compara
 * con `user.locationId`. Solo exige que haya una tienda elegida; su existencia la
 * garantiza la llave foránea al escribir (P2003 → `StockTargetNotFoundError` / `NOT_FOUND`).
 */
export function assertCanOperate(_user: CurrentUser, locationId: string): void {
  if (typeof locationId !== "string" || locationId === "") {
    throw new ForbiddenError("Elige en qué tienda estás.");
  }
}

export function requireRole(user: CurrentUser, roles: readonly Role[]): void {
  if (!roles.includes(user.role)) {
    throw new ForbiddenError("No tienes permiso para hacer esto.");
  }
}

/** Usuario vigente de la base, o `null` si no hay sesión válida. Otros errores se relanzan. */
export async function currentUserOrNull(): Promise<CurrentUser | null> {
  try {
    return await getCurrentUser();
  } catch (err) {
    if (err instanceof UnauthenticatedError) return null;
    throw err;
  }
}

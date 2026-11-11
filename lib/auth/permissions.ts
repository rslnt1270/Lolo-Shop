import type { Role } from "@/lib/domain/types";
import { getCurrentUser, type CurrentUser } from "./current-user";
import { ForbiddenError, UnauthenticatedError } from "./errors";

/** Roles que pueden editar el precio de una talla y ver su historial. */
export const PRICE_EDIT_ROLES = ["owner", "manager", "collaborator"] as const satisfies readonly Role[];

/** Colaborador, o manager con tienda asignada: opera solo en su `locationId`. */
export function isStoreBound(user: CurrentUser): boolean {
  return user.role === "collaborator" || (user.role === "manager" && !!user.locationId);
}

export function assertCanOperate(user: CurrentUser, locationId: string): void {
  if (user.role === "collaborator" && !user.locationId) {
    throw new ForbiddenError("No tienes tienda asignada. Pide al dueño que te asigne una.");
  }
  if (isStoreBound(user) && user.locationId !== locationId) {
    throw new ForbiddenError("Solo puedes operar en tu tienda asignada.");
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

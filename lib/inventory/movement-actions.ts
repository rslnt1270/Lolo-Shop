"use server";
import { currentUserOrNull } from "@/lib/auth/permissions";
import { getDataSource } from "@/lib/data/get-source";
import type { MovementPage } from "@/lib/data/source";
import { scopeMovementQuery, type MovementFilter } from "@/lib/domain/movement-scope";
import type { Location } from "@/lib/domain/types";
import { businessTodayMx } from "@/lib/sales/format";

export type { MovementFilter };

/**
 * Historial de movimientos (RF-INV-09). Rol y tienda se releen de la base y el
 * servidor recorta el alcance (`scopeMovementQuery`). `null`: sesión vencida;
 * `{ error }`: rango inválido o falla al leer. Nunca lanza.
 */
export async function listMovementsAction(filter: MovementFilter): Promise<MovementPage | { error: string } | null> {
  try {
    const user = await currentUserOrNull();
    if (!user) return null;
    const scoped = scopeMovementQuery(user, filter, businessTodayMx());
    if (!scoped.ok) return { error: scoped.message };
    return await getDataSource().listMovements(scoped.query);
  } catch {
    return { error: "No se pudo cargar el historial. Intenta de nuevo." };
  }
}

export interface MovementFilterOptions {
  locations: Location[];
  users: { id: string; name: string }[];
}

/** Opciones de los filtros Tienda y Persona. El colaborador no elige persona. `null`: sesión vencida. */
export async function movementFilterOptionsAction(): Promise<MovementFilterOptions | null> {
  try {
    const user = await currentUserOrNull();
    if (!user) return null;
    const ds = getDataSource();
    const locations = (await ds.getLocations()).filter((l) => (l.type ?? "store") === "store" || user.role === "owner");
    const users = user.role === "collaborator" ? [] : await ds.listMovementActors();
    return { locations, users };
  } catch {
    return { locations: [], users: [] };
  }
}

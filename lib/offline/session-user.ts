import type { Role } from "@/lib/domain/types";
import { withTimeout } from "./timeout";

/** Plazo para leer la sesión: en lie-fi no se espera para siempre. */
export const SESSION_TIMEOUT_MS = 8_000;

/**
 * Usuario de la sesión de next-auth en este momento, leído del servidor.
 *
 * No usa `getSession()` de `next-auth/react` porque ese convierte una falla de
 * red en `null` ("sin sesión"), y el motor de sincronización debe distinguir
 * "sin red" (reintentar con espera) de "sin sesión" (pedir iniciar sesión).
 * Lanza si la red o el servidor fallan o no responden en `timeoutMs` (la
 * petición se aborta); `null` si no hay sesión.
 */
export async function fetchSessionUserId(timeoutMs: number = SESSION_TIMEOUT_MS): Promise<string | null> {
  const body = await fetchSessionBody(timeoutMs);
  const id = (body as { user?: { id?: unknown } } | null)?.user?.id;
  return typeof id === "string" && id !== "" ? id : null;
}

export interface SessionUser {
  id: string;
  role: Role;
  locationId: string | null;
}

const ROLES: readonly string[] = ["owner", "manager", "collaborator"];

/**
 * Como `fetchSessionUserId`, pero con rol y tienda: `/pos` lo usa para
 * revalidar la sesión al volver la conexión (next-auth no vuelve a pedir una
 * sesión que quedó en null). Lanza si la red o el servidor fallan; `null` si
 * no hay sesión válida.
 */
export async function fetchSessionUser(timeoutMs: number = SESSION_TIMEOUT_MS): Promise<SessionUser | null> {
  const body = await fetchSessionBody(timeoutMs);
  const user = (body as { user?: { id?: unknown; role?: unknown; locationId?: unknown } } | null)?.user;
  if (!user || typeof user.id !== "string" || user.id === "") return null;
  if (typeof user.role !== "string" || !ROLES.includes(user.role)) return null;
  const locationId = typeof user.locationId === "string" && user.locationId !== "" ? user.locationId : null;
  return { id: user.id, role: user.role as Role, locationId };
}

function fetchSessionBody(timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  return withTimeout((async () => {
    const res = await fetch("/api/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Sesión no disponible (${res.status})`);
    return (await res.json()) as unknown;
  })(), timeoutMs, "Sesión", () => controller.abort());
}

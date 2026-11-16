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
  const controller = new AbortController();
  return withTimeout((async () => {
    const res = await fetch("/api/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Sesión no disponible (${res.status})`);
    const body: unknown = await res.json();
    const id = (body as { user?: { id?: unknown } } | null)?.user?.id;
    return typeof id === "string" && id !== "" ? id : null;
  })(), timeoutMs, "Sesión", () => controller.abort());
}

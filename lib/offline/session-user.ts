/**
 * Usuario de la sesión de next-auth en este momento, leído del servidor.
 *
 * No usa `getSession()` de `next-auth/react` porque ese convierte una falla de
 * red en `null` ("sin sesión"), y el motor de sincronización debe distinguir
 * "sin red" (reintentar con espera) de "sin sesión" (pedir iniciar sesión).
 * Lanza si la red o el servidor fallan; `null` si no hay sesión.
 */
export async function fetchSessionUserId(): Promise<string | null> {
  const res = await fetch("/api/auth/session", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Sesión no disponible (${res.status})`);
  const body: unknown = await res.json();
  const id = (body as { user?: { id?: unknown } } | null)?.user?.id;
  return typeof id === "string" && id !== "" ? id : null;
}

import Link from "next/link";

export const SESSION_EXPIRED_TEXT = "Tu sesión terminó. Vuelve a iniciar sesión.";

/** Enlace a /login para los avisos de sesión vencida (sin pedir reintentar). */
export function LoginLink() {
  return (
    <Link
      href="/login"
      className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current"
    >
      Iniciar sesión
    </Link>
  );
}

/** `undefined` es lo que Next entrega cuando el middleware redirige la acción por sesión vencida. */
export const isSessionExpired = (res: unknown): boolean =>
  res === undefined || res === null || (res as { reason?: string }).reason === "session_expired";

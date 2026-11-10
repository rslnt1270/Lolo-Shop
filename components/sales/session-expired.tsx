import Link from "next/link";
import { SESSION_EXPIRED_TEXT } from "@/lib/session-text";

export { SESSION_EXPIRED_TEXT };

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

/** Mensaje de error de una acción: si es de sesión vencida, el texto único con el enlace a /login. */
export function ActionErrorText({ message, session }: { message: string; session?: boolean }) {
  if (!session) return <>{message}</>;
  return (
    <>
      {SESSION_EXPIRED_TEXT} <LoginLink />
    </>
  );
}

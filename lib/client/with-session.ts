import { SESSION_EXPIRED_TEXT } from "@/lib/session-text";

export type SessionExpiredResult = { ok: false; code: "SESSION"; message: typeof SESSION_EXPIRED_TEXT };

export const SESSION_EXPIRED_RESULT: SessionExpiredResult = { ok: false, code: "SESSION", message: SESSION_EXPIRED_TEXT };

/**
 * Con la sesión vencida, el middleware de Next 14 redirige la server action y la
 * promesa resuelve `undefined` (no hay respuesta flight). Esto lo convierte en un
 * resultado `SESSION` normal para que la UI avise en vez de tronar con `res.ok`.
 */
export function withSession<T>(res: T | undefined | null): T | SessionExpiredResult {
  return res === undefined || res === null ? SESSION_EXPIRED_RESULT : res;
}

/** ¿Es un resultado de sesión vencida (del helper o del servidor)? */
export function isSessionResult(res: unknown): res is { ok: false; code: "SESSION"; message: string } {
  return !!res && typeof res === "object" && (res as { ok?: unknown }).ok === false && (res as { code?: unknown }).code === "SESSION";
}

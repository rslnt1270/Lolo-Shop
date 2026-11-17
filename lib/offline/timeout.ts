/** Falla porque la red o el servidor no respondieron dentro del plazo. */
export class OfflineTimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what}: sin respuesta en ${ms} ms`);
    this.name = "OfflineTimeoutError";
  }
}

/**
 * Rechaza con `OfflineTimeoutError` si `promise` no termina en `ms`. No cancela
 * la operación (una server action puede terminar en el servidor después); solo
 * deja de esperarla. Siempre limpia su temporizador.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try { onTimeout?.(); } catch { /* mejor esfuerzo */ }
      reject(new OfflineTimeoutError(what, ms));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

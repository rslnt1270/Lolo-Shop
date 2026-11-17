import type { OfflineSaleResult } from "@/lib/sales/offline-actions";
import type { QueuedSale } from "./db";
import { readQueue, updateQueued } from "./queue-store";
import { withTimeout } from "./timeout";

/**
 * Motor de sincronización de la cola sin internet (spec §7). Corre en la página
 * (no en el service worker), envía FIFO por `soldAt` y una a la vez, siempre con
 * el `clientRequestId` del registro: si la venta ya entró, el servidor responde
 * replay y no hay segunda venta.
 */

export interface SyncSummary {
  sent: { folio: string; number: number; review: boolean }[];
  failed: { folio: string; message: string }[];
  /**
   * - `network`: la red o el servidor (`UNAVAILABLE`) no respondieron; se reintenta con espera.
   * - `storage`: el almacenamiento del teléfono no se pudo leer o no guardó una marca; se reintenta con espera.
   * - `session_expired`: no hay sesión o es de otro usuario; hay que iniciar sesión.
   * - `user_mismatch`: el servidor dice que la venta la cobró otro usuario; espera a que entre.
   */
  stoppedBy: null | "network" | "storage" | "session_expired" | "user_mismatch";
}

export interface SyncDeps {
  /** Solo se envían los registros de este usuario; los demás esperan. */
  userId: string;
  submit: (input: unknown) => Promise<OfflineSaleResult>;
  now: () => Date;
  /**
   * Usuario de la sesión real en este momento (en la app, `fetchSessionUserId`
   * contra `/api/auth/session`); `null` sin sesión; lanza si no hay red.
   */
  sessionUserId: () => Promise<string | null>;
  /** Plazo para confirmar la sesión (por omisión `SESSION_CHECK_TIMEOUT_MS`). */
  sessionTimeoutMs?: number;
  /** Plazo para la respuesta de cada envío (por omisión `SUBMIT_TIMEOUT_MS`). */
  submitTimeoutMs?: number;
}

/** Sin respuesta de la sesión en este plazo, la vuelta se detiene como `network`. */
export const SESSION_CHECK_TIMEOUT_MS = 8_000;
/**
 * Sin respuesta de un envío en este plazo, la venta vuelve a `pending` y la
 * vuelta se detiene como `network`. El envío pudo terminar en el servidor de
 * todos modos: reenviarlo es seguro porque el servidor hace replay por
 * `clientRequestId`.
 */
export const SUBMIT_TIMEOUT_MS = 20_000;

export const SYNC_LOCK_NAME = "loloshop-offline-sync";

const BASE_DELAY_MS = 15_000;
const MAX_DELAY_MS = 5 * 60 * 1000;

/** Espera antes del reintento `attempt` (desde 0): 15 s, 30 s, 60 s… tope 5 min. */
export function nextDelayMs(attempt: number): number {
  const n = Math.max(0, Math.floor(attempt));
  if (n >= 5) return MAX_DELAY_MS;
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** n);
}

/** Folio local que ve el cajero mientras la venta no tiene número del servidor. */
export const localFolio = (clientRequestId: string): string => `L-${clientRequestId.slice(0, 8)}`;

const emptySummary = (): SyncSummary => ({ sent: [], failed: [], stoppedBy: null });

/** Lo que se manda al servidor: siempre lo mismo para el mismo registro (inmutable). */
function toInput(s: QueuedSale): Record<string, unknown> {
  const input: Record<string, unknown> = {
    clientRequestId: s.clientRequestId,
    locationId: s.locationId,
    channel: s.channel,
    paymentMethod: s.paymentMethod,
    lines: s.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })),
    soldAt: s.soldAt,
    snapshotAt: s.snapshotAt,
    snapshotToken: s.snapshotToken,
    // El servidor rechaza (USER_MISMATCH) si no es el usuario de la sesión.
    sellerUserId: s.userId,
  };
  if (s.customerAlias !== undefined) input.customerAlias = s.customerAlias;
  return input;
}

// `sending` huérfano (el teléfono se cerró a medio envío) cuenta como `pending`.
const isUnsent = (s: QueuedSale) => s.state === "pending" || s.state === "sending";

export const DEFAULT_REJECTION_MESSAGE = "El servidor rechazó la venta. Revísala con el dueño.";

/**
 * Una vuelta por la cola. Antes de la primera venta confirma que la sesión
 * actual es la de `userId` (si no, no envía nada). Una marca de estado que no
 * se guarda nunca pierde la venta: queda `pending`/`sending` y se reenvía
 * después con el mismo id (replay); la vuelta se detiene como `storage` en
 * lugar de seguir mandando ventas cuyo resultado no se podría guardar.
 */
async function drain({
  userId,
  submit,
  now,
  sessionUserId,
  sessionTimeoutMs = SESSION_CHECK_TIMEOUT_MS,
  submitTimeoutMs = SUBMIT_TIMEOUT_MS,
}: SyncDeps): Promise<SyncSummary> {
  const summary = emptySummary();
  const stop = (why: NonNullable<SyncSummary["stoppedBy"]>) => {
    summary.stoppedBy = why;
    return summary;
  };
  const tried = new Set<string>();
  let sessionConfirmed = false;
  for (;;) {
    // Se relee en cada paso: una venta encolada durante el envío sale en esta vuelta.
    let queue: QueuedSale[];
    try {
      queue = await readQueue();
    } catch {
      return stop("storage"); // ilegible no es lo mismo que vacía
    }
    const next = queue.find((s) => s.userId === userId && isUnsent(s) && !tried.has(s.clientRequestId));
    if (!next) return summary;

    if (!sessionConfirmed) {
      // La pestaña pudo quedarse con un usuario viejo: manda la sesión real.
      let current: string | null;
      try {
        current = await withTimeout(sessionUserId(), sessionTimeoutMs, "Sesión");
      } catch {
        return stop("network");
      }
      if (current !== userId) return stop("session_expired");
      sessionConfirmed = true;
    }

    const id = next.clientRequestId;
    const folio = localFolio(id);
    tried.add(id);

    if (!(await updateQueued(id, { state: "sending" }))) return stop("storage");

    let res: OfflineSaleResult | undefined;
    try {
      res = await withTimeout(submit(toInput(next)), submitTimeoutMs, "Envío");
    } catch {
      res = undefined;
    }

    const malformed = !res || typeof res !== "object" ||
      (res.ok === true && typeof (res.sale as { number?: unknown } | undefined)?.number !== "number");
    if (!res || malformed) {
      await updateQueued(id, { state: "pending", attempts: next.attempts + 1 });
      return stop("network");
    }

    if (res.ok) {
      const saved = await updateQueued(id, {
        state: "synced",
        saleNumber: res.sale.number,
        review: res.review,
        syncedAt: now().toISOString(),
        lastError: undefined,
      });
      if (!saved) return stop("storage");
      summary.sent.push({ folio, number: res.sale.number, review: res.review });
      continue;
    }

    if (res.code === "USER_MISMATCH") {
      // La cobró otro usuario: espera intacta a que entre esa persona.
      await updateQueued(id, { state: "pending" });
      return stop("user_mismatch");
    }

    if ("reason" in res && res.reason === "session_expired") {
      await updateQueued(id, { state: "pending" });
      return stop("session_expired");
    }

    if (res.code === "UNAVAILABLE") {
      await updateQueued(id, { state: "pending", attempts: next.attempts + 1 });
      return stop("network");
    }

    // Rechazo definitivo (INVALID, FORBIDDEN, NOT_FOUND, request_conflict…): se
    // queda a la vista con el mensaje del servidor; nunca se borra sola.
    const message = typeof res.message === "string" && res.message.trim() !== ""
      ? res.message
      : DEFAULT_REJECTION_MESSAGE;
    const saved = await updateQueued(id, {
      state: "needs_attention",
      attempts: next.attempts + 1,
      lastError: message,
    });
    if (!saved) return stop("storage");
    summary.failed.push({ folio, message });
  }
}

interface LockManagerLike {
  request<T>(name: string, options: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<T>): Promise<T>;
}

let running = false;

/**
 * Envía la cola del usuario. Nunca corre dos veces a la vez: en esta pestaña con
 * una bandera en memoria y entre pestañas con `navigator.locks` (si otra pestaña
 * ya sincroniza, esta vuelta no envía nada). Sin Web Locks queda solo la bandera;
 * aun así la idempotencia por `clientRequestId` cubre el choque.
 */
export async function runSync(deps: SyncDeps): Promise<SyncSummary> {
  if (running) return emptySummary();
  running = true;
  try {
    const locks = typeof navigator !== "undefined"
      ? (navigator as Navigator & { locks?: LockManagerLike }).locks
      : undefined;
    if (!locks || typeof locks.request !== "function") return await drain(deps);
    let entered = false;
    try {
      return await locks.request(SYNC_LOCK_NAME, { ifAvailable: true }, async (lock) => {
        entered = true;
        return lock ? drain(deps) : emptySummary();
      });
    } catch (err) {
      if (entered) throw err;
      return await drain(deps); // Web Locks no disponible en este contexto
    }
  } finally {
    running = false;
  }
}

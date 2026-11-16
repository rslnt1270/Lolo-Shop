import type { OfflineSaleResult } from "@/lib/sales/offline-actions";
import type { QueuedSale } from "./db";
import { listQueue, updateQueued } from "./queue-store";

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
   * `network`: la red, el servidor (`UNAVAILABLE`) o el almacenamiento local no
   * respondieron; se reintenta con espera. `session_expired`: hay que iniciar sesión.
   */
  stoppedBy: null | "network" | "session_expired";
}

export interface SyncDeps {
  /** Solo se envían los registros de este usuario; los demás esperan. */
  userId: string;
  submit: (input: unknown) => Promise<OfflineSaleResult>;
  now: () => Date;
}

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
  };
  if (s.customerAlias !== undefined) input.customerAlias = s.customerAlias;
  return input;
}

// `sending` huérfano (el teléfono se cerró a medio envío) cuenta como `pending`.
const isUnsent = (s: QueuedSale) => s.state === "pending" || s.state === "sending";

/**
 * Una vuelta por la cola. Una marca de estado que no se guarda nunca pierde la
 * venta: queda `pending`/`sending` y se reenvía después con el mismo id (replay).
 * Por eso, si una marca falla, la vuelta se detiene como `network` en lugar de
 * seguir mandando ventas cuyo resultado no se podría guardar.
 */
async function drain({ userId, submit, now }: SyncDeps): Promise<SyncSummary> {
  const summary = emptySummary();
  const tried = new Set<string>();
  for (;;) {
    // Se relee en cada paso: una venta encolada durante el envío sale en esta vuelta.
    const next = (await listQueue()).find(
      (s) => s.userId === userId && isUnsent(s) && !tried.has(s.clientRequestId),
    );
    if (!next) return summary;
    const id = next.clientRequestId;
    const folio = localFolio(id);
    tried.add(id);

    if (!(await updateQueued(id, { state: "sending" }))) {
      summary.stoppedBy = "network";
      return summary;
    }

    let res: OfflineSaleResult | undefined;
    try {
      res = await submit(toInput(next));
    } catch {
      res = undefined;
    }

    const malformed = !res || typeof res !== "object" ||
      (res.ok === true && typeof (res.sale as { number?: unknown } | undefined)?.number !== "number");
    if (!res || malformed) {
      await updateQueued(id, { state: "pending", attempts: next.attempts + 1 });
      summary.stoppedBy = "network";
      return summary;
    }

    if (res.ok) {
      const saved = await updateQueued(id, {
        state: "synced",
        saleNumber: res.sale.number,
        review: res.review,
        syncedAt: now().toISOString(),
        lastError: undefined,
      });
      if (!saved) {
        summary.stoppedBy = "network";
        return summary;
      }
      summary.sent.push({ folio, number: res.sale.number, review: res.review });
      continue;
    }

    if (res.reason === "session_expired") {
      await updateQueued(id, { state: "pending" });
      summary.stoppedBy = "session_expired";
      return summary;
    }

    if (res.code === "UNAVAILABLE") {
      await updateQueued(id, { state: "pending", attempts: next.attempts + 1 });
      summary.stoppedBy = "network";
      return summary;
    }

    // Rechazo definitivo (INVALID, FORBIDDEN, NOT_FOUND, request_conflict…): se
    // queda a la vista con el mensaje del servidor; nunca se borra sola.
    const saved = await updateQueued(id, {
      state: "needs_attention",
      attempts: next.attempts + 1,
      lastError: res.message,
    });
    if (!saved) {
      summary.stoppedBy = "network";
      return summary;
    }
    summary.failed.push({ folio, message: res.message });
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

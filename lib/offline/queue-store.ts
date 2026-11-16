import { OfflineStorageError, withDb, type QueuedSale, type QueuedSaleLine } from "./db";

const SYNCED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MUTABLE_KEYS = ["state", "attempts", "lastError", "saleNumber", "review", "syncedAt"] as const;

export type QueuePatch = Pick<Partial<QueuedSale>, (typeof MUTABLE_KEYS)[number]>;
export type NewQueuedSale = Omit<QueuedSale, "state" | "attempts" | (typeof MUTABLE_KEYS)[number]>;

type EnqueuedListener = (clientRequestId: string) => void;
const enqueuedListeners = new Set<EnqueuedListener>();

/** El motor de sincronización se suscribe para enviar en cuanto se encola una venta. */
export function onQueueEnqueued(fn: EnqueuedListener): () => void {
  enqueuedListeners.add(fn);
  return () => enqueuedListeners.delete(fn);
}

// Almacenamiento persistente: se pide sin esperar y se vuelve a pedir en el
// siguiente encolado mientras no se haya concedido.
let persistState: "idle" | "asking" | "granted" = "idle";

/** Solo para pruebas: olvida si ya se concedió el almacenamiento persistente. */
export function resetStoragePersistRequest(): void {
  persistState = "idle";
}

function requestPersistentStorage(): void {
  if (persistState !== "idle") return;
  try {
    const p = typeof navigator !== "undefined" ? navigator.storage?.persist?.() : undefined;
    if (!p) return;
    persistState = "asking";
    p.then(
      (granted) => { persistState = granted ? "granted" : "idle"; },
      () => { persistState = "idle"; },
    );
  } catch {
    persistState = "idle"; // mejor esfuerzo
  }
}

const copyLine = (l: QueuedSaleLine): QueuedSaleLine => ({
  variantId: l.variantId,
  quantity: l.quantity,
  unitPrice: l.unitPrice,
  sku: l.sku,
  productTitle: l.productTitle,
  variantTitle: l.variantTitle,
});

/** Forma cerrada del registro (spec §6): lo que no esté aquí no se guarda. */
function toRecord(sale: NewQueuedSale): QueuedSale {
  const record: QueuedSale = {
    clientRequestId: sale.clientRequestId,
    userId: sale.userId,
    locationId: sale.locationId,
    channel: sale.channel,
    paymentMethod: sale.paymentMethod,
    lines: sale.lines.map(copyLine),
    total: sale.total,
    soldAt: sale.soldAt,
    snapshotAt: sale.snapshotAt,
    snapshotToken: sale.snapshotToken,
    state: "pending",
    attempts: 0,
  };
  if (sale.customerAlias !== undefined) record.customerAlias = sale.customerAlias;
  return record;
}

const isConstraintError = (err: unknown) => (err as { name?: unknown } | null)?.name === "ConstraintError";

/**
 * Guarda la venta. Falla si el id ya existe (`duplicate`) o si el
 * almacenamiento no responde (`unavailable`): el cajero debe saber que NO
 * quedó guardada. Al terminar pide almacenamiento persistente sin esperarlo.
 */
export async function enqueueSale(sale: NewQueuedSale): Promise<void> {
  const record = toRecord(sale);
  await withDb(async (db) => {
    const tx = db.transaction("queue", "readwrite");
    if (await tx.store.get(record.clientRequestId)) {
      await tx.done; // sin escrituras: cierra limpio
      throw new OfflineStorageError("duplicate", "La venta ya está en la cola");
    }
    try {
      await tx.store.add(record);
      await tx.done;
    } catch (err) {
      tx.done.catch(() => {}); // la transacción ya abortó; no dejar el rechazo suelto
      if (isConstraintError(err)) throw new OfflineStorageError("duplicate", "La venta ya está en la cola", err);
      throw err;
    }
  });
  requestPersistentStorage();
  for (const fn of enqueuedListeners) {
    try { fn(record.clientRequestId); } catch { /* un oyente roto no deshace la venta guardada */ }
  }
}

export async function listQueue(): Promise<QueuedSale[]> {
  return withDb((db) => db.getAllFromIndex("queue", "bySoldAt"), { value: [] });
}

/**
 * Como `listQueue`, pero si el almacenamiento no responde rechaza con
 * `OfflineStorageError("unavailable")` en lugar de devolver `[]`: el motor de
 * sincronización distingue "cola vacía" de "cola ilegible".
 */
export async function readQueue(): Promise<QueuedSale[]> {
  return withDb((db) => db.getAllFromIndex("queue", "bySoldAt"));
}

/**
 * Solo cambia los campos de estado; `lines`, `total` y `clientRequestId` no se
 * pueden tocar. Devuelve `true` solo si el cambio quedó guardado (`false` si el
 * id no existe o el almacenamiento falló).
 */
export async function updateQueued(id: string, patch: QueuePatch): Promise<boolean> {
  return withDb(async (db) => {
    const tx = db.transaction("queue", "readwrite");
    const cur = await tx.store.get(id);
    if (!cur) {
      await tx.done;
      return false;
    }
    const next: QueuedSale = { ...cur };
    for (const k of MUTABLE_KEYS) {
      if (k in patch) (next as unknown as Record<string, unknown>)[k] = patch[k];
    }
    await tx.store.put(next);
    await tx.done;
    return true;
  }, { value: false });
}

/** Quién descarta: sin esto solo se descartan ventas ya resueltas. */
export interface DiscardActor {
  currentUserId: string;
  role: string;
}

/**
 * Descarta en este teléfono una venta (con confirmación en la UI):
 * - `needs_attention` o `synced`: siempre (ya resueltas por el servidor).
 * - `pending` de OTRO usuario: solo owner o manager (`actor`), spec §14 P4.
 *   Las `pending` propias nunca: aún no llegan al servidor y se enviarán.
 * - `sending`: nunca (puede estar entrando ahora mismo).
 * Devuelve `true` solo si se borró.
 */
export async function discardQueued(id: string, actor?: DiscardActor): Promise<boolean> {
  return withDb(async (db) => {
    const tx = db.transaction("queue", "readwrite");
    const cur = await tx.store.get(id);
    const resolved = cur && (cur.state === "needs_attention" || cur.state === "synced");
    const othersPending =
      cur &&
      cur.state === "pending" &&
      actor !== undefined &&
      (actor.role === "owner" || actor.role === "manager") &&
      typeof actor.currentUserId === "string" &&
      actor.currentUserId !== "" &&
      cur.userId !== actor.currentUserId;
    if (!resolved && !othersPending) {
      await tx.done;
      return false;
    }
    await tx.store.delete(id);
    await tx.done;
    return true;
  }, { value: false });
}

/** Borra solo `synced` con más de 7 días; nunca `pending`, `sending` ni `needs_attention`. */
export async function purgeSynced(now: Date): Promise<number> {
  return withDb(async (db) => {
    const tx = db.transaction("queue", "readwrite");
    let n = 0;
    for (const s of await tx.store.getAll()) {
      if (s.state !== "synced") continue;
      const at = Date.parse(s.syncedAt ?? "");
      if (Number.isFinite(at) && now.getTime() - at > SYNCED_TTL_MS) {
        await tx.store.delete(s.clientRequestId);
        n++;
      }
    }
    await tx.done;
    return n;
  }, { value: 0 });
}

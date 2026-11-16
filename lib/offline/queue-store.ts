import { OfflineStorageError, withDb, type QueuedSale } from "./db";

const SYNCED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MUTABLE_KEYS = ["state", "attempts", "lastError", "saleNumber", "review", "syncedAt"] as const;

export type QueuePatch = Pick<Partial<QueuedSale>, (typeof MUTABLE_KEYS)[number]>;

/**
 * Guarda la venta. Falla si el id ya existe (`duplicate`) o si el
 * almacenamiento no responde (`unavailable`): el cajero debe saber que NO
 * quedó guardada. Pide almacenamiento persistente al encolar la primera.
 */
export async function enqueueSale(sale: Omit<QueuedSale, "state" | "attempts">): Promise<void> {
  const wasEmpty = await withDb(async (db) => {
    const tx = db.transaction("queue", "readwrite");
    if (await tx.store.get(sale.clientRequestId)) {
      await tx.done; // sin escrituras: cierra limpio
      throw new OfflineStorageError("duplicate", "La venta ya está en la cola");
    }
    const empty = (await tx.store.count()) === 0;
    await tx.store.add({ ...sale, state: "pending", attempts: 0 });
    await tx.done;
    return empty;
  });
  if (wasEmpty) {
    try { await navigator.storage?.persist?.(); } catch { /* mejor esfuerzo */ }
  }
}

export async function listQueue(): Promise<QueuedSale[]> {
  return withDb((db) => db.getAllFromIndex("queue", "bySoldAt"), { value: [] });
}

/** Solo cambia los campos de estado; `lines`, `total` y `clientRequestId` no se pueden tocar. */
export async function updateQueued(id: string, patch: QueuePatch): Promise<void> {
  await withDb(async (db) => {
    const tx = db.transaction("queue", "readwrite");
    const cur = await tx.store.get(id);
    if (cur) {
      const next: QueuedSale = { ...cur };
      for (const k of MUTABLE_KEYS) {
        if (k in patch) (next as unknown as Record<string, unknown>)[k] = patch[k];
      }
      await tx.store.put(next);
    }
    await tx.done;
  }, { value: undefined });
}

export async function discardQueued(id: string): Promise<void> {
  await withDb((db) => db.delete("queue", id), { value: undefined });
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

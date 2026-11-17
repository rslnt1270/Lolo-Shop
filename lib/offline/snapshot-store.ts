import { withDb, type QueuedSale, type StoredSnapshot } from "./db";
import type { OfflineSnapshot } from "@/lib/data/source";

/** Guarda la copia con su `snapshotToken` (firma del servidor, no una credencial). */
export async function saveSnapshot(s: StoredSnapshot): Promise<void> {
  const record: StoredSnapshot = {
    locationId: s.locationId,
    generatedAt: s.generatedAt,
    variants: s.variants,
    snapshotToken: s.snapshotToken,
    userId: s.userId,
  };
  await withDb((db) => db.put("snapshots", record).then(() => undefined), { value: undefined });
}

export async function getSnapshot(locationId: string): Promise<StoredSnapshot | null> {
  return withDb(async (db) => (await db.get("snapshots", locationId)) ?? null, { value: null });
}

/** Borra la copia de una tienda (p. ej. cuando el servidor dice que es demasiado grande). */
export async function deleteSnapshot(locationId: string): Promise<void> {
  await withDb((db) => db.delete("snapshots", locationId).then(() => undefined), { value: undefined });
}

/**
 * La copia más reciente que bajó `userId` en este teléfono (mayor
 * `generatedAt`). Sirve a owner y manager sin tienda que abren `/pos` sin
 * conexión: la tienda queda fija a la de esa copia.
 */
export async function getLatestSnapshot(userId: string): Promise<StoredSnapshot | null> {
  return withDb(async (db) => {
    let latest: StoredSnapshot | null = null;
    for (const s of await db.getAll("snapshots")) {
      if (s.userId !== userId) continue;
      if (!latest || Date.parse(s.generatedAt) > Date.parse(latest.generatedAt)) latest = s;
    }
    return latest;
  }, { value: null });
}

/** Existencias de la copia menos las piezas de ventas de esa tienda aún sin enviar (`pending`/`sending`). */
export function localAvailable(snapshot: OfflineSnapshot, queue: QueuedSale[], variantId: string): number {
  const v = snapshot.variants.find((x) => x.variantId === variantId);
  if (!v) return 0;
  let reserved = 0;
  for (const sale of queue) {
    if (sale.locationId !== snapshot.locationId) continue;
    if (sale.state !== "pending" && sale.state !== "sending") continue;
    for (const l of sale.lines) if (l.variantId === variantId) reserved += l.quantity;
  }
  return Math.max(0, v.available - reserved);
}

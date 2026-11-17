import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { OfflineSnapshot } from "@/lib/data/source";

export const OFFLINE_DB_NAME = "loloshop-offline";
export const OFFLINE_DB_VERSION = 1;

export type QueueState = "pending" | "sending" | "synced" | "needs_attention";

export interface QueuedSaleLine {
  variantId: string;
  quantity: number;
  unitPrice: number;
  sku: string;
  productTitle: string;
  variantTitle: string;
}

/**
 * Venta sin internet (spec §6). Inmutable una vez encolada: solo cambian
 * `state`, `attempts`, `lastError`, `saleNumber`, `review` y `syncedAt`.
 * `snapshotToken` es la firma del servidor de la copia con la que se cotizó
 * esta venta (se copia en el momento de la venta); no es una credencial.
 */
export interface QueuedSale {
  clientRequestId: string;
  userId: string;
  locationId: string;
  channel: string;
  paymentMethod: string;
  customerAlias?: string;
  lines: QueuedSaleLine[];
  total: number;
  soldAt: string;
  snapshotAt: string;
  snapshotToken: string;
  state: QueueState;
  attempts: number;
  lastError?: string;
  saleNumber?: number;
  review?: boolean;
  syncedAt?: string;
}

/**
 * Copia guardada: la proyección de §5 más la firma del servidor que la acompaña
 * y el usuario que la bajó. Una copia solo se usa con la identidad de ese
 * usuario (otra persona en el mismo teléfono baja la suya).
 */
export interface StoredSnapshot extends OfflineSnapshot {
  snapshotToken: string;
  userId: string;
}

export interface StoredIdentity {
  userId: string;
  role: string;
  locationId: string | null;
  confirmedAt: string;
}

export interface OfflineSchema extends DBSchema {
  snapshots: { key: string; value: StoredSnapshot };
  queue: { key: string; value: QueuedSale; indexes: { bySoldAt: string } };
  identity: { key: string; value: StoredIdentity };
}

export type OfflineStorageErrorCode = "duplicate" | "unavailable";

/** Falla del almacenamiento local (modo privado, cuota, bloqueo). Nunca debe tumbar /pos. */
export class OfflineStorageError extends Error {
  constructor(public readonly code: OfflineStorageErrorCode, message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "OfflineStorageError";
  }
}

type Listener = (err: OfflineStorageError) => void;
const listeners = new Set<Listener>();

/** La UI se suscribe para avisar al cajero ("No se pudo guardar en este teléfono"). */
export function onOfflineStorageError(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function reportStorageError(err: OfflineStorageError): void {
  for (const fn of listeners) {
    try { fn(err); } catch { /* un oyente roto no debe afectar al almacenamiento */ }
  }
}

export function openOfflineDb(): Promise<IDBPDatabase<OfflineSchema>> {
  return openDB<OfflineSchema>(OFFLINE_DB_NAME, OFFLINE_DB_VERSION, {
    upgrade(db) {
      db.createObjectStore("snapshots", { keyPath: "locationId" });
      const queue = db.createObjectStore("queue", { keyPath: "clientRequestId" });
      queue.createIndex("bySoldAt", "soldAt");
      db.createObjectStore("identity");
    },
  });
}

/**
 * Abre, ejecuta y cierra. Si algo falla (IndexedDB ausente, modo privado,
 * cuota) lo reporta y devuelve `fallback`; con `fallback` indefinido relanza
 * como `OfflineStorageError` para que el llamador decida.
 */
export async function withDb<T>(
  fn: (db: IDBPDatabase<OfflineSchema>) => Promise<T>,
  fallback?: { value: T },
): Promise<T> {
  let db: IDBPDatabase<OfflineSchema> | undefined;
  try {
    db = await openOfflineDb();
    return await fn(db);
  } catch (err) {
    const wrapped = err instanceof OfflineStorageError
      ? err
      : new OfflineStorageError("unavailable", "Almacenamiento local no disponible", err);
    // `duplicate` es una respuesta de la cola, no una falla del almacenamiento.
    if (wrapped.code === "unavailable") reportStorageError(wrapped);
    if (fallback) return fallback.value;
    throw wrapped;
  } finally {
    db?.close();
  }
}

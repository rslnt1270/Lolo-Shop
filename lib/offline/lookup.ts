import type { OfflineSnapshot, OfflineSnapshotVariant, VariantMatch } from "@/lib/data/source";
import { MAX_SEARCH_RESULTS } from "@/lib/data/source";
import { codeCandidates, normalizeCode } from "@/lib/domain/barcode";
import { sortSizes } from "@/lib/domain/sizes";
import type { QueuedSale } from "./db";
import { localAvailable } from "./snapshot-store";

export type OfflineLookupResult =
  | { found: true; variant: OfflineSnapshotVariant; available: number }
  | { found: false };

/**
 * Busca un código leído o tecleado en la copia local de la tienda, por
 * `barcode` o `sku`, con las mismas equivalencias que el servidor
 * (`codeCandidates`: UPC-A ↔ EAN-13, mayúsculas). `available` descuenta las
 * piezas de ventas de esta tienda aún sin enviar.
 */
export function lookupOffline(code: string, snapshot: OfflineSnapshot, queue: QueuedSale[]): OfflineLookupResult {
  const normalized = normalizeCode(code);
  if (!normalized) return { found: false };
  const candidates = new Set(codeCandidates(normalized));
  const variant =
    snapshot.variants.find((v) => v.barcode !== null && candidates.has(v.barcode)) ??
    snapshot.variants.find((v) => candidates.has(v.sku));
  if (!variant) return { found: false };
  return { found: true, variant, available: localAvailable(snapshot, queue, variant.variantId) };
}

/** Prenda de la copia con la forma que espera `useSaleDraft.add` (sin foto: la copia no la guarda). */
export function toDraftMatch(v: OfflineSnapshotVariant): VariantMatch {
  const variant = {
    id: v.variantId,
    sku: v.sku,
    title: v.variantTitle,
    size: v.size,
    color: "",
    price: v.price,
    barcode: v.barcode,
    inventory: [],
  };
  return {
    product: { id: v.productId, title: v.productTitle, category: "", brand: "", imageUrl: null, variants: [variant] },
    variant,
  };
}

export interface OfflineSearchSize {
  variant: OfflineSnapshotVariant;
  size: string;
  available: number;
}

export interface OfflineSearchHit {
  productId: string;
  title: string;
  sizes: OfflineSearchSize[];
}

const MIN_QUERY = 2;

/**
 * "Sin código" sin internet: solo productos de la copia (nunca texto libre).
 * Coincide por título (que lleva tipo, marca y color) o por código interno
 * (`sku`, con las equivalencias de `codeCandidates`), hasta `MAX_SEARCH_RESULTS`
 * productos con sus tallas de esta tienda.
 */
export function searchOffline(query: string, snapshot: OfflineSnapshot, queue: QueuedSale[]): OfflineSearchHit[] {
  const q = String(query ?? "").trim();
  if (q.length < MIN_QUERY) return [];
  const needle = q.toLowerCase();
  const codes = new Set(codeCandidates(q));
  const matching = new Set<string>();
  for (const v of snapshot.variants) {
    if (v.productTitle.toLowerCase().includes(needle) || codes.has(v.sku)) matching.add(v.productId);
  }
  const hits = new Map<string, OfflineSearchHit>();
  for (const v of snapshot.variants) {
    if (!matching.has(v.productId)) continue;
    let hit = hits.get(v.productId);
    if (!hit) {
      if (hits.size >= MAX_SEARCH_RESULTS) continue;
      hit = { productId: v.productId, title: v.productTitle, sizes: [] };
      hits.set(v.productId, hit);
    }
    hit.sizes.push({ variant: v, size: v.size, available: localAvailable(snapshot, queue, v.variantId) });
  }
  for (const hit of hits.values()) {
    const order = sortSizes(hit.sizes.map((s) => s.size));
    hit.sizes.sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size));
  }
  return [...hits.values()];
}

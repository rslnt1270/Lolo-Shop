import { useCallback, useRef, useState } from "react";
import type { VariantMatch } from "@/lib/data/source";

/**
 * UUID v4 para `clientRequestId`. `crypto.randomUUID` solo existe en contextos
 * seguros (HTTPS o localhost) y en navegadores recientes; si falta se arma con
 * `crypto.getRandomValues` (RFC 4122 §4.4: versión 4 y variante 10xx).
 */
export function newRequestId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface DraftLine {
  variantId: string;
  sku: string;
  productTitle: string;
  variantTitle: string;
  imageUrl: string | null;
  /** Precio de lista (Variant.price) al escanear. */
  listPrice: number;
  /** Precio de cobro; arranca igual al de lista. */
  unitPrice: number;
  quantity: number;
  /** Piezas de la talla en la tienda elegida al escanear; null = no confirmado. */
  available: number | null;
}

export type AddResult = { ok: true } | { ok: false; reason: "NO_STOCK"; size: string };

/**
 * Borrador de la venta en curso. El `clientRequestId` nace con el borrador:
 * un reintento tras un error de red (resultado incierto) lo reutiliza y el
 * servidor no duplica la venta. Cambia con `reset()`, con `renewRequestId()`
 * (el servidor dijo que ese id ya es otra venta) y, tras un rechazo del
 * servidor (`markRejected`), en cuanto la petición cambia: `requestIdFor`.
 * Excepción: tras un error de red o `UNAVAILABLE` el id queda "incierto"
 * (`markUncertain`): quizá el servidor sí registró esa venta, así que ni un
 * rechazo posterior (que puede ocurrir antes de buscar el id) ni editar el
 * carrito lo renuevan; solo `renewRequestId` o `reset`. Decide el servidor.
 */
export function useSaleDraft() {
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [clientRequestId, setClientRequestId] = useState(newRequestId);
  // Firma de la petición que el servidor rechazó sin registrar nada; null si no hubo rechazo.
  const rejectedRef = useRef<string | null>(null);
  const idRef = useRef(clientRequestId);
  // El último envío con este id terminó sin respuesta confiable: puede haberse registrado.
  const uncertainRef = useRef(false);

  const renewRequestId = useCallback(() => {
    const id = newRequestId();
    idRef.current = id;
    rejectedRef.current = null;
    uncertainRef.current = false;
    setClientRequestId(id);
    return id;
  }, []);

  /** Error de red o `UNAVAILABLE`: el resultado de este id es desconocido. */
  const markUncertain = useCallback(() => {
    uncertainRef.current = true;
  }, []);

  /** ¿El último envío con el id vigente quedó sin respuesta confiable? Si sí, no se debe renovar el id. */
  const isUncertain = useCallback(() => uncertainRef.current, []);

  /** El servidor rechazó la petición con esta firma (no registró la venta, salvo que el id sea incierto). */
  const markRejected = useCallback((signature: string) => {
    rejectedRef.current = signature;
  }, []);

  /**
   * Identificador para cobrar la petición con esta firma (tienda, canal,
   * método y renglones). Si la anterior fue rechazada y algo cambió desde
   * entonces, es un cobro distinto: id nuevo.
   */
  const requestIdFor = useCallback(
    (signature: string) => {
      if (!uncertainRef.current && rejectedRef.current !== null && rejectedRef.current !== signature) return renewRequestId();
      return idRef.current;
    },
    [renewRequestId],
  );

  // Espejo síncrono de `lines`: lecturas seguidas en el mismo ciclo ven el estado ya actualizado.
  const linesRef = useRef<DraftLine[]>([]);
  const commit = useCallback((next: DraftLine[]) => {
    linesRef.current = next;
    setLines(next);
  }, []);

  const add = useCallback(
    (match: VariantMatch, stock?: { available: number; sold: boolean }): AddResult => {
      const prev = linesRef.current;
      const size = match.variant.size ?? match.variant.title;
      const available = stock ? stock.available : null;
      const existing = prev.find((l) => l.variantId === match.variant.id);
      if (existing) {
        const known = available ?? existing.available;
        if (known !== null && existing.quantity + 1 > known) return { ok: false, reason: "NO_STOCK", size };
        commit(
          prev.map((l) =>
            l.variantId === match.variant.id ? { ...l, quantity: l.quantity + 1, available: known } : l,
          ),
        );
        return { ok: true };
      }
      if (available !== null && available < 1) return { ok: false, reason: "NO_STOCK", size };
      const price = Number(match.variant.price);
      commit([
        ...prev,
        {
          variantId: match.variant.id,
          sku: match.variant.sku,
          productTitle: match.product.title,
          variantTitle: match.variant.title,
          imageUrl: match.product.imageUrl,
          listPrice: price,
          unitPrice: price,
          quantity: 1,
          available,
        },
      ]);
      return { ok: true };
    },
    [commit],
  );

  /** Cantidad actual de la talla en el borrador (0 si no está). */
  const quantityOf = useCallback((variantId: string) => linesRef.current.find((l) => l.variantId === variantId)?.quantity ?? 0, []);

  const setQty = useCallback((variantId: string, qty: number) => {
    if (!Number.isFinite(qty)) return;
    const quantity = Math.floor(qty);
    if (quantity < 1) return;
    commit(linesRef.current.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)));
  }, [commit]);

  const setPrice = useCallback((variantId: string, price: number) => {
    if (!Number.isFinite(price) || price < 0) return;
    commit(linesRef.current.map((l) => (l.variantId === variantId ? { ...l, unitPrice: price } : l)));
  }, [commit]);

  const remove = useCallback((variantId: string) => {
    commit(linesRef.current.filter((l) => l.variantId !== variantId));
  }, [commit]);

  const reset = useCallback(() => {
    commit([]);
    renewRequestId();
  }, [renewRequestId, commit]);

  return { lines, add, quantityOf, setQty, setPrice, remove, clientRequestId, reset, renewRequestId, markRejected, markUncertain, isUncertain, requestIdFor };
}

import { useCallback, useState } from "react";
import type { VariantMatch } from "@/lib/data/source";

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
}

/**
 * Borrador de la venta en curso. El `clientRequestId` nace con el borrador y
 * solo cambia con `reset()`: un reintento tras un error de red lo reutiliza,
 * así el servidor no duplica la venta.
 */
export function useSaleDraft() {
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());

  const add = useCallback((match: VariantMatch) => {
    setLines((prev) => {
      if (prev.some((l) => l.variantId === match.variant.id)) {
        return prev.map((l) => (l.variantId === match.variant.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      const price = Number(match.variant.price);
      return [
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
        },
      ];
    });
  }, []);

  const setQty = useCallback((variantId: string, qty: number) => {
    if (!Number.isFinite(qty)) return;
    const quantity = Math.floor(qty);
    if (quantity < 1) return;
    setLines((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)));
  }, []);

  const setPrice = useCallback((variantId: string, price: number) => {
    if (!Number.isFinite(price) || price < 0) return;
    setLines((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, unitPrice: price } : l)));
  }, []);

  const remove = useCallback((variantId: string) => {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId));
  }, []);

  const reset = useCallback(() => {
    setLines([]);
    setClientRequestId(crypto.randomUUID());
  }, []);

  return { lines, add, setQty, setPrice, remove, clientRequestId, reset };
}

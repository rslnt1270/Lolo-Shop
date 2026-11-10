"use client";
import { useId, useRef, useState } from "react";
import { recordStockMovementAction, type StockMovementResult } from "@/lib/actions";
import { MAX_STOCK_QUANTITY } from "@/lib/domain/stock-movement";

export interface SumToMyStoreProps {
  variantId: string;
  /** Tienda del usuario: una entrada ahí crea la fila de inventario si no existe. */
  locationId: string;
  /** Piezas fijas (p. ej. las de la fila duplicada); sin ella se muestra un campo editable. */
  quantity?: number;
  /** Valor inicial del campo editable ("" obliga a escribirlo). Por defecto "1". */
  defaultQuantity?: string;
  onDone(available: number): void;
}

/**
 * "Sumar piezas en tu tienda": una Entrada (`restock`) en la tienda del
 * usuario para una prenda cuyo código ya está registrado. El `requestId` se
 * conserva en los reintentos para que un doble toque no duplique la entrada.
 */
/** "Sumar 3 piezas en tu tienda" / "Sumar 1 pieza en tu tienda"; sin número válido, genérico. */
export function sumLabel(n: number | null): string {
  if (n === null) return "Sumar piezas en tu tienda";
  return `Sumar ${n} ${n === 1 ? "pieza" : "piezas"} en tu tienda`;
}

export function SumToMyStore({ variantId, locationId, quantity, defaultQuantity = "1", onDone }: SumToMyStoreProps) {
  const [qty, setQty] = useState(defaultQuantity);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const qtyId = useId();
  const typed = qty.trim() === "" ? Number.NaN : Number(qty);
  const shown = quantity ?? (Number.isInteger(typed) && typed >= 1 && typed <= MAX_STOCK_QUANTITY ? typed : null);

  const submit = async () => {
    if (busyRef.current) return;
    const n = quantity ?? typed;
    if (!Number.isInteger(n) || n < 1 || n > MAX_STOCK_QUANTITY) {
      setError(`Escribe un número de piezas entre 1 y ${MAX_STOCK_QUANTITY}.`);
      return;
    }
    setError("");
    busyRef.current = true;
    setPending(true);
    requestIdRef.current ??= crypto.randomUUID();
    let result: StockMovementResult;
    try {
      result = await recordStockMovementAction({
        variantId, locationId, kind: "restock", quantity: n, requestId: requestIdRef.current,
      });
    } catch {
      result = { ok: false, code: "ERROR", message: "No se pudo registrar. Revisa tu conexión e intenta de nuevo." };
    }
    busyRef.current = false;
    setPending(false);
    if (result.ok) {
      requestIdRef.current = null;
      onDone(result.available);
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="space-y-2">
      {quantity === undefined && (
        <div>
          <label htmlFor={qtyId} className="block text-sm font-medium text-gray-700">Piezas a sumar</label>
          <input
            id={qtyId}
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={qty}
            onChange={(e) => {
              setQty(e.target.value);
              if (!busyRef.current) requestIdRef.current = null;
            }}
            className="mt-1 block min-h-[44px] w-28 rounded-md border border-gray-300 bg-white px-3 font-mono text-base text-gray-900 focus:border-loloteal focus:outline-none focus:ring-2 focus:ring-loloteal"
          />
        </div>
      )}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={pending}
        className="min-h-[44px] w-full rounded-lg bg-loloteal px-4 font-semibold text-white transition active:bg-loloteal-dark disabled:opacity-60 motion-reduce:transition-none"
      >
        {pending ? "Sumando…" : sumLabel(shown)}
      </button>
      {error && (
        <p role="alert" className="text-sm font-medium text-[#9A3B2E]">{error}</p>
      )}
    </div>
  );
}

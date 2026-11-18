"use client";
import { useId, useRef, useState } from "react";
import { transferStockAction, type TransferResult } from "@/lib/actions";
import { MAX_STOCK_QUANTITY } from "@/lib/domain/stock-movement";
import { withSession } from "@/lib/client/with-session";
import { Button } from "@/components/ui/Button";
import { ActionErrorText } from "@/components/sales/session-expired";

export interface TransferStockProps {
  variantId: string;
  title: string;
  size: string;
  inventory: { locationId: string; available: number }[];
  locations: { id: string; name: string }[];
  /** Tienda de trabajo: origen predeterminado si tiene piezas de esta talla. */
  defaultFrom: string;
  online: boolean;
  onDone(result: { fromAvailable: number; toAvailable: number }): void;
}

const control =
  "mt-1 block min-h-[44px] w-full rounded-md border border-gray-300 bg-white px-3 text-base text-gray-900 focus:border-turquesa-texto focus:outline-none focus:ring-2 focus:ring-turquesa-texto";

/** "Traspasar 2 piezas" / "Traspasar 1 pieza"; sin número válido, genérico. */
export function transferLabel(n: number | null): string {
  if (n === null) return "Traspasar piezas";
  return `Traspasar ${n} ${n === 1 ? "pieza" : "piezas"}`;
}

/**
 * Mueve piezas de una talla de una tienda a otra. El `requestId` se conserva
 * en los reintentos (un doble toque o un tiempo agotado no mueven dos veces) y
 * se renueva tras un éxito o al cambiar origen, destino o piezas.
 */
export function TransferStock({ variantId, title, size, inventory, locations, defaultFrom, online, onDone }: TransferStockProps) {
  const [fromPick, setFromPick] = useState("");
  const [toPick, setToPick] = useState("");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [done, setDone] = useState("");
  const requestIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const ids = { from: useId(), to: useId(), qty: useId(), reason: useId() };

  const stock = (id: string) => inventory.find((l) => l.locationId === id)?.available ?? 0;
  const origins = locations.filter((l) => stock(l.id) > 0);
  const from = origins.some((l) => l.id === fromPick)
    ? fromPick
    : origins.some((l) => l.id === defaultFrom) ? defaultFrom : (origins[0]?.id ?? "");
  const destinations = locations.filter((l) => l.id !== from);
  const to = destinations.some((l) => l.id === toPick) ? toPick : (destinations[0]?.id ?? "");
  const max = Math.min(MAX_STOCK_QUANTITY, stock(from));
  const typed = qty.trim() === "" ? Number.NaN : Number(qty);
  const valid = Number.isInteger(typed) && typed >= 1 && typed <= max;

  const renew = () => {
    if (!busyRef.current) requestIdRef.current = null;
  };

  if (origins.length === 0 || destinations.length === 0) {
    return (
      <div className="space-y-2">
        {done && <p role="status" className="text-sm font-medium text-ok">{done}</p>}
        <p className="text-sm text-gray-600">
          {origins.length === 0 ? "No hay piezas de esta talla para traspasar." : "No hay otra tienda de destino."}
        </p>
      </div>
    );
  }

  const submit = async () => {
    if (busyRef.current || !online) return;
    if (!valid) {
      setError(`Escribe un número de piezas entre 1 y ${max}.`);
      return;
    }
    setError("");
    setDone("");
    setSessionExpired(false);
    busyRef.current = true;
    setPending(true);
    requestIdRef.current ??= crypto.randomUUID();
    let result: TransferResult;
    try {
      result = withSession(
        await transferStockAction({
          variantId, fromLocationId: from, toLocationId: to, quantity: typed,
          reason: reason.trim() === "" ? undefined : reason.trim(),
          requestId: requestIdRef.current,
        }),
      );
    } catch {
      result = { ok: false, code: "ERROR", message: "No se pudo registrar. Revisa tu conexión e intenta de nuevo." };
    }
    busyRef.current = false;
    setPending(false);
    if (result.ok) {
      requestIdRef.current = null;
      setQty("1");
      setReason("");
      setDone(result.message);
      onDone({ fromAvailable: result.fromAvailable, toAvailable: result.toAvailable });
    } else {
      setSessionExpired(result.code === "SESSION");
      setError(result.message);
    }
  };

  return (
    <div className="space-y-2" aria-label={`Traspasar ${title} talla ${size}`} role="group">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={ids.from} className="block text-sm font-medium text-gray-700">De</label>
          <select id={ids.from} value={from} className={control}
            onChange={(e) => { setFromPick(e.target.value); setQty("1"); renew(); }}>
            {origins.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={ids.to} className="block text-sm font-medium text-gray-700">A</label>
          <select id={ids.to} value={to} className={control}
            onChange={(e) => { setToPick(e.target.value); renew(); }}>
            {destinations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={ids.qty} className="block text-sm font-medium text-gray-700">Piezas</label>
          <input id={ids.qty} type="number" inputMode="numeric" min="1" max={max} step="1" value={qty}
            onChange={(e) => { setQty(e.target.value); renew(); }}
            className={`${control} font-mono`} />
        </div>
        <div>
          <label htmlFor={ids.reason} className="block text-sm font-medium text-gray-700">Motivo (opcional)</label>
          <input id={ids.reason} type="text" maxLength={120} autoComplete="off" value={reason}
            onChange={(e) => setReason(e.target.value)} className={control} />
        </div>
      </div>
      <Button onClick={() => void submit()} loading={pending} disabled={!online} className="w-full">
        {!online ? "Conéctate para traspasar" : pending ? "Traspasando…" : transferLabel(valid ? typed : null)}
      </Button>
      {error && (
        <p role="alert" className="text-sm font-medium text-agotado"><ActionErrorText message={error} session={sessionExpired} /></p>
      )}
      {done && <p role="status" className="text-sm font-medium text-ok">{done}</p>}
    </div>
  );
}

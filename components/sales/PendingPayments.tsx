"use client";
import { useId, useState } from "react";
import type { DashboardData } from "@/lib/data/sales-source";
import { MAX_REFERENCE_LENGTH } from "@/lib/domain/sale";
import { confirmSalePaymentAction, cancelSaleAction } from "@/lib/sales/actions";
import { formatMoney, timeAgo } from "@/lib/sales/format";

type Pending = DashboardData["pendingPayments"][number];
type Panel = "confirm" | "cancel" | null;

type Props = {
  sales: Pending[];
  locationNames: Record<string, string>;
  canConfirm: boolean;
  canCancel: boolean;
  /** Se llama tras confirmar o anular para recargar el tablero. */
  onChanged: () => void;
};

const btn =
  "min-h-11 rounded-[11px] px-4 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loloteal disabled:opacity-60";
const input =
  "min-h-11 w-full rounded-[11px] border border-[rgba(18,33,31,0.25)] bg-white px-3 text-sm text-[#12211F]";

function PendingRow({ sale, locationNames, canConfirm, canCancel, onChanged }: Omit<Props, "sales"> & { sale: Pending }) {
  const uid = useId();
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [returned, setReturned] = useState<"yes" | "no" | null>(null);

  function open(next: Panel) {
    setError(null);
    setPanel((cur) => (cur === next ? null : next));
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await confirmSalePaymentAction(sale.saleId, reference.trim() || undefined);
      if (res.ok) onChanged();
      else setError(res.message);
    } catch {
      setError("No se pudo confirmar el pago. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!reason.trim()) return setError("Escribe el motivo de la anulación.");
    if (returned === null) return setError("Indica si la prenda regresó a la tienda.");
    setBusy(true);
    setError(null);
    try {
      const res = await cancelSaleAction(sale.saleId, reason.trim(), returned === "yes");
      if (res.ok) onChanged();
      else setError(res.message);
    } catch {
      setError("No se pudo anular la venta. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-[14px] border border-[rgba(18,33,31,0.12)] border-l-[3px] border-l-[#B7791F] bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-[#12211F]">
          Venta #{sale.number}
          <span className="ml-2 font-normal text-[#3A4D4A]">{locationNames[sale.locationId] ?? "Tienda sin nombre"}</span>
        </p>
        <p className="flex-none font-mono text-sm font-bold text-[#12211F]">{formatMoney(sale.total)}</p>
      </div>
      <p className="mt-0.5 text-xs text-[#3A4D4A]">{timeAgo(sale.createdAt)}</p>

      {(canConfirm || canCancel) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {canConfirm && (
            <button
              type="button"
              aria-expanded={panel === "confirm"}
              onClick={() => open("confirm")}
              className={`${btn} bg-loloteal text-white hover:bg-[#004f50]`}
            >
              Confirmar pago
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              aria-expanded={panel === "cancel"}
              onClick={() => open("cancel")}
              className={`${btn} border border-[#C23A2B] bg-white text-[#9B2C20] hover:bg-[#FFE7E2]`}
            >
              Anular
            </button>
          )}
        </div>
      )}

      {panel === "confirm" && (
        <div className="mt-3 space-y-2">
          <label htmlFor={`${uid}-ref`} className="block text-sm text-[#12211F]">
            Referencia SPAY (opcional)
          </label>
          <input
            id={`${uid}-ref`}
            value={reference}
            maxLength={MAX_REFERENCE_LENGTH}
            onChange={(e) => setReference(e.target.value)}
            className={input}
          />
          <button type="button" disabled={busy} onClick={confirm} className={`${btn} bg-loloteal text-white hover:bg-[#004f50]`}>
            Confirmar
          </button>
        </div>
      )}

      {panel === "cancel" && (
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <label htmlFor={`${uid}-reason`} className="block text-sm text-[#12211F]">
              Motivo de la anulación
            </label>
            <input id={`${uid}-reason`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} className={input} />
          </div>
          <fieldset className="space-y-1">
            <legend className="text-sm text-[#12211F]">¿La prenda regresó a la tienda?</legend>
            <div className="flex gap-2">
              {(["yes", "no"] as const).map((v) => (
                <label
                  key={v}
                  className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[11px] border border-[rgba(18,33,31,0.25)] bg-white px-4 text-sm font-bold text-[#12211F] has-[:checked]:border-loloteal has-[:checked]:bg-[#E6F2F1] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-loloteal"
                >
                  <input
                    type="radio"
                    name={`${uid}-returned`}
                    checked={returned === v}
                    onChange={() => setReturned(v)}
                    className="h-4 w-4 accent-[#006a6a]"
                  />
                  {v === "yes" ? "Sí" : "No"}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="button" disabled={busy} onClick={cancel} className={`${btn} bg-[#C23A2B] text-white hover:bg-[#9B2C20]`}>
            Confirmar anulación
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-[#9B2C20]">
          {error}
        </p>
      )}
    </li>
  );
}

export function PendingPayments({ sales, ...rest }: Props) {
  if (sales.length === 0) return <p className="text-sm text-[#3A4D4A]">No hay cobros pendientes.</p>;
  return (
    <ul className="space-y-2">
      {sales.map((s) => (
        <PendingRow key={s.saleId} sale={s} {...rest} />
      ))}
    </ul>
  );
}

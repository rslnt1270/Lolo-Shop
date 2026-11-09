"use client";
import { useId, useState } from "react";
import type { DashboardData } from "@/lib/data/sales-source";
import { MAX_REFERENCE_LENGTH } from "@/lib/domain/sale";
import { confirmSalePaymentAction } from "@/lib/sales/actions";
import { formatMoney, timeAgo } from "@/lib/sales/format";
import { CancelSalePanel } from "./CancelSalePanel";
import { LoginLink, SESSION_EXPIRED_TEXT, isSessionExpired } from "./session-expired";
import { saleButton as btn, saleInput as input } from "./styles";

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

function PendingRow({ sale, locationNames, canConfirm, canCancel, onChanged }: Omit<Props, "sales"> & { sale: Pending }) {
  const uid = useId();
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [expired, setExpired] = useState(false);

  function open(next: Panel) {
    setError(null);
    setPanel((cur) => (cur === next ? null : next));
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    setExpired(false);
    try {
      const res = await confirmSalePaymentAction(sale.saleId, reference.trim() || undefined);
      if (isSessionExpired(res)) setExpired(true);
      else if (res.ok) onChanged();
      else setError(res.message);
    } catch {
      setError("No se pudo confirmar el pago. Intenta de nuevo.");
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
      {sale.customerAlias && (
        <p className="mt-0.5 break-words text-sm text-[#12211F]">
          <span className="sr-only">Alias del pedido: </span>“{sale.customerAlias}”
        </p>
      )}
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

      {panel === "cancel" && <CancelSalePanel saleId={sale.saleId} onCancelled={onChanged} />}

      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-[#9B2C20]">
          {error}
        </p>
      )}
      {expired && (
        <p role="alert" className="mt-2 text-sm font-bold text-[#9B2C20]">
          {SESSION_EXPIRED_TEXT} <LoginLink />
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

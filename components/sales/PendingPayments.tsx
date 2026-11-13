"use client";
import { useId, useState } from "react";
import type { DashboardData } from "@/lib/data/sales-source";
import { MAX_REFERENCE_LENGTH } from "@/lib/domain/sale";
import { confirmSalePaymentAction } from "@/lib/sales/actions";
import { timeAgo } from "@/lib/sales/format";
import { formatPrice } from "@/lib/public/format";
import { CancelSalePanel } from "./CancelSalePanel";
import { LoginLink, SESSION_EXPIRED_TEXT, isSessionExpired } from "./session-expired";
import { Button } from "@/components/ui/Button";
import { saleInput as input } from "./styles";

type Pending = DashboardData["pendingPayments"][number];
type Panel = "confirm" | "cancel" | null;

type Props = {
  sales: Pending[];
  locationNames: Record<string, string>;
  namesReady?: boolean;
  canConfirm: boolean;
  canCancel: boolean;
  /** Se llama tras confirmar o anular para recargar el tablero. */
  onChanged: () => void;
};

function PendingRow({ sale, locationNames, namesReady = true, canConfirm, canCancel, onChanged }: Omit<Props, "sales"> & { sale: Pending }) {
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
    <li className="rounded-[14px] border border-borde-control border-l-[3px] border-l-tinta bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-tinta">
          Venta #{sale.number}
          <span className="ml-2 font-normal text-tinta">{locationNames[sale.locationId] ?? (namesReady ? "Tienda sin nombre" : "…")}</span>
        </p>
        <p className="flex-none font-data-mono tabular-nums text-sm font-bold text-tinta">{formatPrice(sale.total)}</p>
      </div>
      {sale.customerAlias && (
        <p className="mt-0.5 break-words text-sm text-tinta">
          <span className="sr-only">Alias del pedido: </span>“{sale.customerAlias}”
        </p>
      )}
      <p className="mt-0.5 text-xs text-tinta">{timeAgo(sale.createdAt)}</p>

      {(canConfirm || canCancel) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {canConfirm && (
            <Button
              aria-expanded={panel === "confirm"}
              onClick={() => open("confirm")}
            >
              Confirmar pago
            </Button>
          )}
          {canCancel && (
            <Button
              variant="danger"
              aria-expanded={panel === "cancel"}
              onClick={() => open("cancel")}
            >
              Anular
            </Button>
          )}
        </div>
      )}

      {panel === "confirm" && (
        <div className="mt-3 space-y-2">
          <label htmlFor={`${uid}-ref`} className="block text-sm text-tinta">
            Referencia SPAY (opcional)
          </label>
          <input
            id={`${uid}-ref`}
            value={reference}
            maxLength={MAX_REFERENCE_LENGTH}
            onChange={(e) => setReference(e.target.value)}
            className={input}
          />
          <Button disabled={busy} onClick={confirm}>
            {busy ? "Confirmando…" : "Confirmar"}
          </Button>
        </div>
      )}

      {panel === "cancel" && <CancelSalePanel saleId={sale.saleId} onCancelled={onChanged} />}

      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-agotado">
          {error}
        </p>
      )}
      {expired && (
        <p role="alert" className="mt-2 text-sm font-bold text-agotado">
          {SESSION_EXPIRED_TEXT} <LoginLink />
        </p>
      )}
    </li>
  );
}

export function PendingPayments({ sales, ...rest }: Props) {
  if (sales.length === 0) return <p className="text-sm text-tinta">No hay cobros pendientes.</p>;
  return (
    <ul className="space-y-2">
      {sales.map((s) => (
        <PendingRow key={s.saleId} sale={s} {...rest} />
      ))}
    </ul>
  );
}

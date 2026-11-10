"use client";
import { useId, useState } from "react";
import { MAX_CANCEL_REASON_LENGTH } from "@/lib/domain/sale";
import { cancelSaleAction } from "@/lib/sales/actions";
import { LoginLink, SESSION_EXPIRED_TEXT, isSessionExpired } from "./session-expired";
import { saleButton, saleInput } from "./styles";

type Props = {
  saleId: string;
  /** Tras anular: recargar el tablero. */
  onCancelled: () => void;
};

/**
 * Anulación (solo dueño): motivo obligatorio y la pregunta "¿La prenda regresó
 * a la tienda?" sin respuesta por omisión, porque decide si se reingresa el stock.
 */
export function CancelSalePanel({ saleId, onCancelled }: Props) {
  const uid = useId();
  const [reason, setReason] = useState("");
  const [returned, setReturned] = useState<"yes" | "no" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  async function cancel() {
    if (!reason.trim()) return setError("Escribe el motivo de la anulación.");
    if (returned === null) return setError("Indica si la prenda regresó a la tienda.");
    setBusy(true);
    setError(null);
    setExpired(false);
    try {
      const res = await cancelSaleAction(saleId, reason.trim(), returned === "yes");
      if (isSessionExpired(res)) setExpired(true);
      else if (res.ok) onCancelled();
      else setError(res.message);
    } catch {
      setError("No se pudo anular la venta. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="space-y-1">
        <label htmlFor={`${uid}-reason`} className="block text-sm text-[#12211F]">
          Motivo de la anulación
        </label>
        <input
          id={`${uid}-reason`}
          value={reason}
          maxLength={MAX_CANCEL_REASON_LENGTH}
          onChange={(e) => setReason(e.target.value)}
          className={saleInput}
        />
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
                className="h-4 w-4 accent-[#007272]"
              />
              {v === "yes" ? "Sí" : "No"}
            </label>
          ))}
        </div>
      </fieldset>
      <button type="button" disabled={busy} onClick={cancel} className={`${saleButton} bg-[#C23A2B] text-white hover:bg-[#9B2C20]`}>
        Confirmar anulación
      </button>
      {error && (
        <p role="alert" className="text-sm font-bold text-[#9B2C20]">
          {error}
        </p>
      )}
      {expired && (
        <p role="alert" className="text-sm font-bold text-[#9B2C20]">
          {SESSION_EXPIRED_TEXT} <LoginLink />
        </p>
      )}
    </div>
  );
}

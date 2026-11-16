"use client";
import { useId, useState } from "react";
import { MAX_REVIEW_NOTE_LENGTH, type ReviewItem } from "@/lib/data/sales-source";
import { REVIEW_REASON_TEXT } from "@/lib/domain/offline-sale";
import { MAX_CANCEL_REASON_LENGTH } from "@/lib/domain/sale";
import { approveReviewAction, rejectReviewAction } from "@/lib/sales/review-actions";
import { formatPrice } from "@/lib/public/format";
import { METHOD_LABEL } from "@/lib/sales/format";
import { Button } from "@/components/ui/Button";
import { LoginLink, SESSION_EXPIRED_TEXT, isSessionExpired } from "./session-expired";
import { saleInput } from "./styles";

const dateTime = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const when = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : "sin hora");
const pieces = (n: number) => `${n} ${n === 1 ? "pieza" : "piezas"}`;

function ReviewCard({ item, onChanged }: { item: ReviewItem; onChanged: () => void }) {
  const uid = useId();
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [returned, setReturned] = useState<"yes" | "no" | null>(null);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  async function run(kind: "approve" | "reject", call: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    setExpired(false);
    try {
      const res = (await call()) as { ok?: boolean; message?: string } | undefined;
      if (isSessionExpired(res)) setExpired(true);
      else if (res?.ok) onChanged();
      else setError(res?.message ?? "No se pudo completar. Intenta de nuevo.");
    } catch {
      setError("No hay conexión. Intenta de nuevo.");
    } finally {
      setBusy(null);
    }
  }

  function confirmReject() {
    if (!reason.trim()) return setError("Escribe el motivo del rechazo.");
    if (returned === null) return setError("Indica si la prenda regresó a la tienda.");
    void run("reject", () => rejectReviewAction(item.saleId, reason.trim(), returned === "yes"));
  }

  const shortLines = item.lines.filter((l) => l.shortfall > 0);

  return (
    <li className="rounded-[14px] border border-borde-control bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-tinta">
          Venta #{item.number}
          <span className="ml-2 font-normal">{item.locationName}</span>
        </p>
        <p className="flex-none font-data-mono text-sm font-bold tabular-nums text-tinta">{formatPrice(item.total)}</p>
      </div>
      <p className="mt-0.5 text-xs text-tinta">
        Cajero: {item.cashierName}. {METHOD_LABEL[item.paymentMethod]}.
      </p>
      <p className="text-xs text-tinta">
        Vendida: {when(item.soldAt)}. Llegó: {when(item.createdAt)}.
      </p>

      <ul className="mt-3 space-y-1" aria-label="Por qué está por aprobar">
        {item.reasons.includes("insufficient_stock") && shortLines.length === 0 && (
          <li className="text-sm font-bold text-agotado">{REVIEW_REASON_TEXT.insufficient_stock}</li>
        )}
        {item.reasons.includes("insufficient_stock") &&
          shortLines.map((l) => (
            <li key={`s-${l.variantId}`} className="text-sm font-bold text-agotado">
              {`Faltó stock: ${pieces(l.shortfall)} de ${l.productTitle} ${l.size}`}
            </li>
          ))}
        {item.reasons
          .filter((r) => r !== "insufficient_stock")
          .map((r) => (
            <li key={r} className="text-sm font-bold text-agotado">
              {REVIEW_REASON_TEXT[r]}
            </li>
          ))}
      </ul>

      <ul className="mt-3 divide-y divide-borde-control/40 text-sm text-tinta" aria-label="Renglones">
        {item.lines.map((l) => (
          <li key={l.variantId} className="flex items-baseline justify-between gap-2 py-1.5">
            <span>
              {l.quantity} x {l.productTitle} {l.size}
              {l.shortfall > 0 && <span className="block text-xs font-bold">Sin existencia: {pieces(l.shortfall)}</span>}
            </span>
            <span className="flex-none font-data-mono tabular-nums">{formatPrice(l.unitPrice)}</span>
          </li>
        ))}
      </ul>

      {!rejecting ? (
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <label htmlFor={`${uid}-note`} className="block text-sm text-tinta">
              Nota (opcional)
            </label>
            <input
              id={`${uid}-note`}
              value={note}
              maxLength={MAX_REVIEW_NOTE_LENGTH}
              onChange={(e) => setNote(e.target.value)}
              className={saleInput}
            />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" loading={busy === "approve"} disabled={busy !== null} onClick={() => void run("approve", () => approveReviewAction(item.saleId, note.trim() || undefined))}>
              Aprobar
            </Button>
            <Button variant="danger" className="flex-1" disabled={busy !== null} onClick={() => { setRejecting(true); setError(null); }}>
              Rechazar
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <label htmlFor={`${uid}-reason`} className="block text-sm text-tinta">
              Motivo del rechazo
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
            <legend className="text-sm text-tinta">¿La prenda regresó a la tienda?</legend>
            <div className="flex gap-2">
              {(["yes", "no"] as const).map((v) => (
                <label
                  key={v}
                  className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[11px] border border-borde-control bg-white px-4 text-sm font-bold text-tinta has-[:checked]:border-turquesa has-[:checked]:bg-turquesa has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-turquesa-texto"
                >
                  <input type="radio" name={`${uid}-returned`} checked={returned === v} onChange={() => setReturned(v)} className="h-4 w-4 accent-turquesa-texto" />
                  {v === "yes" ? "Sí" : "No"}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <Button variant="danger" className="flex-1" loading={busy === "reject"} disabled={busy !== null} onClick={confirmReject}>
              Confirmar rechazo
            </Button>
            <Button variant="outline" className="flex-1" disabled={busy !== null} onClick={() => { setRejecting(false); setError(null); }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

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

export function ReviewList({ items, onChanged }: { items: ReviewItem[]; onChanged: () => void }) {
  if (items.length === 0) {
    return <p className="rounded-[14px] bg-white p-4 text-sm text-tinta">No hay ventas sin internet por aprobar.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <ReviewCard key={it.saleId} item={it} onChanged={onChanged} />
      ))}
    </ul>
  );
}

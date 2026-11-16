"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { QueuedSale } from "@/lib/offline/db";
import { localFolio } from "@/lib/offline/sync";
import { formatPrice } from "@/lib/public/format";

interface OfflineQueueSheetProps {
  /** Ventas guardadas en este teléfono (cola sin internet), en el orden en que se cobraron. */
  items: QueuedSale[];
  /**
   * Solo owner y manager descartan: ventas que necesitan atención y, con
   * `currentUserId`, ventas por enviar de OTRO usuario (spec §14 P4).
   */
  canDiscard: boolean;
  /** Usuario actual: sus ventas por enviar nunca se descartan. */
  currentUserId?: string | null;
  /** Borra la venta de este teléfono; `false` si no se pudo. */
  onDiscard(clientRequestId: string): Promise<boolean>;
  onSyncNow(): void;
  onClose?(): void;
  /** Una vuelta de envío en curso. */
  syncing?: boolean;
}

/** Estado en palabras (spec §10). */
export function queueStateText(s: QueuedSale): string {
  switch (s.state) {
    case "pending":
      return "Por enviar";
    case "sending":
      return "Enviando";
    case "synced":
      return s.review ? "Enviada, por aprobar" : `Enviada #${s.saleNumber ?? ""}`.trim();
    case "needs_attention":
      return `Necesita atención: ${s.lastError ?? "revísala con el dueño."}`;
  }
}

const hour = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
};

/**
 * Hoja con las ventas guardadas en este teléfono: folio local, total, hora y
 * estado. "Enviar ahora" fuerza un envío; owner y manager pueden descartar,
 * con confirmación, una venta que el servidor rechazó.
 */
export function OfflineQueueSheet({
  items,
  canDiscard,
  currentUserId = null,
  onDiscard,
  onSyncNow,
  onClose,
  syncing = false,
}: OfflineQueueSheetProps) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <section
      role="dialog"
      aria-labelledby={titleId}
      className="space-y-3 rounded-2xl border border-borde-control/40 bg-white p-4 shadow-lg"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} ref={titleRef} tabIndex={-1} className="text-base font-bold text-tinta focus:outline-none">
          Ventas guardadas en este teléfono
        </h2>
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-tinta">No hay ventas guardadas en este teléfono.</p>
      ) : (
        <ul className="divide-y divide-borde-control/30">
          {items.map((s) => (
            <QueueRow
              key={s.clientRequestId}
              sale={s}
              canDiscard={canDiscard}
              othersPending={s.state === "pending" && !!currentUserId && s.userId !== currentUserId}
              onDiscard={onDiscard}
            />
          ))}
        </ul>
      )}
      <Button onClick={onSyncNow} loading={syncing} className="min-h-[44px] w-full">
        Enviar ahora
      </Button>
    </section>
  );
}

function QueueRow({
  sale,
  canDiscard,
  othersPending,
  onDiscard,
}: {
  sale: QueuedSale;
  canDiscard: boolean;
  othersPending: boolean;
  onDiscard(id: string): Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const folio = localFolio(sale.clientRequestId);
  const attention = sale.state === "needs_attention";

  const discard = async () => {
    setBusy(true);
    setFailed(false);
    let ok = false;
    try {
      ok = await onDiscard(sale.clientRequestId);
    } catch {
      ok = false;
    }
    setBusy(false);
    if (!ok) setFailed(true);
    setConfirming(false);
  };

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-mono text-sm font-semibold text-tinta">{folio}</span>
        <span className="text-sm font-semibold text-tinta">{formatPrice(sale.total)}</span>
        <span className="text-sm text-tinta">{hour(sale.soldAt)}</span>
      </div>
      <p className={`text-sm font-semibold ${attention ? "text-agotado" : sale.state === "synced" ? "text-ok" : "text-tinta"}`}>
        {queueStateText(sale)}
      </p>
      {sale.state === "synced" && sale.review && sale.saleNumber !== undefined && (
        <p className="text-sm text-tinta">Folio #{sale.saleNumber}</p>
      )}
      {failed && (
        <p role="alert" className="text-sm font-semibold text-agotado">
          No se pudo descartar. Intenta de nuevo.
        </p>
      )}
      {canDiscard && (attention || othersPending) && (
        confirming ? (
          <div className="space-y-2">
            <p className="text-sm text-tinta">
              {othersPending
                ? `${folio} es una venta de otro usuario que aún no se envía. Si la descartas de este teléfono, no llegará a Ventas. ¿Descartarla?`
                : `¿Descartar ${folio} de este teléfono? No se enviará. Revísala antes con el dueño.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" loading={busy} onClick={() => void discard()}>
                Sí, descartar
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" aria-label={`Descartar ${folio}`} onClick={() => setConfirming(true)}>
            Descartar
          </Button>
        )
      )}
    </li>
  );
}

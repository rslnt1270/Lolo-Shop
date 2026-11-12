"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Minus, Plus, Trash2 } from "lucide-react";
import { saleTotal } from "@/lib/domain/sale";
import { formatPrice } from "@/lib/public/format";
import { Button } from "@/components/ui/Button";
import type { DraftLine } from "@/lib/sales/use-sale-draft";

/** Lectura en curso, por código normalizado (no por variantId: aún no se sabe qué prenda es). */
export type PendingScan = { code: string; status: "loading" | "error" | "queued" | "rejected"; extra?: number; reason?: string };

type Props = {
  lines: DraftLine[];
  canEditPrice: boolean;
  /** Mensajes de error por variantId (p. ej. sin stock). */
  lineErrors?: Record<string, string>;
  onSetQty: (variantId: string, qty: number) => void;
  onSetPrice: (variantId: string, price: number) => void;
  onRemove: (variantId: string) => void;
  /** Lecturas con la consulta en curso o fallida; se muestran arriba de las líneas. */
  pendingScans?: PendingScan[];
  onRetry?: (code: string) => void;
  /** Descarta una lectura fallida. */
  onDiscard?: (code: string) => void;
  /** Cobro incierto o en conflicto: no se editan cantidades, precios ni líneas. */
  locked?: boolean;
};

const stepBtn =
  "flex h-11 w-11 items-center justify-center rounded-lg border border-outline-variant bg-white text-on-surface hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:text-outline disabled:opacity-60";

/** Campo de precio con texto local para poder borrar y reescribir sin saltos. */
function PriceField({ line, onCommit, locked }: { line: DraftLine; onCommit: (price: number) => void; locked: boolean }) {
  const [text, setText] = useState(String(line.unitPrice));
  const [focused, setFocused] = useState(false);
  // Si el precio cambia en el servidor (PRICE_CHANGED), el campo muestra el vigente salvo que se esté escribiendo.
  useEffect(() => {
    if (!focused) setText(String(line.unitPrice));
  }, [line.unitPrice, focused]);
  const trimmed = text.trim();
  const parsed = Number(text);
  const invalid = trimmed === "" || !Number.isFinite(parsed) || parsed < 0;
  return (
    <label className="block text-sm text-on-surface-variant">
      <span className="sr-only">{`Precio unitario de ${line.productTitle}`}</span>
      <span aria-hidden="true">Precio</span>
      <div className={`mt-1 flex min-h-[44px] items-center rounded-lg border bg-white px-3 focus-within:ring-2 focus-within:ring-primary ${invalid ? "border-error" : "border-outline"}`}>
        <span aria-hidden="true" className="text-on-surface-variant">
          $
        </span>
        <input
          type="text"
          disabled={locked}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(e) => {
            const value = e.target.value;
            setText(value);
            const n = Number(value);
            if (value.trim() !== "" && Number.isFinite(n) && n >= 0) onCommit(n);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(String(line.unitPrice));
          }}
          aria-invalid={invalid ? "true" : undefined}
          className="w-full min-w-0 bg-transparent py-2 pl-1 font-data-mono text-base text-on-surface focus:outline-none"
        />
      </div>
      {invalid && <span className="mt-1 block text-sm text-error">Escribe un precio de 0 en adelante.</span>}
    </label>
  );
}

/** Piezas extra del mismo código que esperan junto a la primera. */
const waiting = (p: PendingScan) => (p.extra ? ` · ×${1 + p.extra} en espera` : "");

function PendingRows({
  pendingScans,
  onRetry,
  onDiscard,
}: {
  pendingScans: PendingScan[];
  onRetry?: (code: string) => void;
  onDiscard?: (code: string) => void;
}) {
  if (pendingScans.length === 0) return null;
  return (
    <ul aria-label="Lecturas en curso" className="divide-y divide-outline-variant border-b border-outline-variant">
      {pendingScans.map((p) => (
        <li key={p.code} className="flex items-center justify-between gap-3 p-4">
          {p.status === "loading" ? (
            <p className="text-sm text-on-surface-variant">{`Buscando ${p.code}…${waiting(p)}`}</p>
          ) : p.status === "queued" ? (
            <p className="text-sm text-on-surface-variant">{`Pendiente para la siguiente venta: ${p.code}${waiting(p)}`}</p>
          ) : p.status === "rejected" ? (
            <>
              <p className="text-sm font-semibold text-on-error-container">{`${p.code} · ${p.reason ?? ""}`}</p>
              <Button variant="outline" onClick={() => onDiscard?.(p.code)} aria-label={`Descartar ${p.code}`}>
                Descartar
              </Button>
            </>
          ) : (
            <>
              <p role="alert" className="text-sm font-semibold text-on-error-container">{`No se pudo buscar ${p.code}.${waiting(p)}`}</p>
              <Button variant="outline" onClick={() => onRetry?.(p.code)} aria-label={`Reintentar ${p.code}`}>
                Reintentar
              </Button>
              <Button variant="outline" onClick={() => onDiscard?.(p.code)} aria-label={`Descartar ${p.code}`}>
                Descartar
              </Button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SaleCart({ lines, canEditPrice, lineErrors = {}, onSetQty, onSetPrice, onRemove, pendingScans = [], onRetry, onDiscard, locked = false }: Props) {
  const total = saleTotal(lines);

  if (lines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-outline bg-white text-center text-on-surface-variant">
        <PendingRows pendingScans={pendingScans} onRetry={onRetry} onDiscard={onDiscard} />
        <div className="p-6">
          <p className="font-semibold text-on-surface">Aún no hay prendas en la venta</p>
          <p className="mt-1 text-sm">Escanea una prenda o escribe su código para agregarla.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-outline-variant bg-white shadow-sm">
      <PendingRows pendingScans={pendingScans} onRetry={onRetry} onDiscard={onDiscard} />
      <ul className="divide-y divide-outline-variant">
        {lines.map((line) => {
          const error = lineErrors[line.variantId];
          const changed = line.unitPrice !== line.listPrice;
          return (
            <li key={line.variantId} className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                {line.imageUrl ? (
                  <Image
                    src={line.imageUrl}
                    alt=""
                    width={56}
                    height={56}
                    unoptimized
                    className="h-14 w-14 shrink-0 rounded-lg border border-outline-variant object-cover"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-low text-xs text-on-surface-variant"
                  >
                    Sin foto
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-on-surface">
                    {line.productTitle}
                    {line.quantity > 1 && <span className="ml-2 font-data-mono text-primary">{`×${line.quantity}`}</span>}
                  </p>
                  <p className="text-sm text-on-surface-variant">{line.variantTitle}</p>
                  <p className="font-data-mono text-xs text-on-surface-variant">{line.sku}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(line.variantId)}
                  disabled={locked}
                  aria-label={`Quitar ${line.productTitle}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-error-container hover:text-on-error-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                >
                  <Trash2 aria-hidden="true" size={20} />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div role="group" aria-label={`Cantidad de ${line.productTitle}`} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSetQty(line.variantId, line.quantity - 1)}
                    disabled={locked || line.quantity <= 1}
                    aria-label={`Restar una pieza de ${line.productTitle}`}
                    className={stepBtn}
                  >
                    <Minus aria-hidden="true" size={18} />
                  </button>
                  <span aria-live="polite" className="w-10 text-center font-data-mono text-lg font-semibold">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSetQty(line.variantId, line.quantity + 1)}
                    disabled={locked || (line.available !== null && line.quantity >= line.available)}
                    aria-label={`Sumar una pieza de ${line.productTitle}`}
                    className={stepBtn}
                  >
                    <Plus aria-hidden="true" size={18} />
                  </button>
                </div>

                {!canEditPrice && (
                  <p className="text-sm text-on-surface-variant">
                    Precio <span className="font-data-mono text-on-surface">{formatPrice(line.unitPrice)}</span>
                  </p>
                )}

                <p className="min-w-[5.5rem] text-right font-data-mono text-base font-semibold">
                  {formatPrice(line.quantity * line.unitPrice)}
                </p>
              </div>

              {canEditPrice && (
                <div className="w-full">
                  <PriceField locked={locked} line={line} onCommit={(p) => onSetPrice(line.variantId, p)} />
                </div>
              )}

              {canEditPrice && changed && (
                <p className="text-xs text-on-surface-variant">Precio de lista {formatPrice(line.listPrice)}</p>
              )}

              {error && (
                <p role="alert" className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
                  {error}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-baseline justify-between border-t border-outline-variant px-4 py-3">
        <span className="text-sm font-semibold text-on-surface-variant">Total</span>
        <span data-testid="sale-total" className="font-data-mono text-2xl font-bold text-on-surface">
          {formatPrice(total)}
        </span>
      </div>
    </div>
  );
}

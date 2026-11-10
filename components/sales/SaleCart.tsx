"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Minus, Plus, Trash2 } from "lucide-react";
import { saleTotal } from "@/lib/domain/sale";
import { formatPrice } from "@/lib/public/format";
import type { DraftLine } from "@/lib/sales/use-sale-draft";

type Props = {
  lines: DraftLine[];
  canEditPrice: boolean;
  /** Mensajes de error por variantId (p. ej. sin stock). */
  lineErrors?: Record<string, string>;
  onSetQty: (variantId: string, qty: number) => void;
  onSetPrice: (variantId: string, price: number) => void;
  onRemove: (variantId: string) => void;
};

const stepBtn =
  "flex h-11 w-11 items-center justify-center rounded-lg border border-outline-variant bg-white text-on-surface hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:text-outline disabled:opacity-60";

/** Campo de precio con texto local para poder borrar y reescribir sin saltos. */
function PriceField({ line, onCommit }: { line: DraftLine; onCommit: (price: number) => void }) {
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

export function SaleCart({ lines, canEditPrice, lineErrors = {}, onSetQty, onSetPrice, onRemove }: Props) {
  const total = saleTotal(lines);

  if (lines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-outline bg-white p-6 text-center text-on-surface-variant">
        <p className="font-semibold text-on-surface">Aún no hay prendas en la venta</p>
        <p className="mt-1 text-sm">Escanea una prenda o escribe su código para agregarla.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-outline-variant bg-white shadow-sm">
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
                  <p className="font-semibold text-on-surface">{line.productTitle}</p>
                  <p className="text-sm text-on-surface-variant">{line.variantTitle}</p>
                  <p className="font-data-mono text-xs text-on-surface-variant">{line.sku}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(line.variantId)}
                  aria-label={`Quitar ${line.productTitle}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-error-container hover:text-on-error-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Trash2 aria-hidden="true" size={20} />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div role="group" aria-label={`Cantidad de ${line.productTitle}`} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSetQty(line.variantId, line.quantity - 1)}
                    disabled={line.quantity <= 1}
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
                  <PriceField line={line} onCommit={(p) => onSetPrice(line.variantId, p)} />
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

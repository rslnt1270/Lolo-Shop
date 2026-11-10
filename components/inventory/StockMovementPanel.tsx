"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import type { Role } from "@/lib/domain/types";
import { recordStockMovementAction, type StockMovementResult } from "@/lib/actions";
import {
  MAX_REASON_LENGTH,
  MAX_STOCK_QUANTITY,
  validateStockMovement,
  type StockMovementKind,
} from "@/lib/domain/stock-movement";

export interface StockMovementPanelProps {
  variantId: string;
  locationId: string;
  role: Role;
  /** Se llama con el stock resultante al terminar un movimiento (también si fue repetido). */
  onDone(available: number): void;
}

type Mode = "idle" | "adjust";
type AdjustType = "damage" | "adjustment";

/**
 * Panel de movimientos de stock de una prenda en una tienda: "Entrada" para
 * todos; "Merma o corrección" solo owner y manager. No existe "Salida": la
 * venta se registra en /pos. El `requestId` nace al abrir y se conserva en los
 * reintentos hasta un resultado definitivo, para que un doble toque o un
 * reintento de red no duplique el movimiento.
 */
export function StockMovementPanel({ variantId, locationId, role, onDone }: StockMovementPanelProps) {
  const canAdjust = role === "owner" || role === "manager";
  const [mode, setMode] = useState<Mode>("idle");
  const [entryQty, setEntryQty] = useState("1");
  const [adjustType, setAdjustType] = useState<AdjustType>("damage");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [adjustQty, setAdjustQty] = useState("1");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // Una operación a la vez; el id vive en un ref para que el doble toque lo vea al instante.
  const requestIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  // Si el operador cambia los datos tras un error, ya es otra operación: id nuevo.
  const touch = () => {
    if (!busyRef.current) requestIdRef.current = null;
  };
  const newRequestId = () => (requestIdRef.current = crypto.randomUUID());
  const currentRequestId = () => requestIdRef.current ?? newRequestId();

  const submit = async (kind: StockMovementKind, quantityText: string) => {
    if (busyRef.current) return;
    setError("");
    const input = {
      variantId,
      locationId,
      kind,
      quantity: Number(quantityText),
      ...(kind === "adjustment" ? { direction } : {}),
      ...(kind === "restock" ? {} : { reason }),
      requestId: currentRequestId(),
    };
    const check = validateStockMovement(input);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    busyRef.current = true;
    setPending(true);
    let result: StockMovementResult;
    try {
      result = await recordStockMovementAction(input);
    } catch {
      result = { ok: false, code: "ERROR", message: "No se pudo registrar. Revisa tu conexión e intenta de nuevo." };
    }
    busyRef.current = false;
    setPending(false);

    if (result.ok) {
      requestIdRef.current = null;
      onDone(result.available);
      return;
    }
    // ERROR y SESSION pueden reintentarse con el mismo id; el resto es definitivo.
    if (result.code !== "ERROR" && result.code !== "SESSION") requestIdRef.current = null;
    setError(result.message);
  };

  const openAdjust = () => {
    setMode("adjust");
    setError("");
    newRequestId();
  };
  const closeAdjust = () => {
    setMode("idle");
    setError("");
    setReason("");
    requestIdRef.current = null;
  };

  const adjustLabel = adjustType === "damage" ? "Registrar merma" : "Registrar corrección";
  const primary =
    "min-h-[44px] w-full rounded-lg bg-loloteal px-4 py-2 font-semibold text-white active:bg-[#005F5F] disabled:opacity-60";
  const outline =
    "min-h-[44px] w-full rounded-lg border border-loloteal px-4 py-2 font-semibold text-loloteal active:bg-loloteal/10 disabled:opacity-60";
  const field = "min-h-[44px] rounded-md border border-gray-300 bg-white px-3 text-sm";

  return (
    <div data-testid="stock-panel" className="space-y-3">
      {mode === "idle" && (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!requestIdRef.current) newRequestId();
              void submit("restock", entryQty);
            }}
            className={primary}
          >
            Entrada
          </button>
          <div className="flex items-center gap-2">
            <label htmlFor="cantidad-entrada" className="text-sm font-medium">
              Cantidad
            </label>
            <input
              id="cantidad-entrada"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_STOCK_QUANTITY}
              value={entryQty}
              onChange={(e) => {
                touch();
                setEntryQty(e.target.value);
              }}
              className={`${field} w-24`}
            />
          </div>
          {canAdjust && (
            <button type="button" onClick={openAdjust} disabled={pending} className={outline}>
              Merma o corrección
            </button>
          )}
        </>
      )}

      {mode === "adjust" && (
        <form
          className="space-y-3 rounded-lg border border-gray-200 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(adjustType, adjustQty);
          }}
        >
          <div role="radiogroup" aria-label="Tipo" className="flex gap-2">
            {(["damage", "adjustment"] as const).map((t) => (
              <label
                key={t}
                className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold ${
                  adjustType === t ? "border-loloteal bg-loloteal text-white" : "border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="tipo"
                  className="sr-only"
                  checked={adjustType === t}
                  onChange={() => {
                    touch();
                    setAdjustType(t);
                    if (t === "adjustment") setDirection("in");
                  }}
                />
                {t === "damage" ? "Merma" : "Corrección"}
              </label>
            ))}
          </div>
          {adjustType === "adjustment" && (
            <div role="radiogroup" aria-label="Dirección" className="flex gap-2">
              {(["in", "out"] as const).map((d) => (
                <label
                  key={d}
                  className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold ${
                    direction === d ? "border-loloteal bg-loloteal/10 text-loloteal" : "border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="direccion"
                    className="sr-only"
                    checked={direction === d}
                    onChange={() => {
                      touch();
                      setDirection(d);
                    }}
                  />
                  {d === "in" ? "Suma" : "Resta"}
                </label>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <label htmlFor="cantidad-ajuste" className="text-sm font-medium">
              Cantidad
            </label>
            <input
              id="cantidad-ajuste"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_STOCK_QUANTITY}
              value={adjustQty}
              onChange={(e) => {
                touch();
                setAdjustQty(e.target.value);
              }}
              className={`${field} w-24`}
            />
          </div>
          <div>
            <label htmlFor="motivo" className="block text-sm font-medium">
              Motivo
            </label>
            <textarea
              id="motivo"
              rows={2}
              maxLength={MAX_REASON_LENGTH}
              value={reason}
              onChange={(e) => {
                touch();
                setReason(e.target.value);
              }}
              placeholder="Por ejemplo: prenda manchada"
              className={`${field} mt-1 w-full py-2`}
            />
          </div>
          <button type="submit" disabled={pending} className={primary}>
            {adjustLabel}
          </button>
          <button
            type="button"
            onClick={closeAdjust}
            disabled={pending}
            className="min-h-[44px] w-full text-sm text-gray-600"
          >
            Cancelar
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <p className="text-sm text-gray-600">
        ¿Vendiste la prenda?{" "}
        <Link href="/pos" className="inline-flex min-h-[44px] items-center font-medium text-loloteal underline">
          Regístrala en Vender.
        </Link>
      </p>
    </div>
  );
}

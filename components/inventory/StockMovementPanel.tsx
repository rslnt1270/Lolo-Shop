"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Role } from "@/lib/domain/types";
import {
  fetchLocationsAction, recordStockMovementAction, transferStockAction, type StockMovementResult,
} from "@/lib/actions";
import {
  MAX_REASON_LENGTH,
  MAX_STOCK_QUANTITY,
  validateStockMovement,
  type StockMovementKind,
} from "@/lib/domain/stock-movement";
import { withSession } from "@/lib/client/with-session";
import { ActionErrorText } from "@/components/sales/session-expired";

export interface StockMovementPanelProps {
  variantId: string;
  locationId: string;
  role: Role;
  /** Manager con tienda: solo traspasa desde o hacia `locationId` (el servidor lo vuelve a validar). */
  storeBound?: boolean;
  /** Solo ofrece "Traspasar" (la prenda no tiene fila en `locationId`; la entrada va por "Sumar piezas"). */
  transferOnly?: boolean;
  /** Origen y destino preseleccionados al abrir el traspaso (por omisión: origen `locationId`, sin destino). */
  defaultFromId?: string;
  defaultToId?: string;
  /** Se llama con el stock resultante al terminar un movimiento (también si fue repetido); `message` solo en traspasos. */
  onDone(available: number, message?: string): void;
}

type Mode = "idle" | "adjust" | "transfer";
type AdjustType = "damage" | "adjustment";

/**
 * Panel de movimientos de stock de una prenda en una tienda: "Entrada" para
 * todos; "Merma o corrección" solo owner y manager. No existe "Salida": la
 * venta se registra en /pos. El `requestId` nace al abrir y se conserva en los
 * reintentos hasta un resultado definitivo, para que un doble toque o un
 * reintento de red no duplique el movimiento.
 */
export function StockMovementPanel({
  variantId, locationId, role, storeBound = false, transferOnly = false, defaultFromId, defaultToId, onDone,
}: StockMovementPanelProps) {
  const canAdjust = role === "owner" || role === "manager";
  const [mode, setMode] = useState<Mode>("idle");
  const [entryQty, setEntryQty] = useState("1");
  const [adjustType, setAdjustType] = useState<AdjustType>("damage");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [adjustQty, setAdjustQty] = useState("1");
  const [reason, setReason] = useState("");
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [fromId, setFromId] = useState(defaultFromId ?? locationId);
  const [toId, setToId] = useState("");
  const [transferQty, setTransferQty] = useState("1");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
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
    setSessionExpired(false);
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
      result = withSession(await recordStockMovementAction(input));
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
    setSessionExpired(result.code === "SESSION");
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

  useEffect(() => {
    if (mode !== "transfer") return;
    let cancelled = false;
    fetchLocationsAction()
      .then((res) => {
        if (!cancelled) setStores((res ?? []).map((l) => ({ id: l.id, name: l.type === "warehouse" ? `${l.name} (bodega)` : l.name })));
      })
      .catch(() => {
        if (!cancelled) setError("No se pudieron cargar las tiendas. Intenta de nuevo.");
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const openTransfer = () => {
    setMode("transfer");
    setError("");
    setFromId(defaultFromId ?? locationId);
    setToId(defaultToId ?? "");
    newRequestId();
  };
  const closeTransfer = () => {
    setMode("idle");
    setError("");
    setNote("");
    requestIdRef.current = null;
  };

  const submitTransfer = async () => {
    if (busyRef.current) return;
    setError("");
    setSessionExpired(false);
    const quantity = Number(transferQty);
    if (!fromId) return setError("Elige la tienda de origen.");
    if (!toId) return setError("Elige la tienda de destino.");
    if (fromId === toId) return setError("El origen y el destino deben ser distintos.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_STOCK_QUANTITY) {
      return setError(`La cantidad debe ser un entero entre 1 y ${MAX_STOCK_QUANTITY}.`);
    }
    if (storeBound && fromId !== locationId && toId !== locationId) {
      return setError("Solo puedes traspasar desde o hacia tu tienda asignada.");
    }
    const trimmed = note.trim();
    busyRef.current = true;
    setPending(true);
    let result: StockMovementResult;
    try {
      result = withSession(
        await transferStockAction({
          variantId,
          fromLocationId: fromId,
          toLocationId: toId,
          quantity,
          requestId: currentRequestId(),
          ...(trimmed ? { note: trimmed } : {}),
        }),
      );
    } catch {
      result = { ok: false, code: "ERROR", message: "No se pudo registrar. Revisa tu conexión e intenta de nuevo." };
    }
    busyRef.current = false;
    setPending(false);

    if (result.ok) {
      requestIdRef.current = null;
      onDone(result.available, result.message);
      return;
    }
    if (result.code !== "ERROR" && result.code !== "SESSION") requestIdRef.current = null;
    setSessionExpired(result.code === "SESSION");
    setError(result.message);
  };

  const adjustLabel = adjustType === "damage" ? "Registrar merma" : "Registrar corrección";
  const primary =
    "min-h-[44px] w-full rounded-lg bg-loloteal px-4 py-2 font-semibold text-white active:bg-loloteal-dark disabled:opacity-60";
  const outline =
    "min-h-[44px] w-full rounded-lg border border-loloteal px-4 py-2 font-semibold text-loloteal active:bg-loloteal/10 disabled:opacity-60";
  const field = "min-h-[44px] rounded-md border border-gray-300 bg-white px-3 text-sm";

  return (
    <div data-testid="stock-panel" className="space-y-3">
      {mode === "idle" && transferOnly && canAdjust && (
        <button type="button" onClick={openTransfer} disabled={pending} className={outline}>
          Traspasar
        </button>
      )}
      {mode === "idle" && !transferOnly && (
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
              disabled={pending}
              className={`${field} w-24`}
            />
          </div>
          {canAdjust && (
            <button type="button" onClick={openAdjust} disabled={pending} className={outline}>
              Merma o corrección
            </button>
          )}
          {canAdjust && (
            <button type="button" onClick={openTransfer} disabled={pending} className={outline}>
              Traspasar
            </button>
          )}
        </>
      )}

      {mode === "transfer" && (
        <form
          className="space-y-3 rounded-lg border border-gray-200 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submitTransfer();
          }}
        >
          {(
            [
              ["origen", "Origen", fromId, setFromId],
              ["destino", "Destino", toId, setToId],
            ] as const
          ).map(([id, label, value, set]) => (
            <div key={id}>
              <label htmlFor={`traspaso-${id}`} className="block text-sm font-medium">
                {label}
              </label>
              <select
                id={`traspaso-${id}`}
                value={value}
                onChange={(e) => {
                  touch();
                  set(e.target.value);
                }}
                disabled={pending}
                className={`${field} mt-1 w-full`}
              >
                {id === "destino" && <option value="">Elige una tienda</option>}
                {stores.length === 0 && id === "origen" && <option value={fromId}>Cargando tiendas…</option>}
                {stores.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <label htmlFor="traspaso-cantidad" className="text-sm font-medium">
              Cantidad
            </label>
            <input
              id="traspaso-cantidad"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_STOCK_QUANTITY}
              value={transferQty}
              onChange={(e) => {
                touch();
                setTransferQty(e.target.value);
              }}
              disabled={pending}
              className={`${field} w-24`}
            />
          </div>
          <div>
            <label htmlFor="traspaso-nota" className="block text-sm font-medium">
              Nota (opcional)
            </label>
            <textarea
              id="traspaso-nota"
              rows={2}
              maxLength={MAX_REASON_LENGTH}
              value={note}
              onChange={(e) => {
                touch();
                setNote(e.target.value);
              }}
              disabled={pending}
              className={`${field} mt-1 w-full py-2`}
            />
          </div>
          <button type="submit" disabled={pending} className={primary}>
            Registrar traspaso
          </button>
          <button
            type="button"
            onClick={closeTransfer}
            disabled={pending}
            className="min-h-[44px] w-full text-sm text-gray-600"
          >
            Cancelar
          </button>
        </form>
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
                  disabled={pending}
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
                    disabled={pending}
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
              disabled={pending}
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
              disabled={pending}
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
          <ActionErrorText message={error} session={sessionExpired} />
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

"use client";
import { Button } from "@/components/ui/Button";
import { useId, useState } from "react";
import type { DashboardData } from "@/lib/data/sales-source";
import { LoginLink, SESSION_EXPIRED_TEXT, isSessionExpired } from "./session-expired";
import { setLowStockThresholdAction } from "@/lib/sales/dashboard-actions";

type Props = {
  rows: DashboardData["lowStock"];
  threshold: number;
  locationNames: Record<string, string>;
  namesReady?: boolean;
  canEditThreshold: boolean;
  /** Se llama tras guardar el umbral para recargar el tablero. */
  onThresholdSaved: () => void;
};

function ThresholdEditor({ threshold, onSaved }: { threshold: number; onSaved: () => void }) {
  const id = useId();
  const [value, setValue] = useState(String(threshold));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  async function save() {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 99) return setMessage("El umbral es un número entero de 0 a 99.");
    setBusy(true);
    setMessage(null);
    setExpired(false);
    try {
      const res = await setLowStockThresholdAction(n);
      if (isSessionExpired(res)) setExpired(true);
      else if (res.ok) onSaved();
      else setMessage(res.message ?? "No se pudo guardar el umbral.");
    } catch {
      setMessage("No se pudo guardar el umbral. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <label htmlFor={id} className="block text-sm text-tinta">
        Umbral de stock bajo
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={99}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-11 w-24 rounded-[11px] border border-borde-control bg-white px-3 text-base text-tinta"
        />
        <Button disabled={busy} onClick={save}>
          {busy ? "Guardando…" : "Guardar umbral"}
        </Button>
      </div>
      {message && (
        <p role="alert" className="mt-1 text-sm font-bold text-agotado">
          {message}
        </p>
      )}
      {expired && (
        <p role="alert" className="mt-1 text-sm font-bold text-agotado">
          {SESSION_EXPIRED_TEXT} <LoginLink />
        </p>
      )}
    </div>
  );
}

export function LowStockTable({ rows, threshold, locationNames, namesReady = true, canEditThreshold, onThresholdSaved }: Props) {
  return (
    <div>
      <p className="mb-2 text-xs text-tinta">Avisa cuando quedan {threshold} o menos piezas.</p>
      {rows.length === 0 ? (
        <p className="text-sm text-tinta">Sin alertas de stock.</p>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-borde-control bg-white">
          <table aria-label="Stock bajo" className="w-full text-left text-sm">
            <thead className="bg-niebla text-xs text-tinta">
              <tr>
                <th scope="col" className="px-3 py-2 font-bold">Producto</th>
                <th scope="col" className="px-3 py-2 font-bold">Talla</th>
                <th scope="col" className="px-3 py-2 font-bold">Tienda</th>
                <th scope="col" className="px-3 py-2 text-right font-bold">Disponible</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.variantId}-${r.locationId}`} className="border-t border-niebla">
                  <td className="px-3 py-2 text-tinta">{r.productTitle}</td>
                  <td className="px-3 py-2 text-tinta">{r.size}</td>
                  <td className="px-3 py-2 text-tinta">{locationNames[r.locationId] ?? (namesReady ? "Tienda sin nombre" : "…")}</td>
                  <td className="px-3 py-2 text-right">
                    <span aria-label={r.available === 0 ? "Agotado" : `${r.available} disponibles`} className="rounded-full bg-niebla px-2.5 py-0.5 font-data-mono tabular-nums text-xs font-bold text-agotado">{r.available === 0 ? "Agotado" : r.available}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEditThreshold && <ThresholdEditor key={threshold} threshold={threshold} onSaved={onThresholdSaved} />}
    </div>
  );
}

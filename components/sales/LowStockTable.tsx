"use client";
import { useId, useState } from "react";
import type { DashboardData } from "@/lib/data/sales-source";
import { setLowStockThresholdAction } from "@/lib/sales/dashboard-actions";

type Props = {
  rows: DashboardData["lowStock"];
  threshold: number;
  locationNames: Record<string, string>;
  canEditThreshold: boolean;
  /** Se llama tras guardar el umbral para recargar el tablero. */
  onThresholdSaved: () => void;
};

function ThresholdEditor({ threshold, onSaved }: { threshold: number; onSaved: () => void }) {
  const id = useId();
  const [value, setValue] = useState(String(threshold));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 99) return setMessage("El umbral es un número entero de 0 a 99.");
    setBusy(true);
    setMessage(null);
    try {
      const res = await setLowStockThresholdAction(n);
      if (res.ok) onSaved();
      else setMessage(res.message ?? "No se pudo guardar el umbral.");
    } catch {
      setMessage("No se pudo guardar el umbral. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <label htmlFor={id} className="block text-sm text-[#12211F]">
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
          className="min-h-11 w-24 rounded-[11px] border border-[rgba(18,33,31,0.25)] bg-white px-3 text-sm text-[#12211F]"
        />
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="min-h-11 rounded-[11px] bg-loloteal px-4 text-sm font-bold text-white transition-colors hover:bg-[#004f50] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loloteal disabled:opacity-60"
        >
          Guardar umbral
        </button>
      </div>
      {message && (
        <p role="alert" className="mt-1 text-sm font-bold text-[#9B2C20]">
          {message}
        </p>
      )}
    </div>
  );
}

export function LowStockTable({ rows, threshold, locationNames, canEditThreshold, onThresholdSaved }: Props) {
  return (
    <div>
      <p className="mb-2 font-mono text-xs text-[#3A4D4A]">umbral ≤ {threshold}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-[#3A4D4A]">Sin alertas de stock.</p>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-[rgba(18,33,31,0.12)] bg-white">
          <table aria-label="Stock bajo" className="w-full text-left text-sm">
            <thead className="bg-[#E6F2F1] text-xs text-[#12211F]">
              <tr>
                <th scope="col" className="px-3 py-2 font-bold">Producto</th>
                <th scope="col" className="px-3 py-2 font-bold">Talla</th>
                <th scope="col" className="px-3 py-2 font-bold">Tienda</th>
                <th scope="col" className="px-3 py-2 text-right font-bold">Disponible</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.variantId}-${r.locationId}`} className="border-t border-[rgba(18,33,31,0.08)]">
                  <td className="px-3 py-2 text-[#12211F]">{r.productTitle}</td>
                  <td className="px-3 py-2 text-[#12211F]">{r.size}</td>
                  <td className="px-3 py-2 text-[#3A4D4A]">{locationNames[r.locationId] ?? "Tienda sin nombre"}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="rounded-full bg-[#FFE7E2] px-2.5 py-0.5 font-mono text-xs font-bold text-[#9B2C20]">{r.available}</span>
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

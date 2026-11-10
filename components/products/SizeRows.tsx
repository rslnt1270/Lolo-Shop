"use client";
import { AlertCircle, Barcode, Minus, Plus, Trash2 } from "lucide-react";
import { MAX_SIZE_LENGTH } from "@/lib/domain/new-product";

/** Una fila de talla mientras se edita (los números quedan como texto hasta guardar). */
export interface SizeRowDraft {
  key: string;
  size: string;
  /** Código escaneado (ya canónico) o null = "Sin código". */
  barcode: string | null;
  price: string;
  initialStock: string;
}

interface SizeRowsProps {
  rows: SizeRowDraft[];
  onChange(rows: SizeRowDraft[]): void;
  /** Mensaje de error por `key` de fila (p. ej. código ya registrado). */
  rowErrors?: Record<string, string>;
}

const inputClass =
  "block min-h-[44px] w-full rounded-md border border-gray-300 bg-white px-3 text-base text-gray-900 focus:border-loloteal focus:outline-none focus:ring-2 focus:ring-loloteal";

/** Piezas: entero ≥ 0 en texto; los botones ± no bajan de 0. */
function stepStock(value: string, delta: number): string {
  const n = Number(value);
  const base = Number.isInteger(n) && n >= 0 ? n : 0;
  return String(Math.max(0, base + delta));
}

/**
 * Filas de la sección Tallas: Talla, Precio, Piezas (stepper) y quitar fila;
 * debajo, el código escaneado o "Sin código". Las fotos son del producto, no
 * de la talla, así que aquí no hay fotos.
 */
export function SizeRows({ rows, onChange, rowErrors = {} }: SizeRowsProps) {
  const update = (key: string, patch: Partial<SizeRowDraft>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => onChange(rows.filter((r) => r.key !== key));

  return (
    <ul className="space-y-3">
      {rows.map((row, i) => {
        const error = rowErrors[row.key];
        const id = (field: string) => `talla-${row.key}-${field}`;
        return (
          <li
            key={row.key}
            className={`rounded-xl border p-3 ${error ? "border-[#9A3B2E] bg-red-50" : "border-gray-200 bg-white"}`}
          >
            <div className="grid grid-cols-[5rem_1fr_44px] items-end gap-2">
              <div>
                <label htmlFor={id("size")} className="block text-xs font-medium text-gray-600">Talla</label>
                <input
                  id={id("size")}
                  type="text"
                  autoCapitalize="characters"
                  maxLength={MAX_SIZE_LENGTH}
                  value={row.size}
                  onChange={(e) => update(row.key, { size: e.target.value })}
                  placeholder="M"
                  className={`${inputClass} mt-1 text-center font-semibold uppercase`}
                />
              </div>
              <div>
                <label htmlFor={id("price")} className="block text-xs font-medium text-gray-600">Precio</label>
                <div className="relative mt-1">
                  <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">$</span>
                  <input
                    id={id("price")}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={row.price}
                    onChange={(e) => update(row.key, { price: e.target.value })}
                    placeholder="0.00"
                    className={`${inputClass} pl-7 font-mono`}
                  />
                </div>
              </div>
              <button
                type="button"
                aria-label={`Quitar esta fila (talla ${i + 1})`}
                onClick={() => remove(row.key)}
                disabled={rows.length === 1}
                className="flex h-11 w-11 items-center justify-center rounded-md text-[#9A3B2E] hover:bg-red-50 disabled:text-[#7F9392] disabled:hover:bg-transparent"
              >
                <Trash2 aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <label htmlFor={id("stock")} className="block text-xs font-medium text-gray-600">Piezas</label>
                <div className="mt-1 flex items-center rounded-md border border-gray-300">
                  <button
                    type="button"
                    aria-label="Quitar una pieza"
                    onClick={() => update(row.key, { initialStock: stepStock(row.initialStock, -1) })}
                    className="flex h-11 w-11 items-center justify-center text-gray-700"
                  >
                    <Minus aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <input
                    id={id("stock")}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={row.initialStock}
                    onChange={(e) => update(row.key, { initialStock: e.target.value })}
                    className="h-11 w-12 border-x border-gray-300 text-center font-mono text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-loloteal"
                  />
                  <button
                    type="button"
                    aria-label="Sumar una pieza"
                    onClick={() => update(row.key, { initialStock: stepStock(row.initialStock, 1) })}
                    className="flex h-11 w-11 items-center justify-center text-gray-700"
                  >
                    <Plus aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <span
                className={`inline-flex min-h-[32px] items-center gap-1 rounded-full border px-3 text-sm ${
                  error ? "border-[#9A3B2E] text-[#9A3B2E]" : "border-gray-200 bg-gray-50 text-gray-700"
                }`}
              >
                <Barcode aria-hidden="true" className="h-4 w-4" />
                {row.barcode !== null ? (
                  <span data-testid="codigo-escaneado" className="font-mono">{row.barcode}</span>
                ) : (
                  <span className="italic">Sin código</span>
                )}
              </span>
            </div>

            {error && (
              <p className="mt-2 flex items-start gap-1.5 text-sm font-medium text-[#9A3B2E]">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

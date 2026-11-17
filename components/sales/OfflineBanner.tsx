"use client";

/** Texto de la banda sin internet (spec §10). */
export const OFFLINE_BANNER_TEXT =
  "Sin internet. Las ventas se guardan en este teléfono y se envían solas al volver la conexión.";

const MIN_MS = 60 * 1000;
const HOUR_MS = 60 * MIN_MS;

/** Edad de la copia en palabras cortas: "menos de 1 min", "5 min", "2 h". */
export function formatSnapshotAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < MIN_MS) return "menos de 1 min";
  if (ms < HOUR_MS) return `${Math.floor(ms / MIN_MS)} min`;
  return `${Math.floor(ms / HOUR_MS)} h`;
}

interface OfflineBannerProps {
  /** Edad de la copia de precios y existencias; null si no hay copia vigente del cajero. */
  snapshotAgeMs: number | null;
  /** Ventas de este teléfono aún sin enviar. */
  pendingCount: number;
  /** Abre la hoja de ventas guardadas. Sin esto el contador no se muestra. */
  onOpenQueue?(): void;
}

/** Banda fija de `/pos` sin conexión: qué pasa con las ventas, edad de la copia y contador de la cola. */
export function OfflineBanner({ snapshotAgeMs, pendingCount, onOpenQueue }: OfflineBannerProps) {
  return (
    <div role="status" className="space-y-1 rounded-lg border border-tinta bg-tinta p-3 text-sm text-white shadow-sm">
      <p className="font-semibold">{OFFLINE_BANNER_TEXT}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {snapshotAgeMs !== null && <p>Precios y existencias de hace {formatSnapshotAge(snapshotAgeMs)}</p>}
        {pendingCount > 0 && onOpenQueue && (
          <button
            type="button"
            onClick={onOpenQueue}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-white px-3 font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {pendingCount} por enviar
          </button>
        )}
      </div>
    </div>
  );
}

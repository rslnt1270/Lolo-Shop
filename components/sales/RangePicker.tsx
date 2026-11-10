"use client";
import { useState } from "react";
import { addDays, businessTodayMx } from "@/lib/sales/format";

export type RangePreset = "today" | "7d" | "30d" | "custom";
const PRESETS: { id: RangePreset; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
  { id: "custom", label: "Personalizado" },
];

/** Rango sugerido por preset; el servidor lo vuelve a recortar por rol. */
export function presetRange(preset: Exclude<RangePreset, "custom">): { from: string; to: string } {
  const today = businessTodayMx();
  const back = preset === "today" ? 0 : preset === "7d" ? 6 : 29;
  return { from: addDays(today, -back), to: today };
}

type Props = {
  preset: RangePreset;
  from: string;
  to: string;
  onChange: (preset: RangePreset, range: { from: string; to: string }) => void;
};

const field =
  "min-h-11 rounded-[11px] border border-[rgba(18,33,31,0.25)] bg-white px-3 text-base text-[#12211F]";

export function RangePicker({ preset, from, to, onChange }: Props) {
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  function pick(id: RangePreset) {
    if (id === "custom") onChange("custom", { from: draftFrom, to: draftTo });
    else onChange(id, presetRange(id));
  }

  function setDate(which: "from" | "to", value: string) {
    const next = { from: which === "from" ? value : draftFrom, to: which === "to" ? value : draftTo };
    setDraftFrom(next.from);
    setDraftTo(next.to);
    if (next.from && next.to) onChange("custom", next);
  }

  return (
    <div>
      <div role="group" aria-label="Rango de fechas" className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const active = preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              onClick={() => pick(p.id)}
              className={`min-h-11 rounded-full border px-4 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loloteal ${
                active
                  ? "border-loloteal bg-loloteal text-white"
                  : "border-[rgba(18,33,31,0.25)] bg-white text-[#12211F] hover:bg-[#E6F2F1]"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {preset === "custom" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-[#3A4D4A]">
            Desde
            <input type="date" value={draftFrom} max={draftTo || undefined} onChange={(e) => setDate("from", e.target.value)} className={field} />
          </label>
          <label className="flex items-center gap-2 text-sm text-[#3A4D4A]">
            Hasta
            <input type="date" value={draftTo} min={draftFrom || undefined} onChange={(e) => setDate("to", e.target.value)} className={field} />
          </label>
        </div>
      )}
    </div>
  );
}

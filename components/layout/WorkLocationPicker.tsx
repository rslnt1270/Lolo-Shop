"use client";
import { useId } from "react";

type Props = {
  value: string;
  locations: { id: string; name: string }[];
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Texto cuando el selector está bloqueado (p. ej. venta sin red). */
  lockedLabel?: string;
};

export function WorkLocationPicker({ value, locations, onChange, disabled, lockedLabel }: Props) {
  const id = useId();
  const current = locations.find((l) => l.id === value);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-800">
        {current ? `Estás en: ${current.name}` : "Elige en qué tienda estás."}
      </p>
      <label htmlFor={id} className="block text-xs text-gray-600">
        Cambiar tienda
      </label>
      <select
        id={id}
        value={current ? value : ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[44px] w-full rounded-md border border-gray-200 bg-white px-3 text-sm disabled:bg-gray-100 disabled:text-gray-500"
      >
        {!current && (
          <option value="" disabled>
            Elige una tienda
          </option>
        )}
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      {disabled && lockedLabel && <p className="text-xs text-gray-600">{lockedLabel}</p>}
    </div>
  );
}

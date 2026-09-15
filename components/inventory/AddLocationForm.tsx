"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { Location, LocationType } from "@/lib/domain/types";

interface Props {
  onCreate: (data: { name: string; type: LocationType }) => Promise<Location>;
  onCreated: (location: Location) => void;
}

/** Botón "+ Tienda" que despliega un formulario compacto. Solo lo ve el dueño. */
export function AddLocationForm({ onCreate, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<LocationType>("store");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setType("store");
    setError("");
    setOpen(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmed = name.trim();
    if (!trimmed) return setError("Escribe el nombre de la tienda.");
    setSaving(true);
    try {
      const created = await onCreate({ name: trimmed, type });
      onCreated(created);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la tienda.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded-full border border-[#147E7E]/30 bg-white px-2.5 py-1 text-[0.68rem] font-bold text-[#147E7E] transition-colors hover:bg-[#147E7E]/5"
      >
        <Plus size={12} strokeWidth={3} /> Tienda
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-2 space-y-2 rounded-[14px] border border-[#147E7E]/30 bg-white p-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[#12211F]">Nueva tienda</span>
        <button type="button" onClick={reset} aria-label="Cancelar" className="text-gray-400 hover:text-gray-700">
          <X size={14} />
        </button>
      </div>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="loc-name">Nombre</label>
        <input
          id="loc-name"
          autoFocus
          placeholder="Nombre (ej. Tienda Centro)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-[rgba(226,232,240,0.8)] bg-[#F9FAFB] px-3 py-2 text-sm focus:border-[#2DD4BF] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2DD4BF]"
        />
        <label className="sr-only" htmlFor="loc-type">Tipo</label>
        <select
          id="loc-type"
          value={type}
          onChange={(e) => setType(e.target.value as LocationType)}
          className="rounded-xl border border-[rgba(226,232,240,0.8)] bg-[#F9FAFB] px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#2DD4BF]"
        >
          <option value="store">Tienda</option>
          <option value="warehouse">Bodega</option>
        </select>
      </div>
      {error && <p className="text-xs font-medium text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-xl bg-[#2DD4BF] py-2 text-sm font-semibold text-white transition-all hover:bg-[#25B5A3] active:scale-[0.98] disabled:opacity-70"
      >
        {saving ? "Guardando…" : "Guardar tienda"}
      </button>
    </form>
  );
}

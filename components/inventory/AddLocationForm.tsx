"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
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
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus size={14} strokeWidth={3} aria-hidden="true" /> Tienda
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-2 space-y-2 rounded-[14px] border border-turquesa-texto bg-white p-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-tinta">Nueva tienda</span>
        <button type="button" onClick={reset} aria-label="Cancelar" className="inline-flex min-h-11 min-w-11 items-center justify-center text-gray-600 hover:text-gray-900">
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
          className="min-w-0 flex-1 rounded-xl border border-[rgba(226,232,240,0.8)] bg-niebla px-3 py-2 min-h-11 text-sm focus:border-turquesa-texto focus:bg-white focus:outline-none focus:ring-1 focus:ring-turquesa-texto"
        />
        <label className="sr-only" htmlFor="loc-type">Tipo</label>
        <select
          id="loc-type"
          value={type}
          onChange={(e) => setType(e.target.value as LocationType)}
          className="rounded-xl border border-[rgba(226,232,240,0.8)] bg-niebla px-2 py-2 min-h-11 text-sm focus:outline-none focus:ring-1 focus:ring-turquesa-texto"
        >
          <option value="store">Tienda</option>
          <option value="warehouse">Bodega</option>
        </select>
      </div>
      {error && <p className="text-xs font-medium text-agotado">{error}</p>}
      <Button type="submit" loading={saving} className="w-full">
        {saving ? "Guardando…" : "Guardar tienda"}
      </Button>
    </form>
  );
}

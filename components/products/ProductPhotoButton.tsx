"use client";
import { useState } from "react";
import { ProductPhotoCapture } from "./ProductPhotoCapture";
import { updateProductImageAction } from "@/lib/actions";

interface ProductPhotoButtonProps {
  productId: string;
  hasImage: boolean;
  onUpdated?: () => void;
}

export function ProductPhotoButton({ productId, hasImage, onUpdated }: ProductPhotoButtonProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const save = async (file: File) => {
    setSaving(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("image", file);
      await updateProductImageAction(productId, fd);
      setMsg("Foto actualizada.");
      setOpen(false);
      onUpdated?.();
    } catch {
      setMsg("No se pudo guardar la foto.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-loloteal hover:underline"
      >
        {hasImage ? "Cambiar foto" : "Agregar foto"}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <ProductPhotoCapture onCapture={save} onClear={() => {}} />
      {saving && <p className="text-sm text-gray-500">Guardando…</p>}
      {msg && <p className="text-sm text-gray-600">{msg}</p>}
      <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-500">
        Cerrar
      </button>
    </div>
  );
}

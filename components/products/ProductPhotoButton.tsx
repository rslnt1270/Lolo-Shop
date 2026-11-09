"use client";
import { useState } from "react";
import { ProductPhotoCapture } from "./ProductPhotoCapture";
import { setProductBackImageAction, updateProductImageAction, uploadProductImageAction } from "@/lib/actions";

interface ProductPhotoButtonProps {
  productId: string;
  hasImage: boolean;
  /** Lado de la foto: "front" (por defecto) o "back". */
  side?: "front" | "back";
  onUpdated?: () => void;
}

export function ProductPhotoButton({ productId, hasImage, side = "front", onUpdated }: ProductPhotoButtonProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const save = async (file: File) => {
    setSaving(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("image", file);
      if (side === "back") {
        const up = await uploadProductImageAction(fd);
        if (!up.ok) throw new Error(up.message);
        await setProductBackImageAction(productId, up.url);
      } else {
        await updateProductImageAction(productId, fd);
      }
      setMsg(side === "back" ? "Foto de atrás actualizada." : "Foto de frente actualizada.");
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
        className="min-h-[44px] px-2 text-sm text-loloteal hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-loloteal"
      >
        {hasImage ? "Cambiar" : "Agregar"} foto de {side === "back" ? "atrás" : "frente"}
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

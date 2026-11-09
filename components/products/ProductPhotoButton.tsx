"use client";
import { useState } from "react";
import { ProductPhotoCapture } from "./ProductPhotoCapture";
import { setProductBackImageAction, updateProductImageAction, uploadProductImageAction } from "@/lib/actions";

interface ProductPhotoButtonProps {
  productId: string;
  /** Título del producto: forma parte del nombre accesible del botón. */
  productTitle?: string;
  hasImage: boolean;
  /** Lado de la foto: "front" (por defecto) o "back". */
  side?: "front" | "back";
  onUpdated?: () => void;
}

export function ProductPhotoButton({
  productId,
  productTitle,
  hasImage,
  side = "front",
  onUpdated,
}: ProductPhotoButtonProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const sideWord = side === "back" ? "atrás" : "frente";

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
      setMsg(`Foto de ${sideWord} actualizada.`);
      setOpen(false);
      onUpdated?.();
    } catch {
      setMsg("No se pudo guardar la foto.");
    } finally {
      setSaving(false);
    }
  };

  const label = `${hasImage ? "Cambiar" : "Agregar"} foto de ${sideWord}`;

  return (
    <div>
      {open ? (
        <div className="mt-2 space-y-2">
          <ProductPhotoCapture side={side} onCapture={save} onClear={() => {}} />
          {saving && <p className="text-sm text-gray-600">Guardando…</p>}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="min-h-[44px] px-2 text-sm text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-loloteal"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={productTitle ? `${label} de ${productTitle}` : undefined}
          className="min-h-[44px] px-2 text-sm text-loloteal hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-loloteal"
        >
          {label}
        </button>
      )}
      {/* Región en vivo siempre montada: el aviso se anuncia y sigue visible tras cerrar la captura. */}
      <p role="status" className="text-sm text-gray-600">
        {msg}
      </p>
    </div>
  );
}

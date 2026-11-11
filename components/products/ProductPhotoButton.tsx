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
  /**
   * La foto pasó la revisión de fondo blanco en el navegador. Hasta que la
   * captura incluya el análisis (Tarea 8) vale false y el servidor la rechaza.
   */
  photosAnalyzed?: boolean;
  onUpdated?: () => void;
}

export function ProductPhotoButton({
  productId,
  productTitle,
  hasImage,
  side = "front",
  photosAnalyzed = false,
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
        const r = await setProductBackImageAction(productId, up.url, { photosAnalyzed });
        if (!r.ok) {
          setMsg(r.message);
          return;
        }
      } else {
        const r = await updateProductImageAction(productId, fd, { photosAnalyzed });
        if (!r.ok) {
          setMsg(r.message);
          return;
        }
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
        {saving ? "Guardando…" : msg}
      </p>
    </div>
  );
}

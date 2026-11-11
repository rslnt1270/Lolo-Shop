"use client";
import { useState } from "react";
import { ProductPhotoCapture } from "./ProductPhotoCapture";
import { Button } from "@/components/ui/Button";
import type { ProcessFile } from "@/lib/image/process-file";
import {
  setCatalogPhotosAction,
  setProductBackImageAction,
  updateProductImageAction,
  uploadProductImageAction,
} from "@/lib/actions";

interface ProductPhotoButtonProps {
  productId: string;
  /** Título del producto: forma parte del nombre accesible del botón. */
  productTitle?: string;
  hasImage: boolean;
  /** Lado de la foto: "front" (por defecto) o "back". */
  side?: "front" | "back";
  /**
   * El producto ya tiene las fotos de catálogo revisadas (`catalogPhotosCheckedAt`).
   * Si es false, se ofrece tomar frente y atrás juntas y guardarlas con `setCatalogPhotosAction`.
   */
  catalogChecked?: boolean;
  /** Solo para pruebas: reemplaza la edición y el análisis con canvas. */
  processFile?: ProcessFile;
  onUpdated?: () => void;
}

// ProductPhotoCapture solo entrega fotos cuyo fondo pasó el análisis, así que todo
// lo que llega a `save` se envía con photosAnalyzed: true. El servidor lo exige igual.
const ANALYZED = { photosAnalyzed: true } as const;

export function ProductPhotoButton({
  productId,
  productTitle,
  hasImage,
  side = "front",
  catalogChecked = true,
  processFile,
  onUpdated,
}: ProductPhotoButtonProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const sideWord = side === "back" ? "atrás" : "frente";

  const finish = (text: string) => {
    setMsg(text);
    setOpen(false);
    setFront(null);
    setBack(null);
    onUpdated?.();
  };

  const save = async (file: File) => {
    setSaving(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("image", file);
      if (side === "back") {
        const up = await uploadProductImageAction(fd);
        if (!up.ok) throw new Error(up.message);
        const r = await setProductBackImageAction(productId, up.url, ANALYZED);
        if (!r.ok) {
          setMsg(r.message);
          return;
        }
      } else {
        const r = await updateProductImageAction(productId, fd, ANALYZED);
        if (!r.ok) {
          setMsg(r.message);
          return;
        }
      }
      finish(`Foto de ${sideWord} actualizada.`);
    } catch {
      setMsg("No se pudo guardar la foto.");
    } finally {
      setSaving(false);
    }
  };

  const saveCatalog = async () => {
    if (!front || !back) return;
    setSaving(true);
    setMsg("");
    try {
      const upload = async (file: File) => {
        const fd = new FormData();
        fd.append("image", file);
        const up = await uploadProductImageAction(fd);
        if (!up.ok) throw new Error(up.message);
        return up.url;
      };
      const imageUrl = await upload(front);
      const backImageUrl = await upload(back);
      const r = await setCatalogPhotosAction(productId, { imageUrl, backImageUrl, ...ANALYZED });
      if (!r.ok) {
        setMsg(r.message);
        return;
      }
      finish("Fotos de catálogo guardadas.");
    } catch {
      setMsg("No se pudieron guardar las fotos. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const cancel = (
    <button
      type="button"
      onClick={() => setOpen(false)}
      className="min-h-[44px] px-2 text-sm text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-loloteal"
    >
      Cancelar
    </button>
  );

  const label = `${hasImage ? "Cambiar" : "Agregar"} foto de ${sideWord}`;
  const catalogLabel = "Tomar fotos de catálogo (frente y atrás)";

  return (
    <div>
      {open && !catalogChecked ? (
        <div className="mt-2 space-y-3">
          <p className="text-sm font-semibold text-gray-900">Foto de frente</p>
          <ProductPhotoCapture side="front" processFile={processFile} onCapture={setFront} onClear={() => setFront(null)} />
          <p className="text-sm font-semibold text-gray-900">Foto de atrás</p>
          <ProductPhotoCapture side="back" processFile={processFile} onCapture={setBack} onClear={() => setBack(null)} />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void saveCatalog()} disabled={!front || !back} loading={saving}>
              Guardar fotos
            </Button>
            {cancel}
          </div>
        </div>
      ) : open ? (
        <div className="mt-2 space-y-2">
          <ProductPhotoCapture side={side} processFile={processFile} onCapture={save} onClear={() => {}} />
          {cancel}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={productTitle ? `${catalogChecked ? label : catalogLabel} de ${productTitle}` : undefined}
          className="min-h-[44px] px-2 text-sm font-semibold text-turquesa-texto hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-loloteal"
        >
          {catalogChecked ? label : catalogLabel}
        </button>
      )}
      {/* Región en vivo siempre montada: el aviso se anuncia y sigue visible tras cerrar la captura. */}
      <p role="status" className="text-sm text-gray-600">
        {saving ? "Guardando…" : msg}
      </p>
    </div>
  );
}

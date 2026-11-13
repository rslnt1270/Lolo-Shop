"use client";
import { useState } from "react";
import { ProductPhotoCapture } from "./ProductPhotoCapture";
import { Button } from "@/components/ui/Button";
import { defaultProcessFile, type ProcessFile } from "@/lib/image/process-file";
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
   * Ofrece tomar frente y atrás juntas y guardarlas con `setCatalogPhotosAction`
   * (producto sin ninguna foto). Por defecto false: un botón por lado.
   */
  captureBoth?: boolean;
  /** Solo para pruebas: reemplaza la edición con canvas. */
  processFile?: ProcessFile;
  onUpdated?: () => void;
}

export function ProductPhotoButton({
  productId,
  productTitle,
  hasImage,
  side = "front",
  captureBoth = false,

  processFile = defaultProcessFile,
  onUpdated,
}: ProductPhotoButtonProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const sideWord = side === "back" ? "atrás" : "frente";
  // Reemplazar una foto ya puesta: galería (el dueño la editó fuera) y sin autoniveles.
  const replacing = hasImage && !captureBoth;
  const process: ProcessFile = (file) => processFile(file, { levels: !replacing });

  const close = () => {
    setOpen(false);
    setFront(null);
    setBack(null);
  };

  const finish = (text: string) => {
    setMsg(text);
    close();
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
        const r = await setProductBackImageAction(productId, up.url);
        if (!r.ok) {
          setMsg(r.message);
          return;
        }
      } else {
        const r = await updateProductImageAction(productId, fd);
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
      const r = await setCatalogPhotosAction(productId, { imageUrl, backImageUrl });
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
    <Button variant="outline"
      onClick={close}
    >
      Cancelar
    </Button>
  );

  const label = `${hasImage ? "Reemplazar" : "Agregar"} foto de ${sideWord}`;
  const catalogLabel = "Tomar fotos de catálogo (frente y atrás)";

  return (
    <div>
      {open && captureBoth ? (
        <div className="mt-2 space-y-3">
          <p className="text-sm font-semibold text-gray-900">Foto de frente</p>
          <ProductPhotoCapture side="front" processFile={process} onCapture={setFront} onClear={() => setFront(null)} />
          <p className="text-sm font-semibold text-gray-900">Foto de atrás</p>
          <ProductPhotoCapture side="back" processFile={process} onCapture={setBack} onClear={() => setBack(null)} />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void saveCatalog()} disabled={!front || !back} loading={saving}>
              Guardar fotos
            </Button>
            {cancel}
          </div>
        </div>
      ) : open ? (
        <div className="mt-2 space-y-2">
          <ProductPhotoCapture side={side} source={replacing ? "gallery" : "camera"} processFile={process} onCapture={save} onClear={() => {}} />
          {cancel}
        </div>
      ) : (
        <Button variant="outline"
          onClick={() => setOpen(true)}
          aria-label={productTitle ? `${captureBoth ? catalogLabel : label} de ${productTitle}` : undefined}
        >
          {captureBoth ? catalogLabel : label}
        </Button>
      )}
      {/* Región en vivo siempre montada: el aviso se anuncia y sigue visible tras cerrar la captura. */}
      <p role="status" className="text-sm text-gray-600">
        {saving ? "Guardando…" : msg}
      </p>
    </div>
  );
}

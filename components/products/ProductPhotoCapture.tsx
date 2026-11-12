"use client";
import { useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { useMotionTiming } from "@/lib/motion/use-reduced-motion";
import { defaultProcessFile, type ProcessFile } from "@/lib/image/process-file";

export const PHOTO_HINT_FRONT = "Toma la foto de frente de la prenda.";
export const PHOTO_HINT_BACK = "Toma la foto de atrás de la prenda.";

interface ProductPhotoCaptureProps {
  onCapture: (file: File) => void;
  onClear: () => void;
  onBusyChange?: (busy: boolean) => void;
  /** Lado de la foto; distingue las dos capturas para lectores de pantalla. */
  side?: "front" | "back";
  /** Edita la foto (sin analizar el fondo). Por defecto usa canvas; se inyecta en pruebas. */
  processFile?: ProcessFile;
  /** "camera" (por defecto) abre la cámara; "gallery" deja elegir de la galería (sin `capture`). */
  source?: "camera" | "gallery";
}

export function ProductPhotoCapture({ onCapture, onClear, onBusyChange, side, processFile = defaultProcessFile, source = "camera" }: ProductPhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = useMotionTiming();
  const sideWord = side === "back" ? "atrás" : side === "front" ? "frente" : null;
  const forSide = sideWord ? ` de ${sideWord}` : "";

  useEffect(() => {
    onBusyChange?.(busy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const process = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      // Decisión del dueño (2026-11-12): cualquier fondo sirve; toda foto procesada se acepta.
      const { file: edited } = await processFile(file);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(edited));
      onCapture(edited);
    } catch {
      setError("No se pudo procesar la imagen. Intenta con otra foto.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("El archivo debe ser una imagen.");
      return;
    }
    void process(file);
  };

  const clear = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
    onClear();
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={source === "camera" ? "environment" : undefined}
        onChange={handleChange}
        className="hidden"
        id={inputId}
      />
      {preview ? (
        <div className="space-y-2">
          <motion.img
            src={preview}
            alt={`Vista previa de la foto${forSide}`}
            className="w-32 h-32 rounded-lg object-cover border"
            initial={{ scale: t.photoScaleFrom }}
            animate={{ scale: 1 }}
            transition={{ duration: t.photoMs / 1000, ease: "easeOut" }}
          />
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={busy} aria-label={`Retomar foto${forSide}`}>
              Retomar
            </Button>
            <button type="button" onClick={clear} className="min-h-[44px] px-2 text-sm text-gray-600" aria-label={`Quitar foto${forSide}`}>
              Quitar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-700">{side === "back" ? PHOTO_HINT_BACK : PHOTO_HINT_FRONT}</p>
          <Button
            onClick={() => inputRef.current?.click()}
            loading={busy}
            aria-label={busy ? undefined : `Tomar o subir foto${forSide}`}
            className="w-full"
          >
            {busy ? "Procesando…" : "Tomar foto"}
          </Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-agotado">{error}</p>}
    </div>
  );
}

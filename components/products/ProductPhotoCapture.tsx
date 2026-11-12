"use client";
import { useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { useMotionTiming } from "@/lib/motion/use-reduced-motion";
import { defaultProcessFile, type ProcessFile } from "@/lib/image/process-file";

export const FRAMING_GUIDE = "Toma la prenda completa. Cualquier fondo sirve.";

/** Desplazamiento horizontal repetido `count` veces; con 0 no se mueve. */
export function shakeKeyframes(count: number): number[] {
  if (count <= 0) return [0];
  const out = [0];
  for (let i = 0; i < count; i += 1) out.push(-6, 6);
  out.push(0);
  return out;
}

interface ProductPhotoCaptureProps {
  onCapture: (file: File) => void;
  onClear: () => void;
  onBusyChange?: (busy: boolean) => void;
  /** Lado de la foto; distingue las dos capturas para lectores de pantalla. */
  side?: "front" | "back";
  /** Edita y analiza el fondo. Por defecto usa canvas; se inyecta en pruebas. */
  processFile?: ProcessFile;
}

export function ProductPhotoCapture({ onCapture, onClear, onBusyChange, side, processFile = defaultProcessFile }: ProductPhotoCaptureProps) {
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
      // Decisión del dueño (2026-11-12): sin requisito de fondo blanco; toda foto procesada se acepta.
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
        capture="environment"
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
          <p className="text-sm text-gray-700">{FRAMING_GUIDE}</p>
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

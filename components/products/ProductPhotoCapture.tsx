"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { defaultProcessFile, type ProcessFile } from "@/lib/image/process-file";

export const FRAMING_GUIDE = "Coloca la prenda sobre una superficie blanca y céntrala en el marco.";
export const BACKGROUND_REJECTED =
  "El fondo no está en blanco. Repite la foto con la prenda sobre una superficie blanca.";

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
      const { file: edited, analysis } = await processFile(file);
      if (!analysis.ok) {
        // Foto rechazada: no se conserva ni se entrega; solo se puede repetir.
        setError(BACKGROUND_REJECTED);
        return;
      }
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={`Vista previa de la foto${forSide}`} className="w-32 h-32 rounded-lg object-cover border" />
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
          <div
            data-testid="framing-guide"
            className="relative mx-auto flex aspect-square w-full max-w-[200px] items-center justify-center rounded-lg border-2 border-dashed border-borde-control bg-white"
          >
            <div aria-hidden="true" className="h-3/5 w-3/5 rounded-md border-2 border-turquesa-texto/60" />
          </div>
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

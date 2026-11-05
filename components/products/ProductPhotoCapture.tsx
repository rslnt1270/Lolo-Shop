"use client";
import { useEffect, useId, useRef, useState } from "react";
import { computeSquareCrop, autoLevels } from "@/lib/image/process";

const MAX_SIZE = 1080;
const MAX_BYTES = 1024 * 1024;

interface ProductPhotoCaptureProps {
  onCapture: (file: File) => void;
  onClear: () => void;
  onBusyChange?: (busy: boolean) => void;
}

export function ProductPhotoCapture({ onCapture, onClear, onBusyChange }: ProductPhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const { sx, sy, size } = computeSquareCrop(bitmap.width, bitmap.height);
      const out = Math.min(size, MAX_SIZE);

      const canvas = document.createElement("canvas");
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas no disponible");
      ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, out, out);

      const imageData = ctx.getImageData(0, 0, out, out);
      autoLevels(imageData.data);
      ctx.putImageData(imageData, 0, 0);

      const encode = (quality: number): Promise<Blob> =>
        new Promise((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob falló"))), "image/jpeg", quality)
        );
      // 1080x1080 a calidad 0.8 suele pesar 150-400 KB; si pasa de 1 MB, recomprime.
      let blob = await encode(0.8);
      if (blob.size > MAX_BYTES) blob = await encode(0.6);
      if (blob.size > MAX_BYTES) blob = await encode(0.45);
      const edited = new File([blob], "producto.jpg", { type: "image/jpeg" });

      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(edited));
      onCapture(edited);
    } catch {
      setError("No se pudo procesar la imagen. Intenta con otra foto.");
    } finally {
      setBusy(false);
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
          <img src={preview} alt="Vista previa" className="w-32 h-32 rounded-lg object-cover border" />
          <div className="flex gap-3 text-sm">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="min-h-[44px] px-2 text-loloteal">
              Retomar
            </button>
            <button type="button" onClick={clear} className="min-h-[44px] px-2 text-gray-500">
              Quitar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="min-h-[44px] w-full rounded-md border border-dashed border-gray-300 py-3 text-sm text-gray-600 hover:border-loloteal disabled:opacity-50"
        >
          {busy ? "Procesando…" : "📷 Tomar o subir foto"}
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

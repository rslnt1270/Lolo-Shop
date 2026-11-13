"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Button } from "@/components/ui/Button";
import { SCAN_FORMAT_NAMES } from "@/lib/domain/scan-formats";

type Props = {
  onScan: (decodedText: string) => void;
  /** Validación extra (p. ej. checksum GTIN). Solo se aplica a códigos numéricos de 8/12/13/14 dígitos. */
  validate?: (code: string) => boolean;
  /** Inicia la cámara al montar (úsalo solo si ya hubo un gesto del usuario antes). */
  autoStart?: boolean;
  /** Se llama cuando la cámara quedó corriendo (hubo gesto y permiso). */
  onStarted?: () => void;
  /**
   * Modo continuo (opt-in, p. ej. ventas): la cámara sigue corriendo tras cada lectura y `onScan` se llama
   * una vez por presentación de la prenda. Sin él, una lectura detiene la cámara (`/escanear`).
   */
  continuous?: boolean;
};

type Facing = "environment" | "user";
type Status = "idle" | "starting" | "running" | "error";

const READER_ID = "loloshop-reader";
const FORMATS = SCAN_FORMAT_NAMES.map((name) => Html5QrcodeSupportedFormats[name]);
const GTIN_LENGTHS = [8, 12, 13, 14];
/**
 * Modo continuo: un código ya emitido solo se emite de nuevo si pasó al menos este tiempo sin leerlo
 * (la prenda salió del cuadro y se presentó otra vez).
 */
export const SAME_CODE_GAP_MS = 1000;

export function cameraErrorMessage(err: unknown): string {
  if (typeof window !== "undefined" && (!window.isSecureContext || !navigator.mediaDevices)) {
    return "La cámara necesita HTTPS (o localhost) para funcionar. Abre la página desde una dirección segura.";
  }
  const name = (err as { name?: string })?.name ?? "";
  const text = String((err as { message?: string })?.message ?? err ?? "");
  if (name === "NotAllowedError" || /permission|denied|NotAllowed/i.test(text)) {
    return "Permite la cámara en el navegador para poder escanear y vuelve a intentarlo.";
  }
  if (name === "NotFoundError" || /NotFound|no camera|Requested device not found/i.test(text)) {
    return "No se encontró ninguna cámara en este dispositivo.";
  }
  if (name === "NotReadableError" || name === "AbortError" || /NotReadable|in use|could not start/i.test(text)) {
    return "La cámara está ocupada por otra aplicación. Ciérrala y reintenta.";
  }
  return "No se pudo iniciar la cámara. Reintenta o escribe el código a mano.";
}

export function Scanner({ onScan, validate, autoStart = false, onStarted, continuous = false }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const lastRef = useRef<{ code: string; count: number } | null>(null);
  const onScanRef = useRef(onScan);
  const validateRef = useRef(validate);
  const onStartedRef = useRef(onStarted);
  const generationRef = useRef(0);
  const continuousRef = useRef(continuous);
  /** Modo continuo: código emitido → última vez que se leyó. */
  const emittedRef = useRef(new Map<string, number>());
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
    validateRef.current = validate;
    onStartedRef.current = onStarted;
    continuousRef.current = continuous;
  });

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      await scanner.stop();
    } catch {
      /* ya detenido */
    }
    try {
      scanner.clear();
    } catch {
      /* nada que limpiar */
    }
  }, []);

  const handleDecoded = useCallback(
    (text: string) => {
      if (handledRef.current) return;
      const code = text.trim();
      if (!code) return;
      if (/^\d+$/.test(code) && GTIN_LENGTHS.includes(code.length)) {
        if (validateRef.current && !validateRef.current(code)) {
          lastRef.current = null;
          return;
        }
      }
      const isContinuous = continuousRef.current;
      if (isContinuous) {
        const now = Date.now();
        const seenAt = emittedRef.current.get(code);
        if (seenAt !== undefined) {
          emittedRef.current.set(code, now);
          if (now - seenAt < SAME_CODE_GAP_MS) return; // sigue en cuadro: no suma otra vez
          // salió del cuadro y volvió: nueva presentación, se confirma de nuevo
          emittedRef.current.delete(code);
          lastRef.current = { code, count: 1 };
          return;
        }
      }
      const last = lastRef.current;
      if (last && last.code === code) {
        last.count += 1;
      } else {
        lastRef.current = { code, count: 1 };
      }
      if ((lastRef.current?.count ?? 0) < 2) return;
      try {
        navigator.vibrate?.(80);
      } catch {
        /* sin vibración */
      }
      if (isContinuous) {
        const now = Date.now();
        emittedRef.current.set(code, now);
        for (const [c, t] of emittedRef.current) if (now - t > 60_000) emittedRef.current.delete(c);
        lastRef.current = null;
        onScanRef.current(code);
        return;
      }
      handledRef.current = true;
      void stopScanner().then(() => {
        setStatus("idle");
        setTorchAvailable(false);
        setTorchOn(false);
      });
      onScanRef.current(code);
    },
    [stopScanner]
  );

  const start = useCallback(
    async (mode: Facing) => {
      const generation = ++generationRef.current;
      setError(null);
      setStatus("starting");
      setTorchOn(false);
      setTorchAvailable(false);
      handledRef.current = false;
      lastRef.current = null;
      emittedRef.current.clear();
      await stopScanner();
      if (generation !== generationRef.current) return;
      if (typeof window !== "undefined" && (!window.isSecureContext || !navigator.mediaDevices)) {
        setError(cameraErrorMessage(null));
        setStatus("error");
        return;
      }
      const scanner = new Html5Qrcode(READER_ID, {
        formatsToSupport: FORMATS,
        verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      });
      scannerRef.current = scanner;
      try {
        await scanner.start(
          { facingMode: mode },
          {
            fps: 12,
            qrbox: (w: number, h: number) => ({
              width: Math.floor(w * 0.85),
              height: Math.floor(Math.min(h, w) * 0.45),
            }),
            aspectRatio: 1.777778,
            disableFlip: true,
          },
          handleDecoded,
          () => {
            /* errores de frame: ignorar */
          }
        );
        if (generation !== generationRef.current) {
          // desmontado o reiniciado mientras arrancaba
          if (scannerRef.current === scanner) await stopScanner();
          else {
            try { await scanner.stop(); } catch {}
            try { scanner.clear(); } catch {}
          }
          return;
        }
        setStatus("running");
        onStartedRef.current?.();
        try {
          await scanner.applyVideoConstraints({
            advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
          });
        } catch {
          /* enfoque continuo no soportado */
        }
        try {
          const caps = scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & { torch?: boolean };
          setTorchAvailable(Boolean(caps?.torch));
        } catch {
          setTorchAvailable(false);
        }
      } catch (err) {
        if (generation !== generationRef.current) return;
        await stopScanner();
        setError(cameraErrorMessage(err));
        setStatus("error");
      }
    },
    [handleDecoded, stopScanner]
  );

  useEffect(() => {
    if (autoStart) void start("environment");
    return () => {
      generationRef.current += 1;
      void stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTorch = async () => {
    const next = !torchOn;
    try {
      await scannerRef.current?.applyVideoConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  };

  const switchCamera = () => {
    const next: Facing = facing === "environment" ? "user" : "environment";
    setFacing(next);
    void start(next);
  };

  return (
    <div className="mx-auto w-full max-w-sm space-y-3">
      <div
        id={READER_ID}
        className={`w-full overflow-hidden rounded-lg border bg-black/5 ${status === "running" || status === "starting" ? "" : "hidden"}`}
      />

      {status === "idle" && (
        <Button onClick={() => void start(facing)} className="w-full">
          Activar cámara
        </Button>
      )}
      {status === "starting" && (
        <p role="status" className="text-center text-sm text-gray-600">
          Iniciando cámara…
        </p>
      )}
      {status === "running" && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {torchAvailable && (
            <Button variant="outline" onClick={() => void toggleTorch()} aria-pressed={torchOn}>
              {torchOn ? "Apagar linterna" : "Linterna"}
            </Button>
          )}
          <Button variant="outline" onClick={switchCamera}>
            Cambiar cámara
          </Button>
        </div>
      )}
      {status === "error" && error && (
        <div role="alert" className="space-y-2 rounded-lg border border-agotado bg-white p-3 text-sm text-agotado">
          <p>{error}</p>
          <Button variant="danger" onClick={() => void start(facing)}>
            Reintentar
          </Button>
        </div>
      )}
    </div>
  );
}

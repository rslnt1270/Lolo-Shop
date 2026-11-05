"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

type Props = {
  onScan: (decodedText: string) => void;
  /** Validación extra (p. ej. checksum GTIN). Solo se aplica a códigos numéricos de 8/12/13/14 dígitos. */
  validate?: (code: string) => boolean;
  /** Inicia la cámara al montar (úsalo solo si ya hubo un gesto del usuario antes). */
  autoStart?: boolean;
  /** Se llama cuando la cámara quedó corriendo (hubo gesto y permiso). */
  onStarted?: () => void;
};

type Facing = "environment" | "user";
type Status = "idle" | "starting" | "running" | "error";

const READER_ID = "loloshop-reader";
const FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.QR_CODE,
];
const GTIN_LENGTHS = [8, 12, 13, 14];

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

export function Scanner({ onScan, validate, autoStart = false, onStarted }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const lastRef = useRef<{ code: string; count: number } | null>(null);
  const onScanRef = useRef(onScan);
  const validateRef = useRef(validate);
  const onStartedRef = useRef(onStarted);
  const generationRef = useRef(0);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
    validateRef.current = validate;
    onStartedRef.current = onStarted;
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
      const last = lastRef.current;
      if (last && last.code === code) {
        last.count += 1;
      } else {
        lastRef.current = { code, count: 1 };
      }
      if ((lastRef.current?.count ?? 0) < 2) return;
      handledRef.current = true;
      try {
        navigator.vibrate?.(80);
      } catch {
        /* sin vibración */
      }
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

  const btn =
    "min-h-[44px] min-w-[44px] rounded-lg px-4 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-loloteal";

  return (
    <div className="mx-auto w-full max-w-sm space-y-3">
      <div
        id={READER_ID}
        className={`w-full overflow-hidden rounded-lg border bg-black/5 ${status === "running" || status === "starting" ? "" : "hidden"}`}
      />

      {status === "idle" && (
        <button type="button" onClick={() => void start(facing)} className={`${btn} w-full bg-loloteal text-white`}>
          Activar cámara
        </button>
      )}
      {status === "starting" && (
        <p role="status" className="text-center text-sm text-gray-600">
          Iniciando cámara…
        </p>
      )}
      {status === "running" && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {torchAvailable && (
            <button
              type="button"
              onClick={() => void toggleTorch()}
              aria-pressed={torchOn}
              className={`${btn} border border-gray-300 bg-white`}
            >
              {torchOn ? "Apagar linterna" : "Linterna"}
            </button>
          )}
          <button type="button" onClick={switchCamera} className={`${btn} border border-gray-300 bg-white`}>
            Cambiar cámara
          </button>
        </div>
      )}
      {status === "error" && error && (
        <div role="alert" className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p>{error}</p>
          <button type="button" onClick={() => void start(facing)} className={`${btn} bg-red-600 text-white`}>
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}

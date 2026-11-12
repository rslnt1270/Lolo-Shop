"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { useMotionTiming } from "@/lib/motion/use-reduced-motion";

export const TOUR_STEPS = [
  { title: "Escanea la etiqueta", body: "Apunta la cámara al código de la etiqueta. Si no se lee, escríbelo a mano." },
  { title: "Elige si va al catálogo", body: "Decide si la prenda se publica con fotos o solo se registra en inventario." },
  { title: "Toma fotos de frente y atrás", body: "Fotografía el frente y la parte de atrás de la prenda. El dueño las revisa antes de publicarlas." },
] as const;

interface AltaTourProps {
  open: boolean;
  onClose: () => void;
}

export function AltaTour({ open, onClose }: AltaTourProps) {
  const [step, setStep] = useState(0);
  const t = useMotionTiming();
  const dialogRef = useRef<HTMLDivElement>(null);

  const returnRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    returnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const el = returnRef.current;
      returnRef.current = null;
      if (el && el !== document.body && el.isConnected) el.focus();
    };
  }, [open]);

  useEffect(() => {
    if (open) dialogRef.current?.querySelector<HTMLButtonElement>("[data-tour-next]")?.focus();
  }, [open, step]);

  if (!open) return null;
  const last = step === TOUR_STEPS.length - 1;
  const current = TOUR_STEPS[step];
  const dur = t.stepMs / 1000;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,var(--safe-bottom))] sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="alta-tour-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onClose();
            return;
          }
          if (e.key !== "Tab") return;
          const items = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
          if (items.length === 0) return;
          const first = items[0];
          const lastEl = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            lastEl.focus();
          } else if (!e.shiftKey && document.activeElement === lastEl) {
            e.preventDefault();
            first.focus();
          }
        }}
        className="w-full max-w-sm space-y-4 overflow-hidden rounded-xl bg-white p-4 shadow-lg"
      >
        <p className="text-sm font-medium text-gray-700">
          Paso {step + 1} de {TOUR_STEPS.length}
        </p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            data-testid="tour-step"
            initial={{ opacity: 0, x: t.stepOffsetPx }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -t.stepOffsetPx }}
            transition={{ duration: dur, ease: "easeOut" }}
            className="space-y-1"
          >
            <h2 id="alta-tour-title" className="text-lg font-semibold text-gray-900">{current.title}</h2>
            <p className="text-sm text-gray-700">{current.body}</p>
          </motion.div>
        </AnimatePresence>
        <div className="flex justify-center gap-2" aria-hidden="true">
          {TOUR_STEPS.map((_, i) => (
            <motion.span
              key={i}
              className="h-2 w-2 rounded-full border border-loloteal"
              animate={{ backgroundColor: i <= step ? "#3CBFBF" : "#FFFFFF" }}
              transition={{ duration: dur }}
            />
          ))}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Saltar
          </Button>
          <Button
            onClick={() => (last ? onClose() : setStep((s) => s + 1))}
            className="flex-1"
            data-tour-next=""
          >
            {last ? "Empezar" : "Siguiente"}
          </Button>
        </div>
      </div>
    </div>
  );
}

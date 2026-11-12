"use client";
import { useEffect, useState } from "react";
import { useMotionTiming } from "@/lib/motion/use-reduced-motion";

/**
 * Marca de guardado: el check se dibuja (clase lolo-btn-check de globals.css,
 * 420 ms; con reducir movimiento aparece dibujado) y se mantiene `holdMs`.
 * El estado en texto queda siempre al lado, la marca solo acompaña.
 */
export function SavedCheck() {
  const { holdMs } = useMotionTiming();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setVisible(false), holdMs);
    return () => clearTimeout(id);
  }, [holdMs]);
  if (!visible) return null;
  return (
    <span data-testid="saved-check" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-turquesa text-tinta">
      <svg className="lolo-btn-check h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

"use client";
import { useEffect, useState } from "react";
import { REDUCED_MOTION_QUERY, motionTiming, prefersReducedMotion, type MotionTiming } from "./timing";

/** Preferencia del sistema; se actualiza si cambia. Nunca lanza. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(prefersReducedMotion());
    try {
      const mq = window.matchMedia(REDUCED_MOTION_QUERY);
      const onChange = () => setReduced(prefersReducedMotion());
      mq.addEventListener?.("change", onChange);
      return () => mq.removeEventListener?.("change", onChange);
    } catch {
      return undefined;
    }
  }, []);
  return reduced;
}

export function useMotionTiming(): MotionTiming {
  return motionTiming(useReducedMotion());
}

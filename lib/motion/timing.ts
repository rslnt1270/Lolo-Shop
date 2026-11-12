/** Tiempos de movimiento del alta (spec alta-producto §4.5). Un solo lugar. */
export interface MotionTiming {
  stepMs: number;
  stepOffsetPx: number;
  photoMs: number;
  photoScaleFrom: number;
  checkMs: number;
  holdMs: number;
  /** Multiplica la duración de una vuelta del giro de carga; nunca se detiene. */
  spinSlowFactor: number;
}

const NORMAL: MotionTiming = {
  stepMs: 280,
  stepOffsetPx: 16,
  photoMs: 220,
  photoScaleFrom: 0.96,
  checkMs: 420,
  holdMs: 1400,
  spinSlowFactor: 1,
};

const REDUCED: MotionTiming = {
  stepMs: 1,
  stepOffsetPx: 0,
  photoMs: 1,
  photoScaleFrom: 1,
  checkMs: 1,
  holdMs: 1400,
  spinSlowFactor: 2,
};

export function motionTiming(reduced: boolean): MotionTiming {
  return { ...(reduced ? REDUCED : NORMAL) };
}

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  try {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return Boolean(window.matchMedia(REDUCED_MOTION_QUERY)?.matches);
  } catch {
    return false;
  }
}

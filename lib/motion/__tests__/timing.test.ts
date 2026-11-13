import { describe, it, expect, afterEach, vi } from "vitest";
import { motionTiming, prefersReducedMotion } from "../timing";

describe("motionTiming", () => {
  it("C19 (proxy): los valores de movimiento del spec", () => {
    expect(motionTiming(false)).toEqual({
      stepMs: 280,
      stepOffsetPx: 16,
      photoMs: 220,
      photoScaleFrom: 0.96,
      checkMs: 420,
      holdMs: 1400,
      spinSlowFactor: 1,
    });
  });

  it("C20 (proxy): con reducir movimiento no hay desplazamiento y el estado cambia", () => {
    const t = motionTiming(true);
    expect(t.stepOffsetPx).toBe(0);
    expect(t.photoScaleFrom).toBe(1);
    expect(t.stepMs).toBe(1);
    expect(t.photoMs).toBe(1);
    expect(t.checkMs).toBe(1);
    expect(t.holdMs).toBe(1400);
    expect(t.spinSlowFactor).toBe(2);
  });
});

describe("prefersReducedMotion", () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it("C20 (hook): matchMedia con matches true da true", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    expect(prefersReducedMotion()).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  it("C20 (hook): si matchMedia lanza, da false", () => {
    window.matchMedia = vi.fn(() => {
      throw new Error("no");
    }) as never;
    expect(prefersReducedMotion()).toBe(false);
  });

  it("C20 (hook): sin matchMedia da false", () => {
    // @ts-expect-error simulando entorno sin matchMedia
    window.matchMedia = undefined;
    expect(prefersReducedMotion()).toBe(false);
  });
});

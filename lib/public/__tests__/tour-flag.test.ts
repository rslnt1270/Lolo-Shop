import { afterEach, describe, expect, it, vi } from "vitest";
import { isTourEnabled } from "../tour-flag";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isTourEnabled", () => {
  it("sin bandera y sin zonas reales es false", () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
    expect(isTourEnabled([])).toBe(false);
    expect(isTourEnabled([{ kind: "virtual" }])).toBe(false);
  });

  it("con NEXT_PUBLIC_SALA_VIRTUAL=1 es true", () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "1");
    expect(isTourEnabled([])).toBe(true);
  });

  it("con una zona real es true", () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
    expect(isTourEnabled([{ kind: "real" }])).toBe(true);
  });
});

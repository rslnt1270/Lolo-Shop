import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

// Auditoría QA: demuestra la carrera de autoStart bajo StrictMode (efecto montar/desmontar/montar).
const h = vi.hoisted(() => ({ live: new Set<object>(), ctor: vi.fn(), cleared: vi.fn() }));

vi.mock("html5-qrcode", () => {
  class Html5Qrcode {
    constructor() { h.ctor(); }
    async start() { await Promise.resolve(); h.live.add(this); }
    async stop() { h.live.delete(this); }
    clear() { h.cleared(); }
    async applyVideoConstraints() {}
    getRunningTrackCapabilities() { return {}; }
  }
  return {
    Html5Qrcode,
    Html5QrcodeSupportedFormats: { QR_CODE: 0, CODE_39: 3, CODE_128: 5, EAN_13: 9, EAN_8: 10, UPC_A: 14, UPC_E: 15 },
  };
});

import { Scanner } from "../inventory/Scanner";

beforeEach(() => {
  vi.clearAllMocks();
  h.live.clear();
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
});

describe("Scanner autoStart bajo StrictMode", () => {
  it("crea una sola instancia de Html5Qrcode (sin cámara duplicada)", async () => {
    render(<StrictMode><Scanner onScan={vi.fn()} autoStart /></StrictMode>);
    await waitFor(() => expect(h.live.size).toBeGreaterThanOrEqual(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(h.live.size).toBe(1);
    expect(h.ctor).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

const h = vi.hoisted(() => ({
  onSuccess: null as null | ((t: string) => void),
  start: vi.fn(),
  stop: vi.fn(),
  clear: vi.fn(),
  apply: vi.fn(),
  caps: vi.fn(),
}));

vi.mock("html5-qrcode", () => {
  class Html5Qrcode {
    start = (...a: unknown[]) => { h.onSuccess = a[2] as (t: string) => void; return h.start(...a); };
    stop = () => h.stop();
    clear = () => h.clear();
    applyVideoConstraints = (c: unknown) => h.apply(c);
    getRunningTrackCapabilities = () => h.caps();
  }
  return {
    Html5Qrcode,
    Html5QrcodeSupportedFormats: { QR_CODE: 0, CODE_39: 3, CODE_128: 5, EAN_13: 9, EAN_8: 10, UPC_A: 14, UPC_E: 15 },
  };
});

import { Scanner, SAME_CODE_GAP_MS } from "../inventory/Scanner";

const CODE = "7501234567890";
const OTHER = "ABC-123";

beforeEach(() => {
  vi.clearAllMocks();
  h.start.mockResolvedValue(undefined);
  h.stop.mockResolvedValue(undefined);
  h.apply.mockResolvedValue(undefined);
  h.caps.mockReturnValue({});
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
  Object.defineProperty(navigator, "vibrate", { value: vi.fn(), configurable: true });
});

afterEach(() => { vi.useRealTimers(); });

async function mount(props: { continuous?: boolean }, onScan = vi.fn()) {
  render(<Scanner onScan={onScan} autoStart {...props} />);
  await waitFor(() => expect(screen.getByRole("button", { name: /cambiar cámara/i })).toBeInTheDocument());
  return onScan;
}
const decode = (t: string) => act(() => { h.onSuccess!(t); });

describe("Scanner modo continuo", () => {
  it("modo continuo: tras una lectura confirmada la cámara sigue activa y onScan recibe el código", async () => {
    const onScan = await mount({ continuous: true });
    decode(CODE);
    decode(CODE);
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith(CODE);
    expect(h.stop).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /cambiar cámara/i })).toBeInTheDocument();
  });

  it("modo continuo: una misma prenda que sigue en cuadro suma una sola vez", async () => {
    const onScan = await mount({ continuous: true });
    vi.useFakeTimers();
    for (let i = 0; i < 10; i++) {
      decode(CODE);
      vi.advanceTimersByTime(100);
    }
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it("modo continuo: la misma prenda presentada otra vez tras salir del cuadro suma de nuevo", async () => {
    const onScan = await mount({ continuous: true });
    vi.useFakeTimers();
    decode(CODE);
    decode(CODE);
    expect(onScan).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(SAME_CODE_GAP_MS + 1);
    decode(CODE);
    decode(CODE);
    expect(onScan).toHaveBeenCalledTimes(2);
  });

  it("modo continuo: un código distinto se emite sin esperar", async () => {
    const onScan = await mount({ continuous: true });
    decode(CODE);
    decode(CODE);
    decode(OTHER);
    decode(OTHER);
    expect(onScan.mock.calls.map((c) => c[0])).toEqual([CODE, OTHER]);
    // volver a la primera mientras sigue reciente no la suma otra vez
    decode(CODE);
    decode(CODE);
    expect(onScan).toHaveBeenCalledTimes(2);
  });

  it("sin continuous, tras una lectura la cámara se detiene (comportamiento de /escanear)", async () => {
    const onScan = await mount({});
    decode(CODE);
    decode(CODE);
    expect(onScan).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(h.stop).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("button", { name: /activar cámara/i })).toBeInTheDocument());
  });
});

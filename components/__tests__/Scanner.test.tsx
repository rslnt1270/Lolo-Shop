import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const h = vi.hoisted(() => ({
  onSuccess: null as null | ((t: string) => void),
  start: vi.fn(),
  stop: vi.fn(),
  clear: vi.fn(),
  apply: vi.fn(),
  caps: vi.fn(),
  ctor: vi.fn(),
}));

vi.mock("html5-qrcode", () => {
  class Html5Qrcode {
    constructor(...a: unknown[]) { h.ctor(...a); }
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

import { Scanner } from "../inventory/Scanner";

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

async function activate() {
  fireEvent.click(screen.getByRole("button", { name: /activar cámara/i }));
  await waitFor(() => expect(h.start).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByRole("button", { name: /cambiar cámara/i })).toBeInTheDocument());
}

describe("Scanner", () => {
  it("no inicia la cámara hasta el gesto y usa la configuración esperada", async () => {
    render(<Scanner onScan={vi.fn()} />);
    expect(h.start).not.toHaveBeenCalled();
    await activate();
    const [constraints, config] = h.start.mock.calls[0];
    expect(constraints).toEqual({ facingMode: "environment" });
    expect(config.disableFlip).toBe(true);
    expect(config.qrbox(400, 300)).toEqual({ width: 340, height: 135 });
    expect(h.ctor.mock.calls[0][1].experimentalFeatures.useBarCodeDetectorIfSupported).toBe(true);
    expect(h.ctor.mock.calls[0][1].formatsToSupport).toHaveLength(7);
  });

  it("exige dos lecturas iguales consecutivas y emite una sola vez", async () => {
    const onScan = vi.fn();
    render(<Scanner onScan={onScan} />);
    await activate();
    act(() => h.onSuccess!("ABC1"));
    expect(onScan).not.toHaveBeenCalled();
    act(() => h.onSuccess!("XYZ"));
    act(() => h.onSuccess!("ABC1"));
    expect(onScan).not.toHaveBeenCalled();
    act(() => h.onSuccess!("ABC1"));
    act(() => h.onSuccess!("ABC1"));
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith("ABC1");
    expect(navigator.vibrate).toHaveBeenCalledWith(80);
    await waitFor(() => expect(h.stop).toHaveBeenCalled());
    expect(h.clear).toHaveBeenCalled();
  });

  it("descarta códigos GTIN numéricos que no pasan validate", async () => {
    const onScan = vi.fn();
    const validate = vi.fn((c: string) => c === "7501031311309");
    render(<Scanner onScan={onScan} validate={validate} />);
    await activate();
    act(() => h.onSuccess!("7501031311300"));
    act(() => h.onSuccess!("7501031311300"));
    expect(onScan).not.toHaveBeenCalled();
    act(() => h.onSuccess!("7501031311309"));
    act(() => h.onSuccess!("7501031311309"));
    expect(onScan).toHaveBeenCalledWith("7501031311309");
  });

  it("muestra mensaje de HTTPS sin contexto seguro", async () => {
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    render(<Scanner onScan={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /activar cámara/i }));
    expect(await screen.findByText(/necesita HTTPS/i)).toBeInTheDocument();
    expect(h.start).not.toHaveBeenCalled();
  });

  it.each([
    ["NotAllowedError", /permite la cámara/i],
    ["NotFoundError", /no se encontró/i],
    ["NotReadableError", /ocupada/i],
  ])("traduce %s y permite reintentar", async (name, re) => {
    h.start.mockRejectedValueOnce(Object.assign(new Error("x"), { name }));
    render(<Scanner onScan={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /activar cámara/i }));
    expect(await screen.findByText(re)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    await waitFor(() => expect(h.start).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: /cambiar cámara/i })).toBeInTheDocument();
  });

  it("muestra linterna solo si hay torch y la activa", async () => {
    h.caps.mockReturnValue({ torch: true });
    render(<Scanner onScan={vi.fn()} />);
    await activate();
    fireEvent.click(await screen.findByRole("button", { name: /linterna/i }));
    await waitFor(() =>
      expect(h.apply).toHaveBeenCalledWith({ advanced: [{ torch: true }] })
    );
  });

  it("sin torch no hay botón de linterna; cambiar cámara reinicia con 'user'", async () => {
    render(<Scanner onScan={vi.fn()} />);
    await activate();
    expect(screen.queryByRole("button", { name: /linterna/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /cambiar cámara/i }));
    await waitFor(() => expect(h.start).toHaveBeenCalledTimes(2));
    expect(h.start.mock.calls[1][0]).toEqual({ facingMode: "user" });
  });

  it("al desmontar detiene y limpia", async () => {
    const { unmount } = render(<Scanner onScan={vi.fn()} />);
    await activate();
    unmount();
    await waitFor(() => expect(h.stop).toHaveBeenCalled());
    expect(h.clear).toHaveBeenCalled();
  });
});

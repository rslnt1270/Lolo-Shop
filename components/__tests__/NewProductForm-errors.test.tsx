import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const createProductAction = vi.fn();
const uploadProductImageAction = vi.fn();
vi.mock("@/lib/actions", () => ({
  createProductAction: (...a: unknown[]) => createProductAction(...a),
  uploadProductImageAction: (...a: unknown[]) => uploadProductImageAction(...a),
}));
vi.mock("../products/ProductPhotoCapture", () => ({
  ProductPhotoCapture: ({ onCapture, onBusyChange }: { onCapture: (f: File) => void; onBusyChange?: (b: boolean) => void }) => (
    <><button type="button" onClick={() => onBusyChange?.(true)}>foto-ocupada</button><button type="button" onClick={() => onBusyChange?.(false)}>foto-lista</button><button type="button" onClick={() => onCapture(new File(["x"], "p.jpg", { type: "image/jpeg" }))}>tomar-foto</button></>
  ),
}));

import { NewProductForm } from "../products/NewProductForm";

function submitValid(onSuccess = vi.fn(), onDuplicate?: (id: string) => void) {
  render(<NewProductForm scannedCode="750123" locationId="loc-1" onSuccess={onSuccess} onCancel={vi.fn()} onDuplicate={onDuplicate} />);
  fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Gorra" } });
  fireEvent.change(screen.getByLabelText(/marca/i), { target: { value: "Lolo" } });
  fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "99" } });
  fireEvent.change(screen.getByLabelText(/categor/i), { target: { value: "Accesorios" } });
  fireEvent.click(screen.getByRole("button", { name: /dar de alta/i }));
  return onSuccess;
}

describe("NewProductForm: errores del servidor", () => {
  beforeEach(() => { createProductAction.mockReset(); uploadProductImageAction.mockReset(); vi.spyOn(console, "error").mockImplementation(() => {}); });

  it("muestra el código en solo lectura y lo envía como barcode", async () => {
    createProductAction.mockResolvedValue({ ok: true, product: { imageUrl: null }, variantId: "v", sku: "750123" });
    submitValid();
    await waitFor(() => expect(createProductAction).toHaveBeenCalled());
    expect(screen.getByTestId("codigo-escaneado").textContent).toBe("750123");
    expect(createProductAction.mock.calls[0][0]).toMatchObject({ barcode: "750123", noBarcode: false, locationId: "loc-1" });
    expect(createProductAction.mock.calls[0][0]).not.toHaveProperty("sku");
  });

  it("código duplicado muestra el mensaje del servidor y ofrece abrir el producto existente", async () => {
    createProductAction.mockResolvedValue({
      ok: false, code: "DUPLICATE", existingVariantId: "v7",
      message: "Ese código ya está registrado: «Gorra». Abre el producto para sumar piezas.",
    });
    const onDuplicate = vi.fn();
    const onSuccess = submitValid(vi.fn(), onDuplicate);
    expect(await screen.findByText(/ya está registrado/i)).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /registrar entrada/i }));
    expect(onDuplicate).toHaveBeenCalledWith("v7");
  });

  it("el error del servidor (p. ej. FORBIDDEN) llega al usuario tal cual", async () => {
    createProductAction.mockResolvedValue({
      ok: false, code: "FORBIDDEN",
      message: "No autorizado: solo puedes dar de alta productos en tu tienda asignada.",
    });
    submitValid();
    expect(await screen.findByText(/tu tienda asignada/i)).toBeTruthy();
  });

  it("si la acción lanza, no deja la pantalla colgada", async () => {
    createProductAction.mockRejectedValue(new Error("boom"));
    const onSuccess = submitValid();
    expect(await screen.findByText(/no se pudo dar de alta/i)).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("si la foto falla, da de alta igual sin imageUrl y avisa 'SIN foto'", async () => {
    uploadProductImageAction.mockResolvedValue({ ok: false, message: "Falta el token del almacén" });
    createProductAction.mockResolvedValue({ ok: true, product: { imageUrl: null }, variantId: "v", sku: "750123" });
    const onSuccess = vi.fn();
    render(<NewProductForm scannedCode="750123" locationId="loc-1" onSuccess={onSuccess} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("tomar-foto"));
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Gorra" } });
    fireEvent.change(screen.getByLabelText(/marca/i), { target: { value: "Lolo" } });
    fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "99" } });
    fireEvent.change(screen.getByLabelText(/categor/i), { target: { value: "Accesorios" } });
    fireEvent.click(screen.getByRole("button", { name: /dar de alta/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0][0].message).toMatch(/Dado de alta SIN foto: Falta el token del almacén\. Agrégala desde \/productos/);
    expect(createProductAction.mock.calls[0][0].imageUrl).toBeNull();
  });

  it("deshabilita el alta mientras la foto se procesa", () => {
    render(<NewProductForm scannedCode="750123" locationId="loc-1" onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("foto-ocupada"));
    const btn = screen.getByRole("button", { name: /procesando foto/i });
    expect(btn).toBeDisabled();
    fireEvent.click(screen.getByText("foto-lista"));
    expect(screen.getByRole("button", { name: /dar de alta/i })).toBeEnabled();
  });

  it("no duplica el punto cuando el mensaje de foto ya termina en punto", async () => {
    uploadProductImageAction.mockResolvedValue({ ok: false, message: "Avisa al administrador." });
    createProductAction.mockResolvedValue({ ok: true, product: { imageUrl: null }, variantId: "v", sku: "750123" });
    const onSuccess = vi.fn();
    render(<NewProductForm scannedCode="750123" locationId="loc-1" onSuccess={onSuccess} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("tomar-foto"));
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Gorra" } });
    fireEvent.change(screen.getByLabelText(/marca/i), { target: { value: "Lolo" } });
    fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "99" } });
    fireEvent.change(screen.getByLabelText(/categor/i), { target: { value: "Accesorios" } });
    fireEvent.click(screen.getByRole("button", { name: /dar de alta/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0][0].message).not.toMatch(/\.\./);
  });
});

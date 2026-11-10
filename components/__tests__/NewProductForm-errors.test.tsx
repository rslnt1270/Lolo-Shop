import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const createProductAction = vi.fn();
const uploadProductImageAction = vi.fn();
vi.mock("@/lib/actions", () => ({
  createProductAction: (...a: unknown[]) => createProductAction(...a),
  uploadProductImageAction: (...a: unknown[]) => uploadProductImageAction(...a),
}));
const listBrandsAction = vi.fn();
const createBrandAction = vi.fn();
const listDepartmentsAction = vi.fn();
vi.mock("@/lib/catalog/actions", () => ({
  listBrandsAction: (...a: unknown[]) => listBrandsAction(...a),
  createBrandAction: (...a: unknown[]) => createBrandAction(...a),
  listDepartmentsAction: (...a: unknown[]) => listDepartmentsAction(...a),
}));
vi.mock("../products/ProductPhotoCapture", () => ({
  ProductPhotoCapture: ({ onCapture, onBusyChange }: { onCapture: (f: File) => void; onBusyChange?: (b: boolean) => void }) => (
    <><button type="button" onClick={() => onBusyChange?.(true)}>foto-ocupada</button><button type="button" onClick={() => onBusyChange?.(false)}>foto-lista</button><button type="button" onClick={() => onCapture(new File(["x"], "p.jpg", { type: "image/jpeg" }))}>tomar-foto</button></>
  ),
}));

import { NewProductForm } from "../products/NewProductForm";

async function pickBrandAndDepartment() {
  fireEvent.change(screen.getByRole("combobox", { name: /marca/i }), { target: { value: "Lolo" } });
  fireEvent.mouseDown(await screen.findByRole("option", { name: "Lolo" }));
  await waitFor(() => expect(screen.getByRole("option", { name: "Dama", hidden: true })).toBeTruthy());
  fireEvent.change(screen.getByLabelText(/departamento/i), { target: { value: "d1" } });
}

async function submitValid(onSuccess = vi.fn(), onDuplicate?: (id: string) => void) {
  render(<NewProductForm scannedCode="750123" locationId="loc-1" onSuccess={onSuccess} onCancel={vi.fn()} onDuplicate={onDuplicate} />);
  fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Gorra" } });
  await pickBrandAndDepartment();
  fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "99" } });
  fireEvent.change(screen.getByLabelText(/categor/i), { target: { value: "Accesorios" } });
  fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));
  return onSuccess;
}

describe("NewProductForm: errores del servidor", () => {
  beforeEach(() => {
    listBrandsAction.mockReset().mockResolvedValue([{ id: "b1", name: "Lolo", slug: "lolo" }, { id: "b2", name: "Psycho Bunny", slug: "psycho-bunny" }]);
    listDepartmentsAction.mockReset().mockResolvedValue([{ id: "d1", slug: "dama", name: "Dama" }, { id: "d2", slug: "caballero", name: "Caballero" }]);
    createBrandAction.mockReset();
    createProductAction.mockReset(); uploadProductImageAction.mockReset(); vi.spyOn(console, "error").mockImplementation(() => {}); });

  it("muestra el código en solo lectura y lo envía como barcode", async () => {
    createProductAction.mockResolvedValue({ ok: true, product: { imageUrl: null }, variantId: "v", sku: "750123" });
    await submitValid();
    await waitFor(() => expect(createProductAction).toHaveBeenCalled());
    expect(screen.getByTestId("codigo-escaneado").textContent).toBe("750123");
    expect(createProductAction.mock.calls[0][0]).toMatchObject({ sizes: [{ barcode: "750123" }], locationId: "loc-1" });
    expect(createProductAction.mock.calls[0][0]).not.toHaveProperty("sku");
    expect(createProductAction.mock.calls[0][0].sizes[0]).not.toHaveProperty("sku");
  });

  it("código duplicado muestra el mensaje del servidor y ofrece abrir el producto existente", async () => {
    createProductAction.mockResolvedValue({
      ok: false, code: "DUPLICATE", existingVariantId: "v7",
      message: "Ese código ya está registrado: «Gorra». Abre el producto para sumar piezas.",
    });
    const onDuplicate = vi.fn();
    const onSuccess = await submitValid(vi.fn(), onDuplicate);
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
    await submitValid();
    expect(await screen.findByText(/tu tienda asignada/i)).toBeTruthy();
  });

  it("si la acción lanza, no deja la pantalla colgada", async () => {
    createProductAction.mockRejectedValue(new Error("boom"));
    const onSuccess = await submitValid();
    expect(await screen.findByText(/no se pudo dar de alta/i)).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("si la foto falla, da de alta igual sin imageUrl y avisa 'SIN foto'", async () => {
    uploadProductImageAction.mockResolvedValue({ ok: false, message: "Falta el token del almacén" });
    createProductAction.mockResolvedValue({ ok: true, product: { imageUrl: null }, variantId: "v", sku: "750123" });
    const onSuccess = vi.fn();
    render(<NewProductForm scannedCode="750123" locationId="loc-1" onSuccess={onSuccess} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Para catálogo" }));
    screen.getAllByText("tomar-foto").forEach((b) => fireEvent.click(b));
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Gorra" } });
    await pickBrandAndDepartment();
    fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "99" } });
    fireEvent.change(screen.getByLabelText(/categor/i), { target: { value: "Accesorios" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0][0].message).toMatch(/Dado de alta SIN fotos: Falta el token del almacén\. Agrégalas desde \/productos/);
    expect(createProductAction.mock.calls[0][0]).toMatchObject({ mode: "stock", imageUrl: null, backImageUrl: null });
  });

  it("deshabilita el alta mientras la foto se procesa", async () => {
    render(<NewProductForm scannedCode="750123" locationId="loc-1" onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Para catálogo" }));
    fireEvent.click(screen.getAllByText("tomar-foto")[0]);
    fireEvent.click(screen.getAllByText("tomar-foto")[1]);
    fireEvent.click(screen.getAllByText("foto-ocupada")[0]);
    const btn = screen.getByRole("button", { name: /procesando foto/i });
    expect(btn).toBeDisabled();
    fireEvent.click(screen.getAllByText("foto-lista")[0]);
    expect(screen.getByRole("button", { name: /guardar producto/i })).toBeEnabled();
  });

  it("no duplica el punto cuando el mensaje de foto ya termina en punto", async () => {
    uploadProductImageAction.mockResolvedValue({ ok: false, message: "Avisa al administrador." });
    createProductAction.mockResolvedValue({ ok: true, product: { imageUrl: null }, variantId: "v", sku: "750123" });
    const onSuccess = vi.fn();
    render(<NewProductForm scannedCode="750123" locationId="loc-1" onSuccess={onSuccess} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Para catálogo" }));
    screen.getAllByText("tomar-foto").forEach((b) => fireEvent.click(b));
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Gorra" } });
    await pickBrandAndDepartment();
    fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "99" } });
    fireEvent.change(screen.getByLabelText(/categor/i), { target: { value: "Accesorios" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0][0].message).not.toMatch(/\.\./);
  });

  it("listas del catálogo en null (sesión vencida): muestra el aviso con enlace, no selectores vacíos", async () => {
    listBrandsAction.mockReset().mockResolvedValue(null);
    listDepartmentsAction.mockReset().mockResolvedValue(null);
    render(<NewProductForm scannedCode="750123" locationId="loc-1" onSuccess={vi.fn()} onCancel={vi.fn()} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Tu sesión terminó. Vuelve a iniciar sesión.");
    expect(screen.getByRole("link", { name: /iniciar sesión/i })).toHaveAttribute("href", "/login");
  });
});

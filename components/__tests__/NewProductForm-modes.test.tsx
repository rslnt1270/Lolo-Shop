import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const createProductAction = vi.fn();
const uploadProductImageAction = vi.fn();
vi.mock("@/lib/actions", () => ({
  createProductAction: (...a: unknown[]) => createProductAction(...a),
  uploadProductImageAction: (...a: unknown[]) => uploadProductImageAction(...a),
}));
vi.mock("@/lib/catalog/actions", () => ({
  listBrandsAction: vi.fn().mockResolvedValue([{ id: "b1", name: "Lolo", slug: "lolo" }]),
  createBrandAction: vi.fn(),
  listDepartmentsAction: vi.fn().mockResolvedValue([{ id: "d1", slug: "dama", name: "Dama" }]),
  listProductTypesAction: async () => [{ id: "t1", slug: "playera", name: "Playeras", departmentIds: ["d1"] }],
}));
vi.mock("../products/ProductPhotoCapture", () => ({
  ProductPhotoCapture: ({ onCapture }: { onCapture: (f: File) => void }) => (
    <button type="button" onClick={() => onCapture(new File(["x"], "p.jpg", { type: "image/jpeg" }))}>capturar</button>
  ),
}));

import { NewProductForm } from "../products/NewProductForm";

async function fillRest() {
  fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Gorra" } });
  fireEvent.change(screen.getByRole("combobox", { name: /marca/i }), { target: { value: "Lolo" } });
  fireEvent.mouseDown(await screen.findByRole("option", { name: "Lolo" }));
  await waitFor(() => expect(screen.getByRole("option", { name: "Dama", hidden: true })).toBeTruthy());
  fireEvent.change(screen.getByLabelText(/departamento/i), { target: { value: "d1" } });
  fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "99" } });
  fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "t1" } });
}

const render1 = (props = {}) =>
  render(<NewProductForm scannedCode="750123" locationId="loc-1" onSuccess={vi.fn()} onCancel={vi.fn()} {...props} />);

describe("NewProductForm: dos modos de alta", () => {
  beforeEach(() => {
    createProductAction.mockReset().mockResolvedValue({ ok: true, product: { imageUrl: null }, variantId: "v", sku: "S" });
    uploadProductImageAction.mockReset();
  });

  it("ofrece el selector Solo stock / Para catálogo, con Solo stock por defecto", () => {
    render1();
    expect(screen.getByRole("radio", { name: "Solo stock" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Para catálogo" })).not.toBeChecked();
  });

  it("en Solo stock no hay capturas y explica que no aparece en el catálogo", () => {
    render1();
    expect(screen.queryByText("capturar")).toBeNull();
    expect(
      screen.getByText("Se registra en inventario; no aparece en el catálogo hasta agregar las dos fotos."),
    ).toBeInTheDocument();
  });

  it("el campo Descripción está en los dos modos", () => {
    render1();
    expect(screen.getByLabelText(/descripción/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Para catálogo" }));
    expect(screen.getByLabelText(/descripción/i)).toBeInTheDocument();
  });

  it("en Para catálogo aparecen las dos capturas y el alta se deshabilita hasta tener las dos", () => {
    render1();
    fireEvent.click(screen.getByRole("radio", { name: "Para catálogo" }));
    expect(screen.getByText("Foto de frente")).toBeInTheDocument();
    expect(screen.getByText("Foto de atrás")).toBeInTheDocument();
    const alta = screen.getByRole("button", { name: /guardar producto/i });
    expect(alta).toBeDisabled();
    const [front, back] = screen.getAllByText("capturar");
    fireEvent.click(front);
    expect(alta).toBeDisabled();
    fireEvent.click(back);
    expect(alta).toBeEnabled();
  });

  it("en Para catálogo sube las dos fotos y envía mode, imageUrl, backImageUrl y descripción", async () => {
    uploadProductImageAction
      .mockResolvedValueOnce({ ok: true, url: "https://x.public.blob.vercel-storage.com/productos/f.jpg" })
      .mockResolvedValueOnce({ ok: true, url: "https://x.public.blob.vercel-storage.com/productos/b.jpg" });
    render1();
    fireEvent.click(screen.getByRole("radio", { name: "Para catálogo" }));
    await fillRest();
    fireEvent.change(screen.getByLabelText(/descripción/i), { target: { value: "Algodón" } });
    screen.getAllByText("capturar").forEach((b) => fireEvent.click(b));
    fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));
    await waitFor(() => expect(createProductAction).toHaveBeenCalled());
    expect(createProductAction.mock.calls[0][0]).toMatchObject({
      mode: "catalog",
      description: "Algodón",
      imageUrl: "https://x.public.blob.vercel-storage.com/productos/f.jpg",
      backImageUrl: "https://x.public.blob.vercel-storage.com/productos/b.jpg",
    });
  });

  it("en Solo stock da de alta sin fotos", async () => {
    render1();
    await fillRest();
    fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));
    await waitFor(() => expect(createProductAction).toHaveBeenCalled());
    expect(createProductAction.mock.calls[0][0]).toMatchObject({ mode: "stock", imageUrl: null, backImageUrl: null });
    expect(uploadProductImageAction).not.toHaveBeenCalled();
  });

  it("avisa el cambio de modo y arranca con el modo recordado", () => {
    const onModeChange = vi.fn();
    render1({ initialMode: "catalog", onModeChange });
    expect(screen.getByRole("radio", { name: "Para catálogo" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Solo stock" }));
    expect(onModeChange).toHaveBeenCalledWith("stock");
  });

  it("el botón deshabilitado por fotos faltantes enlaza la explicación en una región en vivo", () => {
    render1();
    fireEvent.click(screen.getByRole("radio", { name: "Para catálogo" }));
    const submit = screen.getByRole("button", { name: "Guardar producto" });
    expect(submit).toBeDisabled();
    const help = document.getElementById(submit.getAttribute("aria-describedby") ?? "none");
    expect(help).toHaveTextContent("Para el catálogo se necesitan las dos fotos");
    expect(help).toHaveAttribute("aria-live", "polite");
  });

  it('"(opcional)" no usa text-gray-400', () => {
    render1();
    for (const el of screen.getAllByText("(opcional)")) expect(el.className).not.toMatch(/gray-400/);
  });
});

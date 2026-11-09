import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchProductsAction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions", () => ({
  fetchProductsAction,
  updateProductImageAction: vi.fn().mockResolvedValue(undefined),
  uploadProductImageAction: vi.fn(),
  setProductBackImageAction: vi.fn(),
}));
vi.mock("../products/ProductPhotoCapture", () => ({
  ProductPhotoCapture: ({ onCapture }: { onCapture: (f: File) => void }) => (
    <button type="button" onClick={() => onCapture(new File(["x"], "p.jpg", { type: "image/jpeg" }))}>capturar</button>
  ),
}));

import ProductosPage from "@/app/productos/page";

const base = { id: "p1", title: "Gorra", category: "Accesorios", brand: "Lolo", publicCode: "K7Q2M", variants: [] };

describe("/productos: fotos de frente y atrás", () => {
  it("un producto de solo stock ofrece agregar las dos fotos", async () => {
    fetchProductsAction.mockResolvedValue([{ ...base, imageUrl: null, backImageUrl: null }]);
    render(<ProductosPage />);
    expect(await screen.findByRole("button", { name: "Agregar foto de frente de Gorra" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar foto de atrás de Gorra" })).toBeInTheDocument();
  });

  it("con las dos fotos ofrece cambiarlas", async () => {
    fetchProductsAction.mockResolvedValue([{ ...base, imageUrl: "https://a/f.jpg", backImageUrl: "https://a/b.jpg" }]);
    render(<ProductosPage />);
    expect(await screen.findByRole("button", { name: "Cambiar foto de frente de Gorra" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar foto de atrás de Gorra" })).toBeInTheDocument();
  });

  it.each([
    [{ imageUrl: null, backImageUrl: null }, "Faltan las dos fotos para el catálogo"],
    [{ imageUrl: null, backImageUrl: "https://a/b.jpg" }, "Falta la foto de frente"],
    [{ imageUrl: "https://a/f.jpg", backImageUrl: null }, "Falta la foto de atrás"],
  ])("dice exactamente qué foto falta: %#", async (photos, copy) => {
    fetchProductsAction.mockResolvedValue([{ ...base, ...photos }]);
    render(<ProductosPage />);
    expect(await screen.findByText(copy)).toBeInTheDocument();
  });

  it("con las dos fotos no hay aviso de faltante", async () => {
    fetchProductsAction.mockResolvedValue([{ ...base, imageUrl: "https://a/f.jpg", backImageUrl: "https://a/b.jpg" }]);
    render(<ProductosPage />);
    await screen.findByRole("button", { name: "Cambiar foto de frente de Gorra" });
    expect(screen.queryByText(/falta/i)).toBeNull();
  });

  it("Cancelar mide al menos 44 px y el aviso de éxito sigue visible en una región en vivo", async () => {
    fetchProductsAction.mockResolvedValue([{ ...base, imageUrl: null, backImageUrl: null }]);
    render(<ProductosPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Agregar foto de frente de Gorra" }));
    expect(screen.getByRole("button", { name: "Cancelar" }).className).toMatch(/min-h-\[44px\]/);
    fireEvent.click(screen.getByText("capturar"));
    await waitFor(() => expect(screen.getAllByRole("status")[0]).toHaveTextContent("Foto de frente actualizada."));
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Foto de frente actualizada.");
  });
});

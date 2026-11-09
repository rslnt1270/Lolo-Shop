import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const fetchProductsAction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions", () => ({
  fetchProductsAction,
  updateProductImageAction: vi.fn(),
  uploadProductImageAction: vi.fn(),
  setProductBackImageAction: vi.fn(),
}));
vi.mock("../products/ProductPhotoCapture", () => ({ ProductPhotoCapture: () => null }));

import ProductosPage from "@/app/productos/page";

const base = { id: "p1", title: "Gorra", category: "Accesorios", brand: "Lolo", publicCode: "K7Q2M", variants: [] };

describe("/productos: fotos de frente y atrás", () => {
  it("un producto de solo stock ofrece agregar las dos fotos", async () => {
    fetchProductsAction.mockResolvedValue([{ ...base, imageUrl: null, backImageUrl: null }]);
    render(<ProductosPage />);
    expect(await screen.findByRole("button", { name: "Agregar foto de frente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar foto de atrás" })).toBeInTheDocument();
  });

  it("con las dos fotos ofrece cambiarlas", async () => {
    fetchProductsAction.mockResolvedValue([{ ...base, imageUrl: "https://a/f.jpg", backImageUrl: "https://a/b.jpg" }]);
    render(<ProductosPage />);
    expect(await screen.findByRole("button", { name: "Cambiar foto de frente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar foto de atrás" })).toBeInTheDocument();
  });
});

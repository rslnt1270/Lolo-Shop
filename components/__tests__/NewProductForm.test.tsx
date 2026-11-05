import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const createProductAction = vi.fn();
const uploadProductImageAction = vi.fn();

vi.mock("@/lib/actions", () => ({
  createProductAction: (...args: unknown[]) => createProductAction(...args),
  uploadProductImageAction: (...args: unknown[]) => uploadProductImageAction(...args),
}));

vi.mock("../products/ProductPhotoCapture", () => ({
  ProductPhotoCapture: () => <div data-testid="photo-capture" />,
}));

import { NewProductForm } from "../products/NewProductForm";

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Playera Básica" } });
  fireEvent.change(screen.getByLabelText(/marca/i), { target: { value: "LoloShop" } });
  fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "299" } });
}

describe("NewProductForm", () => {
  beforeEach(() => {
    createProductAction.mockReset().mockResolvedValue({ ok: true, product: { imageUrl: null }, variantId: "v", sku: "S" });
    uploadProductImageAction.mockReset();
  });

  it("envía categoría y stock inicial 0 por defecto", async () => {
    const onSuccess = vi.fn();
    render(<NewProductForm scannedCode="750100" locationId="loc-1" onSuccess={onSuccess} onCancel={vi.fn()} />);

    fillRequired();
    fireEvent.change(screen.getByLabelText(/categoría/i), { target: { value: "Playeras" } });
    fireEvent.click(screen.getByRole("button", { name: /dar de alta/i }));

    await waitFor(() =>
      expect(createProductAction).toHaveBeenCalledWith(
        expect.objectContaining({ barcode: "750100", category: "Playeras", initialStock: 0, locationId: "loc-1" }),
      ),
    );
    expect(onSuccess).toHaveBeenCalled();
  });

  it("no envía sin categoría y muestra el aviso", async () => {
    render(<NewProductForm scannedCode="750100" locationId="loc-1" onSuccess={vi.fn()} onCancel={vi.fn()} />);

    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: /dar de alta/i }));

    expect(await screen.findByText("Elige una categoría válida.")).toBeInTheDocument();
    expect(createProductAction).not.toHaveBeenCalled();
  });

  it("envía el stock inicial contado", async () => {
    render(<NewProductForm scannedCode="750100" locationId="loc-1" onSuccess={vi.fn()} onCancel={vi.fn()} />);

    fillRequired();
    fireEvent.change(screen.getByLabelText(/categoría/i), { target: { value: "Hoodies" } });
    fireEvent.change(screen.getByLabelText(/stock inicial/i), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /dar de alta/i }));

    await waitFor(() =>
      expect(createProductAction).toHaveBeenCalledWith(expect.objectContaining({ category: "Hoodies", initialStock: 4 })),
    );
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const createProductAction = vi.fn();
const uploadProductImageAction = vi.fn();

vi.mock("@/lib/actions", () => ({
  createProductAction: (...args: unknown[]) => createProductAction(...args),
  uploadProductImageAction: (...args: unknown[]) => uploadProductImageAction(...args),
}));

const listBrandsAction = vi.fn();
const createBrandAction = vi.fn();
const listDepartmentsAction = vi.fn();
vi.mock("@/lib/catalog/actions", () => ({
  listBrandsAction: (...a: unknown[]) => listBrandsAction(...a),
  createBrandAction: (...a: unknown[]) => createBrandAction(...a),
  listDepartmentsAction: (...a: unknown[]) => listDepartmentsAction(...a),
  listProductTypesAction: () => Promise.resolve([{ id: "t1", slug: "playera", name: "Playeras", departmentIds: ["d1"] }]),
}));

vi.mock("../products/ProductPhotoCapture", () => ({
  ProductPhotoCapture: () => <div data-testid="photo-capture" />,
}));

import { NewProductForm } from "../products/NewProductForm";

async function fillRequired(withDepartment = true) {
  fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Playera Básica" } });
  fireEvent.change(screen.getByLabelText(/descripción/i), { target: { value: "Algodón suave" } });
  const combo = screen.getByRole("combobox", { name: /marca/i });
  fireEvent.change(combo, { target: { value: "Lolo" } });
  fireEvent.mouseDown(await screen.findByRole("option", { name: "Lolo" }));
  fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "299" } });
  if (withDepartment) {
    await screen.findByRole("option", { name: "Dama" });
    fireEvent.change(screen.getByLabelText(/departamento/i), { target: { value: "d1" } });
  }
}

describe("NewProductForm", () => {
  beforeEach(() => {
    createProductAction.mockReset().mockResolvedValue({ ok: true, product: { imageUrl: null }, variantId: "v", sku: "S" });
    uploadProductImageAction.mockReset();
    listBrandsAction.mockReset().mockResolvedValue([{ id: "b1", name: "Lolo", slug: "lolo" }, { id: "b2", name: "Psycho Bunny", slug: "psycho-bunny" }]);
    listDepartmentsAction.mockReset().mockResolvedValue([{ id: "d1", slug: "dama", name: "Dama" }]);
    createBrandAction.mockReset();
  });

  it("envía tipo y stock inicial 0 por defecto", async () => {
    const onSuccess = vi.fn();
    render(<NewProductForm scannedCode="750100" locationId="loc-1" onSuccess={onSuccess} onCancel={vi.fn()} />);

    await fillRequired();
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "t1" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));

    await waitFor(() =>
      expect(createProductAction).toHaveBeenCalledWith(
        expect.objectContaining({
          productTypeId: "t1", locationId: "loc-1", brandId: "b1", departmentId: "d1",
          sizes: [expect.objectContaining({ barcode: "750100", initialStock: 0 })],
        }),
      ),
    );
    expect(onSuccess).toHaveBeenCalled();
  });

  it("no envía sin tipo y muestra el aviso", async () => {
    render(<NewProductForm scannedCode="750100" locationId="loc-1" onSuccess={vi.fn()} onCancel={vi.fn()} />);

    await fillRequired();
    fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));

    expect(await screen.findByText("Elige el tipo.")).toBeInTheDocument();
    expect(createProductAction).not.toHaveBeenCalled();
  });

  it("envía el stock inicial contado", async () => {
    render(<NewProductForm scannedCode="750100" locationId="loc-1" onSuccess={vi.fn()} onCancel={vi.fn()} />);

    await fillRequired();
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "t1" } });
    fireEvent.change(screen.getByLabelText(/piezas/i), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));

    await waitFor(() =>
      expect(createProductAction).toHaveBeenCalledWith(
        expect.objectContaining({ productTypeId: "t1", sizes: [expect.objectContaining({ initialStock: 4 })] }),
      ),
    );
  });

  it("departamento obligatorio: sin elegirlo muestra «Elige el departamento.»", async () => {
    render(<NewProductForm scannedCode="750100" locationId="loc-1" onSuccess={vi.fn()} onCancel={vi.fn()} />);
    await fillRequired(false);
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "t1" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));
    expect(await screen.findByText("Elige el departamento.")).toBeInTheDocument();
    expect(createProductAction).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/departamento/i)).toHaveAttribute("aria-required", "true");
  });

  it("combo de marca: ofrece «Crear «…»» y crea la marca nueva", async () => {
    createBrandAction.mockResolvedValue({ ok: true, brand: { id: "b9", name: "Nueva Marca", slug: "nueva-marca" } });
    render(<NewProductForm scannedCode="750100" locationId="loc-1" onSuccess={vi.fn()} onCancel={vi.fn()} />);
    const combo = screen.getByRole("combobox", { name: /marca/i });
    expect(combo).toHaveAttribute("aria-expanded", "false");
    fireEvent.change(combo, { target: { value: "Nueva Marca" } });
    expect(combo).toHaveAttribute("aria-expanded", "true");
    const create = await screen.findByRole("option", { name: "Crear «Nueva Marca»" });
    fireEvent.mouseDown(create);
    await waitFor(() => expect(createBrandAction).toHaveBeenCalledWith("Nueva Marca"));
    await waitFor(() => expect(combo).toHaveValue("Nueva Marca"));
  });

  it("combo de marca: no ofrece crear si ya existe y se opera con teclado", async () => {
    render(<NewProductForm scannedCode="750100" locationId="loc-1" onSuccess={vi.fn()} onCancel={vi.fn()} />);
    const combo = screen.getByRole("combobox", { name: /marca/i });
    await waitFor(() => expect(listBrandsAction).toHaveBeenCalled());
    fireEvent.change(combo, { target: { value: "psycho" } });
    const list = await screen.findByRole("listbox");
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(["Psycho Bunny", "Crear «psycho»"]);
    fireEvent.change(combo, { target: { value: "Psycho Bunny" } });
    expect(screen.queryByRole("option", { name: /Crear/ })).toBeNull();
    expect(combo).toHaveAttribute("aria-activedescendant");
    fireEvent.keyDown(combo, { key: "Enter" });
    await waitFor(() => expect(combo).toHaveAttribute("aria-expanded", "false"));
    expect(combo).toHaveValue("Psycho Bunny");
    fireEvent.change(combo, { target: { value: "Psy" } });
    fireEvent.keyDown(combo, { key: "Escape" });
    expect(combo).toHaveAttribute("aria-expanded", "false");
  });

  it("con un texto que no es una marca existente no se envía", async () => {
    render(<NewProductForm scannedCode="750100" locationId="loc-1" onSuccess={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(listBrandsAction).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "X" } });
    fireEvent.change(screen.getByRole("combobox", { name: /marca/i }), { target: { value: "Lol" } });
    fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));
    expect(await screen.findByText("Elige la marca.")).toBeInTheDocument();
    expect(createProductAction).not.toHaveBeenCalled();
  });

  it.each(["Lolo", "  lolo ", "LOLO"])(
    "escribir el nombre exacto de una marca existente (%s) la elige sin tocar la lista",
    async (typed) => {
      render(<NewProductForm scannedCode="750100" locationId="loc-1" onSuccess={vi.fn()} onCancel={vi.fn()} />);
      await screen.findByRole("option", { name: "Dama" });
      fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Playera" } });
      fireEvent.change(screen.getByLabelText(/descripción/i), { target: { value: "Algodón suave" } });
      const combo = screen.getByRole("combobox", { name: /marca/i });
      fireEvent.change(combo, { target: { value: typed } });
      fireEvent.blur(combo);
      expect(combo).toHaveValue("Lolo");
      fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "299" } });
      fireEvent.change(screen.getByLabelText(/departamento/i), { target: { value: "d1" } });
      fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "t1" } });
      fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));
      await waitFor(() => expect(createProductAction).toHaveBeenCalledWith(expect.objectContaining({ brandId: "b1" })));
      expect(screen.queryByText("Elige la marca.")).not.toBeInTheDocument();
    },
  );

  it("si la marca termina de cargar después de escribir, al salir del campo se elige", async () => {
    let resolve!: (v: unknown) => void;
    listBrandsAction.mockReset().mockReturnValue(new Promise((r) => (resolve = r)));
    render(<NewProductForm scannedCode="750100" locationId="loc-1" onSuccess={vi.fn()} onCancel={vi.fn()} />);
    const combo = screen.getByRole("combobox", { name: /marca/i });
    fireEvent.change(combo, { target: { value: "psycho bunny" } });
    resolve([{ id: "b2", name: "Psycho Bunny", slug: "psycho-bunny" }]);
    // Marcas y departamentos llegan juntos.
    await screen.findByRole("option", { name: "Dama" });
    fireEvent.blur(combo);
    expect(combo).toHaveValue("Psycho Bunny");
  });
});

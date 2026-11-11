import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const lookup = vi.fn();
const record = vi.fn();
const createProductAction = vi.fn();
const addVariantAction = vi.fn();
const searchProductsAction = vi.fn();
const fetchLocations = vi.fn();
let sessionUser: Record<string, unknown> = { id: "u1", role: "collaborator", locationId: "loc-1" };

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: sessionUser } }),
}));
vi.mock("@/lib/actions", () => ({
  lookupCodeAction: (...a: unknown[]) => lookup(...a),
  recordStockMovementAction: (...a: unknown[]) => record(...a),
  createProductAction: (...a: unknown[]) => createProductAction(...a),
  addVariantAction: (...a: unknown[]) => addVariantAction(...a),
  searchProductsAction: (...a: unknown[]) => searchProductsAction(...a),
  fetchLocationsAction: (...a: unknown[]) => fetchLocations(...a),
  uploadProductImageAction: vi.fn(),
}));
vi.mock("@/lib/catalog/actions", () => ({
  listBrandsAction: async () => [{ id: "b1", name: "Lolo", slug: "lolo" }],
  listDepartmentsAction: async () => [{ id: "d1", slug: "dama", name: "Dama" }],
  createBrandAction: vi.fn(),
}));
vi.mock("@/components/inventory/Scanner", () => ({
  Scanner: ({ onScan }: { onScan: (c: string) => void }) => (
    <div data-testid="scanner">
      {/* type="button" como el Scanner real (sus botones no envían formularios). */}
      <button type="button" onClick={() => onScan("750999")}>simular-escaneo</button>
      <button type="button" onClick={() => onScan("ETQ-L")}>simular-escaneo-otra</button>
    </div>
  ),
}));
vi.mock("@/components/products/ProductPhotoCapture", () => ({ ProductPhotoCapture: () => <div /> }));

import EscanearPage from "@/app/escanear/page";
import { NewProductForm } from "../products/NewProductForm";

const hit = {
  productId: "p1", title: "Playera Logo", brand: "Lolo", publicCode: "K7Q2M",
  imageUrl: "https://x.public.blob.vercel-storage.com/productos/f.jpg", sizes: ["S", "M"],
};

async function fillProduct() {
  fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Gorra" } });
  fireEvent.change(screen.getByRole("combobox", { name: /marca/i }), { target: { value: "Lolo" } });
  fireEvent.mouseDown(await screen.findByRole("option", { name: "Lolo" }));
  await screen.findByRole("option", { name: "Dama" });
  fireEvent.change(screen.getByLabelText(/departamento/i), { target: { value: "d1" } });
  fireEvent.change(screen.getByLabelText(/categor/i), { target: { value: "Accesorios" } });
}

beforeEach(() => {
  [lookup, record, createProductAction, addVariantAction, searchProductsAction, fetchLocations].forEach((m) => m.mockReset());
  sessionUser = { id: "u1", role: "collaborator", locationId: "loc-1" };
  lookup.mockResolvedValue({ found: false, code: "750999" });
  searchProductsAction.mockResolvedValue([hit]);
  record.mockResolvedValue({ ok: true, available: 3, replayed: false });
  createProductAction.mockResolvedValue({ ok: true, product: { imageUrl: null, variants: [] }, variantId: "v9", sku: "LS-1" });
  addVariantAction.mockResolvedValue({ ok: true, product: { ...hit, id: "p1", variants: [] }, variantId: "v10", sku: "LS-2" });
});

describe("/escanear: código nuevo → ¿otra talla de un producto ya registrado?", () => {
  async function scanNew() {
    render(<EscanearPage />);
    fireEvent.click(screen.getByText("simular-escaneo"));
    return await screen.findByText("¿Es otra talla de un producto ya registrado?");
  }

  it("primero aparece la pregunta y el formulario no se muestra", async () => {
    await scanNew();
    expect(screen.getByPlaceholderText("Busca por título, marca o código público")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar producto/i })).toBeNull();
    expect(screen.queryByText("Tallas")).toBeNull();
  });

  it("buscar y elegir un resultado muestra el mini formulario y agrega la talla con el código escaneado", async () => {
    await scanNew();
    fireEvent.change(screen.getByPlaceholderText("Busca por título, marca o código público"), { target: { value: "playera" } });
    await waitFor(() => expect(searchProductsAction).toHaveBeenCalledWith("playera"));
    const result = await screen.findByRole("listitem");
    expect(within(result).getByText("Playera Logo")).toBeInTheDocument();
    expect(within(result).getByRole("img")).toHaveAttribute("src", hit.imageUrl);
    expect(within(result).getByText("S")).toBeInTheDocument();
    expect(within(result).getByText("M")).toBeInTheDocument();
    fireEvent.click(within(result).getByRole("button", { name: /agregar talla a playera logo/i }));

    expect(await screen.findByText("Tallas registradas:")).toBeInTheDocument();
    expect(screen.getByText("Código escaneado")).toBeInTheDocument();
    expect(screen.getByTestId("codigo-nueva-talla")).toHaveTextContent("750999");
    fireEvent.change(screen.getByLabelText(/^talla$/i), { target: { value: "l" } });
    fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "320" } });
    fireEvent.click(screen.getByRole("button", { name: "Sumar una pieza" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar talla" }));
    await waitFor(() =>
      expect(addVariantAction).toHaveBeenCalledWith({
        productId: "p1", size: "l", barcode: "750999", price: 320, initialStock: 2, locationId: "loc-1",
      }),
    );
    expect(await screen.findByText(/talla L agregada a playera logo/i)).toBeInTheDocument();
  });

  it("misma talla con otro código: avisa sin bloquear; el error del servidor se muestra tal cual", async () => {
    await scanNew();
    fireEvent.change(screen.getByPlaceholderText("Busca por título, marca o código público"), { target: { value: "playera" } });
    fireEvent.click(await screen.findByRole("button", { name: /agregar talla a playera logo/i }));
    fireEvent.change(await screen.findByLabelText(/^talla$/i), { target: { value: "m" } });
    expect(
      screen.getByText("Ya existe la talla M con otro código. Se guardará como otra etiqueta de la misma talla."),
    ).toBeInTheDocument();
    addVariantAction.mockResolvedValue({ ok: false, code: "INVALID", message: "Esa talla ya existe: suma piezas con Entrada" });
    fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar talla" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esa talla ya existe: suma piezas con Entrada");
  });

  it("«No, es un producto nuevo» muestra el formulario con la sección Tallas", async () => {
    await scanNew();
    fireEvent.click(screen.getByRole("button", { name: "No, es un producto nuevo" }));
    expect(await screen.findByText("Tallas")).toBeInTheDocument();
    expect(screen.getByTestId("codigo-escaneado")).toHaveTextContent("750999");
    expect(screen.getByRole("button", { name: /guardar producto/i })).toBeInTheDocument();
  });
});

describe("NewProductForm: sección Tallas", () => {
  const renderForm = (props = {}) =>
    render(<NewProductForm scannedCode="750100" locationId="loc-1" onSuccess={vi.fn()} onCancel={vi.fn()} {...props} />);

  it("«Agregar otra talla» reabre el escáner y la fila nueva copia el precio de la anterior", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "299" } });
    expect(screen.getByText("Abre el escáner y copia el precio de la talla anterior.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /agregar otra talla/i }));
    fireEvent.click(await screen.findByText("simular-escaneo-otra"));
    const prices = await screen.findAllByLabelText(/precio/i);
    expect(prices).toHaveLength(2);
    expect(prices[1]).toHaveValue(299);
    const codes = screen.getAllByTestId("codigo-escaneado").map((c) => c.textContent);
    expect(codes).toEqual(["750100", "ETQ-L"]);
    expect(screen.queryByTestId("scanner")).toBeNull();
  });

  it("una fila nueva puede ir «Sin código» y se envían todas las tallas", async () => {
    renderForm();
    await fillProduct();
    fireEvent.change(screen.getByLabelText(/^talla$/i), { target: { value: "M" } });
    fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "299" } });
    fireEvent.change(screen.getByLabelText(/piezas/i), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /agregar otra talla/i }));
    fireEvent.click(await screen.findByRole("button", { name: /prenda sin código/i }));
    const sizes = await screen.findAllByLabelText(/^talla$/i);
    fireEvent.change(sizes[1], { target: { value: "L" } });
    expect(screen.getByText("Sin código")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));
    await waitFor(() => expect(createProductAction).toHaveBeenCalled());
    expect(createProductAction.mock.calls[0][0].sizes).toEqual([
      { size: "M", barcode: "750100", price: 299, initialStock: 2 },
      { size: "L", barcode: null, price: 299, initialStock: 0 },
    ]);
  });

  it("con DUPLICATE marca la fila y ofrece «Sumar piezas en tu tienda» (restock en la tienda del usuario)", async () => {
    createProductAction.mockResolvedValue({
      ok: false, code: "DUPLICATE", existingVariantId: "v7", duplicateBarcode: "750100",
      message: "Este código ya está registrado en Gorra.",
    });
    renderForm();
    await fillProduct();
    fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "99" } });
    fireEvent.change(screen.getByLabelText(/piezas/i), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));
    expect(await screen.findByText("Este código ya está registrado en Gorra.")).toBeInTheDocument();
    // La cantidad que se va a sumar siempre está a la vista.
    fireEvent.click(screen.getByRole("button", { name: "Sumar 3 piezas en tu tienda" }));
    await waitFor(() =>
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ variantId: "v7", locationId: "loc-1", kind: "restock", quantity: 3 }),
      ),
    );
  });

  it("fila duplicada con 0 piezas: pide el número y no suma sin él", async () => {
    createProductAction.mockResolvedValue({
      ok: false, code: "DUPLICATE", existingVariantId: "v7", duplicateBarcode: "750100",
      message: "Este código ya está registrado en Gorra.",
    });
    const onStockAdded = vi.fn();
    renderForm({ onStockAdded });
    await fillProduct();
    fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));
    const qty = await screen.findByLabelText(/piezas a sumar/i);
    expect(qty).toHaveValue(null);
    fireEvent.click(screen.getByRole("button", { name: "Sumar piezas en tu tienda" }));
    expect(await screen.findByText(/escribe un número de piezas/i)).toBeInTheDocument();
    expect(record).not.toHaveBeenCalled();
    fireEvent.change(qty, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Sumar 2 piezas en tu tienda" }));
    await waitFor(() => expect(record).toHaveBeenCalledWith(expect.objectContaining({ variantId: "v7", quantity: 2 })));
    // Era la única fila: el alta termina.
    await waitFor(() => expect(onStockAdded).toHaveBeenCalledWith(3));
  });

  it("3 tallas y 1 duplicada: sumar quita solo esa fila, avisa y deja guardar las otras 2", async () => {
    createProductAction.mockResolvedValueOnce({
      ok: false, code: "DUPLICATE", existingVariantId: "v7", duplicateBarcode: "ETQ-L",
      message: "Este código ya está registrado en Gorra.",
    });
    const onStockAdded = vi.fn();
    const onSuccess = vi.fn();
    renderForm({ onStockAdded, onSuccess });
    await fillProduct();
    fireEvent.change(screen.getByLabelText(/^talla$/i), { target: { value: "S" } });
    fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: /agregar otra talla/i }));
    fireEvent.click(await screen.findByText("simular-escaneo-otra"));
    fireEvent.click(screen.getByRole("button", { name: /agregar otra talla/i }));
    fireEvent.click(await screen.findByRole("button", { name: /prenda sin código/i }));
    const sizes = await screen.findAllByLabelText(/^talla$/i);
    fireEvent.change(sizes[1], { target: { value: "M" } });
    fireEvent.change(sizes[2], { target: { value: "L" } });
    fireEvent.change(screen.getAllByLabelText(/^piezas$/i)[1], { target: { value: "2" } });

    fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Sumar 2 piezas en tu tienda" }));
    await waitFor(() => expect(record).toHaveBeenCalledWith(expect.objectContaining({ variantId: "v7", quantity: 2 })));

    await waitFor(() => expect(screen.getAllByLabelText(/precio/i)).toHaveLength(2));
    expect(screen.getAllByTestId("codigo-escaneado").map((c) => c.textContent)).toEqual(["750100"]);
    expect(screen.getByRole("status")).toHaveTextContent(/las otras 2 tallas aún no se guardan/i);
    expect(onStockAdded).not.toHaveBeenCalled();
    expect(createProductAction).toHaveBeenCalledTimes(1);

    createProductAction.mockResolvedValueOnce({ ok: true, product: { imageUrl: null, variants: [] }, variantId: "v9", sku: "LS-1" });
    fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(createProductAction).toHaveBeenCalledTimes(2);
    expect(createProductAction.mock.calls[1][0].sizes).toEqual([
      { size: "S", barcode: "750100", price: 99, initialStock: 0 },
      { size: "L", barcode: null, price: 99, initialStock: 0 },
    ]);
  });

  it("teclear el código de la talla nueva agrega la fila y NO guarda el alta", async () => {
    renderForm();
    await fillProduct();
    fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: /agregar otra talla/i }));
    const input = await screen.findByPlaceholderText("Escribe el código");
    fireEvent.change(input, { target: { value: "etq-x" } });
    fireEvent.click(screen.getByRole("button", { name: "Usar este código" }));
    // Un <form> anidado propagaba su submit y guardaba el alta completo.
    await new Promise((r) => setTimeout(r, 50));
    expect(createProductAction).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("codigo-escaneado").map((c) => c.textContent)).toEqual(["750100", "ETQ-X"]);
    fireEvent.click(screen.getByRole("button", { name: /agregar otra talla/i }));
    const again = await screen.findByPlaceholderText("Escribe el código");
    fireEvent.change(again, { target: { value: "etq-y" } });
    fireEvent.keyDown(again, { key: "Enter" });
    expect(screen.getAllByTestId("codigo-escaneado")).toHaveLength(3);
    expect(createProductAction).not.toHaveBeenCalled();
  });

  it("al llegar a 12 tallas «Agregar otra talla» se deshabilita", async () => {
    renderForm();
    for (let i = 0; i < 11; i++) {
      fireEvent.click(screen.getByRole("button", { name: /agregar otra talla/i }));
      fireEvent.click(await screen.findByRole("button", { name: /prenda sin código/i }));
    }
    expect(await screen.findAllByLabelText(/precio/i)).toHaveLength(12);
    expect(screen.getByRole("button", { name: /agregar otra talla/i })).toBeDisabled();
  });
});

describe("/escanear: código existente", () => {
  const product = {
    id: "p1", title: "Playera X", brand: "Lolo", category: "Playeras", imageUrl: null, publicCode: "K7Q2M",
    variants: [
      { id: "v1", title: "M", size: "M", color: "General", sku: "S1", barcode: "750999", price: 100, inventory: [{ locationId: "loc-1", available: 3 }] },
      { id: "v2", title: "L", size: "L", color: "General", sku: "S2", barcode: null, price: 100, inventory: [{ locationId: "loc-2", available: 5 }] },
      { id: "v3", title: "S", size: "S", color: "General", sku: "S3", barcode: null, price: 100, inventory: [{ locationId: "loc-1", available: 1 }], isActive: false },
    ],
  };

  it("la tarjeta muestra las tallas con las piezas de tu tienda, «Entrada» y «Agregar talla»", async () => {
    lookup.mockResolvedValue({ found: true, product, variantId: "v1" });
    render(<EscanearPage />);
    fireEvent.click(screen.getByText("simular-escaneo"));
    const list = await screen.findByRole("list", { name: /tallas en tu tienda/i });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["M: 3 pzas", "L: 0 pzas"]);
    expect(screen.getByRole("button", { name: /sumar .* en tu tienda/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Agregar talla" }));
    expect(await screen.findByText("Tallas registradas:")).toBeInTheDocument();
  });

  it("si el código no tiene piezas en tu tienda, ofrece «Sumar piezas en tu tienda»", async () => {
    lookup.mockResolvedValue({ found: true, product: { ...product, variants: [{ ...product.variants[1], barcode: "750999" }] }, variantId: "v2" });
    render(<EscanearPage />);
    fireEvent.click(screen.getByText("simular-escaneo"));
    expect(await screen.findByText("Esta prenda no está en tu tienda")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sumar 1 pieza en tu tienda" }));
    await waitFor(() =>
      expect(record).toHaveBeenCalledWith(expect.objectContaining({ variantId: "v2", locationId: "loc-1", kind: "restock", quantity: 1 })),
    );
  });
});

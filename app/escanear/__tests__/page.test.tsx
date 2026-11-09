import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const lookup = vi.fn();
const adjust = vi.fn();
const createProductAction = vi.fn();
const fetchLocations = vi.fn();
let sessionUser: Record<string, unknown> = { id: "u1", role: "collaborator", locationId: "loc-1" };

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: sessionUser } }),
}));
vi.mock("@/lib/actions", () => ({
  lookupCodeAction: (...a: unknown[]) => lookup(...a),
  adjustInventoryAction: (...a: unknown[]) => adjust(...a),
  createProductAction: (...a: unknown[]) => createProductAction(...a),
  fetchLocationsAction: (...a: unknown[]) => fetchLocations(...a),
  uploadProductImageAction: vi.fn(),
}));
vi.mock("@/lib/catalog/actions", () => ({
  listBrandsAction: async () => [{ id: "b1", name: "Lolo", slug: "lolo" }],
  listDepartmentsAction: async () => [{ id: "d1", slug: "dama", name: "Dama" }],
  createBrandAction: vi.fn(),
}));
vi.mock("@/lib/domain/barcode", () => ({ isValidGtin: () => true }));
vi.mock("@/components/inventory/Scanner", () => ({
  Scanner: ({ onScan }: { onScan: (c: string) => void }) => (
    <div data-testid="scanner"><button onClick={() => onScan("750999")}>simular-escaneo</button></div>
  ),
}));
vi.mock("@/components/products/ProductPhotoCapture", () => ({ ProductPhotoCapture: () => <div /> }));

import EscanearPage from "../page";

const existingProduct = {
  id: "p1", title: "Playera X", brand: "Lolo", category: "Playeras", imageUrl: null,
  variants: [{ id: "v1", title: "M", sku: "S", barcode: "750999", price: 100, inventory: [] }],
};

async function fillForm() {
  fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Gorra" } });
  fireEvent.change(screen.getByRole("combobox", { name: /marca/i }), { target: { value: "Lolo" } });
  fireEvent.mouseDown(await screen.findByRole("option", { name: "Lolo" }));
  await screen.findByRole("option", { name: "Dama" });
  fireEvent.change(screen.getByLabelText(/departamento/i), { target: { value: "d1" } });
  fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "50" } });
  fireEvent.change(screen.getByLabelText(/categor/i), { target: { value: "Accesorios" } });
  fireEvent.change(screen.getByLabelText(/stock inicial/i), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: /dar de alta/i }));
}

describe("/escanear: flujo de alta por lote", () => {
  beforeEach(() => {
    [lookup, adjust, createProductAction, fetchLocations].forEach((m) => m.mockReset());
    sessionUser = { id: "u1", role: "collaborator", locationId: "loc-1" };
    lookup.mockResolvedValue({ found: false, code: "750999" });
    createProductAction.mockResolvedValue({ ok: true, product: { imageUrl: null, variants: [] }, variantId: "v9", sku: "750999" });
    fetchLocations.mockResolvedValue([{ id: "loc-A", name: "Tienda A", type: "store" }, { id: "loc-B", name: "Bodega", type: "warehouse" }]);
  });

  it("código desconocido abre el alta con el código en solo lectura y tras guardar reactiva el escáner", async () => {
    render(<EscanearPage />);
    fireEvent.click(screen.getByText("simular-escaneo"));
    expect((await screen.findByTestId("codigo-escaneado")).textContent).toBe("750999");
    expect(screen.queryByTestId("scanner")).toBeNull();

    await fillForm();

    await waitFor(() => expect(screen.getByTestId("scanner")).toBeTruthy());
    expect(createProductAction.mock.calls[0][0]).toMatchObject({
      barcode: "750999", category: "Accesorios", initialStock: 4, locationId: "loc-1",
    });
    expect(screen.getByText(/1 alta en esta sesión/i)).toBeTruthy();
    expect(screen.getByText(/escanea la siguiente/i)).toBeTruthy();
    expect(screen.getByText(/SKU: 750999/)).toBeTruthy();
  });

  it("código existente NO abre el formulario de alta y permite registrar movimiento", async () => {
    lookup.mockResolvedValue({ found: true, product: existingProduct, variantId: "v1" });
    render(<EscanearPage />);
    fireEvent.click(screen.getByText("simular-escaneo"));
    expect(await screen.findByText("Playera X")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /dar de alta/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /registrar entrada/i }));
    await waitFor(() => expect(adjust).toHaveBeenCalledWith("v1", "loc-1", 1));
  });

  it("si la búsqueda del código falla, no deja la pantalla colgada sin aviso", async () => {
    lookup.mockResolvedValue({ found: false, code: "750999", error: "No se pudo buscar el código." });
    render(<EscanearPage />);
    fireEvent.click(screen.getByText("simular-escaneo"));
    expect(await screen.findByText(/no se pudo buscar/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeTruthy();
  });

  it("si lookupCodeAction lanza, también se avisa", async () => {
    lookup.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<EscanearPage />);
    fireEvent.click(screen.getByText("simular-escaneo"));
    expect(await screen.findByText(/no se pudo buscar/i)).toBeTruthy();
  });

  it("entrada manual busca el código igual que un escaneo", async () => {
    render(<EscanearPage />);
    fireEvent.change(screen.getByLabelText(/código del producto/i), { target: { value: "ABC-1" } });
    fireEvent.click(screen.getByRole("button", { name: /usar este código/i }));
    await waitFor(() => expect(lookup).toHaveBeenCalledWith("ABC-1"));
  });

  it("'Prenda sin código' abre el alta sin código y ofrece imprimir etiqueta", async () => {
    createProductAction.mockResolvedValue({ ok: true, product: { imageUrl: null, variants: [] }, variantId: "v9", sku: "LS-0001" });
    render(<EscanearPage />);
    fireEvent.click(screen.getByRole("button", { name: /prenda sin código/i }));
    expect(await screen.findByText(/se generará un sku interno/i)).toBeTruthy();
    await fillForm();
    expect(await screen.findByRole("link", { name: /imprimir etiqueta/i })).toHaveAttribute("href", "/etiquetas");
    expect(createProductAction.mock.calls[0][0]).toMatchObject({ noBarcode: true, barcode: null });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("owner puede dar de alta eligiendo tienda y se recuerda la elección", async () => {
    sessionUser = { id: "o1", role: "owner", locationId: null };
    render(<EscanearPage />);
    const sel = (await screen.findByLabelText(/^tienda$/i)) as HTMLSelectElement;
    await waitFor(() => expect(sel.value).toBe("loc-A"));
    fireEvent.change(sel, { target: { value: "loc-B" } });
    fireEvent.click(screen.getByText("simular-escaneo"));
    await screen.findByTestId("codigo-escaneado");
    await fillForm();
    await waitFor(() => expect(createProductAction).toHaveBeenCalled());
    expect(createProductAction.mock.calls[0][0]).toMatchObject({ locationId: "loc-B" });
    expect(sessionStorage.getItem("loloshop:escanear:location")).toBe("loc-B");
  });
});

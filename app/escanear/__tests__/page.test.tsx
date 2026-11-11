import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const lookup = vi.fn();
const record = vi.fn();
const createProductAction = vi.fn();
const fetchLocations = vi.fn();
let sessionUser: Record<string, unknown> = { id: "u1", role: "collaborator", locationId: "loc-1" };

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: sessionUser } }),
}));
vi.mock("@/lib/actions", () => ({
  lookupCodeAction: (...a: unknown[]) => lookup(...a),
  recordStockMovementAction: (...a: unknown[]) => record(...a),
  createProductAction: (...a: unknown[]) => createProductAction(...a),
  searchProductsAction: vi.fn().mockResolvedValue([]),
  addVariantAction: vi.fn(),
  fetchLocationsAction: (...a: unknown[]) => fetchLocations(...a),
  uploadProductImageAction: vi.fn(),
}));
vi.mock("@/lib/catalog/actions", () => ({
  listBrandsAction: async () => [{ id: "b1", name: "Lolo", slug: "lolo" }],
  listDepartmentsAction: async () => [{ id: "d1", slug: "dama", name: "Dama" }],
  createBrandAction: vi.fn(),
}));
// Parcial: el alta usa canonicalCode del módulo real; solo se fuerza isValidGtin.
vi.mock("@/lib/domain/barcode", async (orig) => ({
  ...(await orig<typeof import("@/lib/domain/barcode")>()),
  isValidGtin: () => true,
}));
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
  fireEvent.change(screen.getByLabelText(/piezas/i), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));
}

describe("/escanear: flujo de alta por lote", () => {
  beforeEach(() => {
    [lookup, record, createProductAction, fetchLocations].forEach((m) => m.mockReset());
    sessionUser = { id: "u1", role: "collaborator", locationId: "loc-1" };
    lookup.mockResolvedValue({ found: false, code: "750999" });
    record.mockResolvedValue({ ok: true, available: 1, replayed: false });
    createProductAction.mockResolvedValue({ ok: true, product: { imageUrl: null, variants: [] }, variantId: "v9", sku: "750999" });
    fetchLocations.mockResolvedValue([{ id: "loc-A", name: "Tienda A", type: "store" }, { id: "loc-B", name: "Bodega", type: "warehouse" }]);
  });

  it("código desconocido abre el alta con el código en solo lectura y tras guardar reactiva el escáner", async () => {
    render(<EscanearPage />);
    fireEvent.click(screen.getByText("simular-escaneo"));
    // Código nuevo: primero la pregunta "¿Es otra talla…?" (1.5).
    fireEvent.click(await screen.findByRole("button", { name: "No, es un producto nuevo" }));
    expect((await screen.findByTestId("codigo-escaneado")).textContent).toBe("750999");
    expect(screen.queryByTestId("scanner")).toBeNull();

    await fillForm();

    await waitFor(() => expect(screen.getByTestId("scanner")).toBeTruthy());
    expect(createProductAction.mock.calls[0][0]).toMatchObject({
      category: "Accesorios", locationId: "loc-1", sizes: [{ barcode: "750999", initialStock: 4 }],
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
    expect(screen.queryByRole("button", { name: /guardar producto/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /sumar .* en tu tienda/i }));
    await waitFor(() =>
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ variantId: "v1", locationId: "loc-1", kind: "restock", quantity: 1 }),
      ),
    );
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
    expect(createProductAction.mock.calls[0][0]).toMatchObject({ sizes: [{ barcode: null }] });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("owner puede dar de alta eligiendo tienda y se recuerda la elección", async () => {
    sessionUser = { id: "o1", role: "owner", locationId: null };
    render(<EscanearPage />);
    const sel = (await screen.findByLabelText(/^tienda$/i)) as HTMLSelectElement;
    await waitFor(() => expect(sel.value).toBe("loc-A"));
    fireEvent.change(sel, { target: { value: "loc-B" } });
    fireEvent.click(screen.getByText("simular-escaneo"));
    fireEvent.click(await screen.findByRole("button", { name: "No, es un producto nuevo" }));
    await screen.findByTestId("codigo-escaneado");
    await fillForm();
    await waitFor(() => expect(createProductAction).toHaveBeenCalled());
    expect(createProductAction.mock.calls[0][0]).toMatchObject({ locationId: "loc-B" });
    expect(sessionStorage.getItem("loloshop:escanear:location")).toBe("loc-B");
  });

  describe("producto existente: sumar piezas", () => {
    it("prenda en la tienda: ofrece Sumar piezas y no ofrece merma ni corrección", async () => {
      await openExisting();
      expect(screen.getByRole("button", { name: "Sumar 1 pieza en tu tienda" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /merma|corrección/i })).toBeNull();
    });

    async function openExisting() {
      lookup.mockResolvedValue({ found: true, product: existingProduct, variantId: "v1" });
      record.mockResolvedValue({ ok: true, available: 5, replayed: false });
      render(<EscanearPage />);
      fireEvent.click(screen.getByText("simular-escaneo"));
      await screen.findByText("Playera X");
    }

    it("sesión vencida: Entrada que resuelve undefined avisa con enlace a iniciar sesión y no lanza", async () => {
      await openExisting();
      record.mockResolvedValue(undefined);
      fireEvent.click(screen.getByRole("button", { name: /sumar .* en tu tienda/i }));
      expect(await screen.findByText(/Tu sesión terminó/)).toBeTruthy();
      expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login");
    });

    it("etiqueta solo en otra tienda: muestra el aviso y no ofrece traspasar", async () => {
      lookup.mockResolvedValue({
        found: true,
        product: { ...existingProduct, variants: [{ ...existingProduct.variants[0], inventory: [{ locationId: "loc-9", available: 4 }] }] },
        variantId: "v1",
      });
      render(<EscanearPage />);
      fireEvent.click(screen.getByText("simular-escaneo"));
      await screen.findByText(/registrada en otra tienda/);
      expect(screen.queryByRole("button", { name: /registrar traspaso/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /traspas/i })).toBeNull();
    });

    it("el precio usa el formato de pesos: $350.50 y $1,250", async () => {
      lookup.mockResolvedValue({
        found: true,
        product: { ...existingProduct, variants: [{ ...existingProduct.variants[0], price: 350.5 }] },
        variantId: "v1",
      });
      render(<EscanearPage />);
      fireEvent.click(screen.getByText("simular-escaneo"));
      expect(await screen.findByText("Precio: $350.50")).toBeTruthy();
      cleanup();
      lookup.mockResolvedValue({
        found: true,
        product: { ...existingProduct, variants: [{ ...existingProduct.variants[0], price: 1250 }] },
        variantId: "v1",
      });
      render(<EscanearPage />);
      fireEvent.click(screen.getByText("simular-escaneo"));
      expect(await screen.findByText("Precio: $1,250")).toBeTruthy();
    });

    it("un reintento tras un error de red lleva el mismo requestId", async () => {
      await openExisting();
      record.mockResolvedValueOnce({ ok: false, code: "ERROR", message: "No se pudo registrar. Intenta de nuevo." });
      const entrada = screen.getByRole("button", { name: /sumar .* en tu tienda/i });
      fireEvent.click(entrada);
      await screen.findByText(/no se pudo registrar/i);
      fireEvent.click(screen.getByRole("button", { name: /sumar .* en tu tienda/i }));
      await waitFor(() => expect(record).toHaveBeenCalledTimes(2));
      const [a, b] = record.mock.calls.map((c) => (c[0] as { requestId: string }).requestId);
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("doble toque mientras espera no duplica la llamada", async () => {
      await openExisting();
      let release!: (v: unknown) => void;
      record.mockReturnValue(new Promise((r) => (release = r)));
      const entrada = screen.getByRole("button", { name: /sumar .* en tu tienda/i });
      fireEvent.click(entrada);
      fireEvent.click(entrada);
      expect(record).toHaveBeenCalledTimes(1);
      release({ ok: true, available: 2, replayed: false });
      await waitFor(() => expect(screen.getByText(/ahora hay 2/i)).toBeTruthy());
    });
  });

  describe("tienda fija según la regla del servidor", () => {
    it("manager con tienda: no ve el selector de tiendas y usa su locationId", async () => {
      sessionUser = { id: "m1", role: "manager", locationId: "loc-1" };
      lookup.mockResolvedValue({ found: true, product: existingProduct, variantId: "v1" });
      record.mockResolvedValue({ ok: true, available: 1, replayed: false });
      render(<EscanearPage />);
      expect(screen.queryByLabelText(/^tienda$/i)).toBeNull();
      expect(fetchLocations).not.toHaveBeenCalled();
      fireEvent.click(screen.getByText("simular-escaneo"));
      await screen.findByText("Playera X");
      fireEvent.click(screen.getByRole("button", { name: /sumar .* en tu tienda/i }));
      await waitFor(() => expect(record).toHaveBeenCalledWith(expect.objectContaining({ locationId: "loc-1" })));
    });

    it("manager sin tienda sí elige tienda", async () => {
      sessionUser = { id: "m2", role: "manager", locationId: null };
      render(<EscanearPage />);
      expect(await screen.findByLabelText(/^tienda$/i)).toBeTruthy();
    });
  });
});

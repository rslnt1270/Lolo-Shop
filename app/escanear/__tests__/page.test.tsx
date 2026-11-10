import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const lookup = vi.fn();
const record = vi.fn();
const transfer = vi.fn();
const createProductAction = vi.fn();
const fetchLocations = vi.fn();
let sessionUser: Record<string, unknown> = { id: "u1", role: "collaborator", locationId: "loc-1" };

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: sessionUser } }),
}));
vi.mock("@/lib/actions", () => ({
  lookupCodeAction: (...a: unknown[]) => lookup(...a),
  recordStockMovementAction: (...a: unknown[]) => record(...a),
  transferStockAction: (...a: unknown[]) => transfer(...a),
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
    [lookup, record, transfer, createProductAction, fetchLocations].forEach((m) => m.mockReset());
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
    fireEvent.click(screen.getByRole("button", { name: "Entrada" }));
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

  describe("producto existente: panel de movimientos", () => {
    async function openExisting() {
      lookup.mockResolvedValue({ found: true, product: existingProduct, variantId: "v1" });
      record.mockResolvedValue({ ok: true, available: 5, replayed: false });
      render(<EscanearPage />);
      fireEvent.click(screen.getByText("simular-escaneo"));
      await screen.findByText("Playera X");
      return screen.getByTestId("stock-panel");
    }

    it("no hay ningún botón Salida y Entrada es el primero del panel", async () => {
      const panel = await openExisting();
      expect(screen.queryByRole("button", { name: /salida/i })).toBeNull();
      expect(within(panel).getAllByRole("button")[0]).toHaveAccessibleName("Entrada");
    });

    it("el aviso '¿Vendiste la prenda? Regístrala en Vender.' enlaza a /pos", async () => {
      await openExisting();
      expect(screen.getByRole("link", { name: /regístrala en vender/i })).toHaveAttribute("href", "/pos");
      expect(screen.getByText(/¿vendiste la prenda\?/i)).toBeTruthy();
    });

    it("colaborador no ve 'Merma o corrección'", async () => {
      await openExisting();
      expect(screen.queryByRole("button", { name: /merma o corrección/i })).toBeNull();
    });

    it("manager con tienda sí lo ve; sin motivo muestra el error sin llamar a la acción", async () => {
      sessionUser = { id: "m1", role: "manager", locationId: "loc-1" };
      await openExisting();
      fireEvent.click(screen.getByRole("button", { name: /merma o corrección/i }));
      fireEvent.click(screen.getByRole("button", { name: /registrar merma/i }));
      expect(await screen.findByText("Escribe el motivo.")).toBeTruthy();
      expect(record).not.toHaveBeenCalled();
    });

    it("merma con motivo llama a la acción con kind damage", async () => {
      sessionUser = { id: "m1", role: "manager", locationId: "loc-1" };
      await openExisting();
      fireEvent.click(screen.getByRole("button", { name: /merma o corrección/i }));
      fireEvent.change(screen.getByLabelText(/motivo/i), { target: { value: "Manchada" } });
      fireEvent.click(screen.getByRole("button", { name: /registrar merma/i }));
      await waitFor(() =>
        expect(record).toHaveBeenCalledWith(
          expect.objectContaining({ variantId: "v1", locationId: "loc-1", kind: "damage", quantity: 1, reason: "Manchada" }),
        ),
      );
    });

    it("sesión vencida: Entrada que resuelve undefined avisa con enlace a iniciar sesión y no lanza", async () => {
      await openExisting();
      record.mockResolvedValue(undefined);
      fireEvent.click(screen.getByRole("button", { name: "Entrada" }));
      expect(await screen.findByText(/Tu sesión terminó/)).toBeTruthy();
      expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login");
    });

    it("sesión vencida: un traspaso que resuelve undefined también avisa", async () => {
      sessionUser = { id: "m1", role: "manager", locationId: "loc-1" };
      fetchLocations.mockResolvedValue([
        { id: "loc-1", name: "Lomas", type: "store" },
        { id: "loc-2", name: "ClubAlva", type: "store" },
      ]);
      transfer.mockResolvedValue(undefined);
      await openExisting();
      fireEvent.click(screen.getByRole("button", { name: /^traspasar$/i }));
      const origen = (await screen.findByLabelText(/^origen$/i)) as HTMLSelectElement;
      await within(origen).findByRole("option", { name: "ClubAlva" });
      fireEvent.change(screen.getByLabelText(/^destino$/i), { target: { value: "loc-2" } });
      fireEvent.click(screen.getByRole("button", { name: /registrar traspaso/i }));
      expect(await screen.findByText(/Tu sesión terminó/)).toBeTruthy();
      expect(screen.getByRole("link", { name: "Iniciar sesión" })).toBeTruthy();
    });

    it("colaborador no ve 'Traspasar'", async () => {
      await openExisting();
      expect(screen.queryByRole("button", { name: /traspasar/i })).toBeNull();
    });

    it("manager: Traspasar pide origen, destino, cantidad y nota y muestra el mensaje de éxito", async () => {
      sessionUser = { id: "m1", role: "manager", locationId: "loc-1" };
      fetchLocations.mockResolvedValue([
        { id: "loc-1", name: "Lomas", type: "store" },
        { id: "loc-2", name: "ClubAlva", type: "store" },
      ]);
      transfer.mockResolvedValue({ ok: true, available: 3, replayed: false, message: "Se movieron 2 de Lomas a ClubAlva." });
      await openExisting();
      fireEvent.click(screen.getByRole("button", { name: /^traspasar$/i }));
      const origen = (await screen.findByLabelText(/^origen$/i)) as HTMLSelectElement;
      await within(origen).findByRole("option", { name: "ClubAlva" });
      expect(origen.value).toBe("loc-1");
      fireEvent.change(screen.getByLabelText(/^destino$/i), { target: { value: "loc-2" } });
      fireEvent.change(screen.getByLabelText(/^cantidad$/i), { target: { value: "2" } });
      fireEvent.change(screen.getByLabelText(/^nota/i), { target: { value: "Reposición" } });
      fireEvent.click(screen.getByRole("button", { name: /registrar traspaso/i }));
      await waitFor(() =>
        expect(transfer).toHaveBeenCalledWith(
          expect.objectContaining({
            variantId: "v1", fromLocationId: "loc-1", toLocationId: "loc-2", quantity: 2, note: "Reposición",
          }),
        ),
      );
      expect(await screen.findByText("Se movieron 2 de Lomas a ClubAlva.")).toBeTruthy();
    });

    it("el almacén aparece como origen y como destino, y se etiqueta como bodega", async () => {
      sessionUser = { id: "o1", role: "owner", locationId: null };
      fetchLocations.mockResolvedValue([
        { id: "loc-1", name: "Lomas", type: "store" },
        { id: "loc-w", name: "Almacén", type: "warehouse" },
      ]);
      await openExisting();
      fireEvent.click(screen.getByRole("button", { name: /^traspasar$/i }));
      const origen = (await screen.findByLabelText(/^origen$/i)) as HTMLSelectElement;
      const destino = screen.getByLabelText(/^destino$/i) as HTMLSelectElement;
      await within(origen).findByRole("option", { name: "Almacén (bodega)" });
      expect(within(destino).getByRole("option", { name: "Almacén (bodega)" })).toBeTruthy();
    });

    it("si la ubicación actual es el almacén, el origen preseleccionado es el almacén y se envía", async () => {
      sessionUser = { id: "o1", role: "owner", locationId: null };
      fetchLocations.mockResolvedValue([
        { id: "loc-w", name: "Almacén", type: "warehouse" },
        { id: "loc-1", name: "Lomas", type: "store" },
      ]);
      transfer.mockResolvedValue({ ok: true, available: 0, replayed: false, message: "ok" });
      await openExisting();
      fireEvent.click(screen.getByRole("button", { name: /^traspasar$/i }));
      const origen = (await screen.findByLabelText(/^origen$/i)) as HTMLSelectElement;
      await within(origen).findByRole("option", { name: "Lomas" });
      expect(origen.value).toBe("loc-w");
      fireEvent.change(screen.getByLabelText(/^destino$/i), { target: { value: "loc-1" } });
      fireEvent.click(screen.getByRole("button", { name: /registrar traspaso/i }));
      await waitFor(() =>
        expect(transfer).toHaveBeenCalledWith(expect.objectContaining({ fromLocationId: "loc-w", toLocationId: "loc-1" })),
      );
    });

    it("origen = destino muestra el error sin llamar a la acción", async () => {
      sessionUser = { id: "o1", role: "owner", locationId: null };
      fetchLocations.mockResolvedValue([
        { id: "loc-1", name: "Lomas", type: "store" },
        { id: "loc-2", name: "ClubAlva", type: "store" },
      ]);
      await openExisting();
      fireEvent.click(screen.getByRole("button", { name: /^traspasar$/i }));
      const origen = (await screen.findByLabelText(/^origen$/i)) as HTMLSelectElement;
      await within(origen).findByRole("option", { name: "ClubAlva" });
      fireEvent.change(screen.getByLabelText(/^destino$/i), { target: { value: "loc-1" } });
      fireEvent.click(screen.getByRole("button", { name: /registrar traspaso/i }));
      expect(await screen.findByText(/origen y el destino/i)).toBeTruthy();
      expect(transfer).not.toHaveBeenCalled();
    });

    it("corrección pide dirección y el botón cambia a 'Registrar corrección'", async () => {
      sessionUser = { id: "m1", role: "manager", locationId: "loc-1" };
      await openExisting();
      fireEvent.click(screen.getByRole("button", { name: /merma o corrección/i }));
      fireEvent.click(screen.getByRole("radio", { name: "Corrección" }));
      fireEvent.click(screen.getByRole("radio", { name: "Resta" }));
      fireEvent.change(screen.getByLabelText(/motivo/i), { target: { value: "Conteo" } });
      fireEvent.click(screen.getByRole("button", { name: /registrar corrección/i }));
      await waitFor(() =>
        expect(record).toHaveBeenCalledWith(
          expect.objectContaining({ kind: "adjustment", direction: "out", reason: "Conteo" }),
        ),
      );
    });

    it("INSUFFICIENT muestra el mensaje del servidor", async () => {
      sessionUser = { id: "m1", role: "manager", locationId: "loc-1" };
      await openExisting();
      record.mockResolvedValue({ ok: false, code: "INSUFFICIENT", available: 1, message: "Solo hay 1 en esta tienda." });
      fireEvent.click(screen.getByRole("button", { name: /merma o corrección/i }));
      fireEvent.change(screen.getByLabelText(/motivo/i), { target: { value: "Manchada" } });
      fireEvent.click(screen.getByRole("button", { name: /registrar merma/i }));
      expect(await screen.findByText("Solo hay 1 en esta tienda.")).toBeTruthy();
    });

    it("un reintento tras un error de red lleva el mismo requestId", async () => {
      await openExisting();
      record.mockResolvedValueOnce({ ok: false, code: "ERROR", message: "No se pudo registrar. Intenta de nuevo." });
      const entrada = screen.getByRole("button", { name: "Entrada" });
      fireEvent.click(entrada);
      await screen.findByText(/no se pudo registrar/i);
      fireEvent.click(screen.getByRole("button", { name: "Entrada" }));
      await waitFor(() => expect(record).toHaveBeenCalledTimes(2));
      const [a, b] = record.mock.calls.map((c) => (c[0] as { requestId: string }).requestId);
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("doble toque mientras espera no duplica la llamada", async () => {
      await openExisting();
      let release!: (v: unknown) => void;
      record.mockReturnValue(new Promise((r) => (release = r)));
      const entrada = screen.getByRole("button", { name: "Entrada" });
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
      fireEvent.click(screen.getByRole("button", { name: "Entrada" }));
      await waitFor(() => expect(record).toHaveBeenCalledWith(expect.objectContaining({ locationId: "loc-1" })));
    });

    it("manager sin tienda sí elige tienda", async () => {
      sessionUser = { id: "m2", role: "manager", locationId: null };
      render(<EscanearPage />);
      expect(await screen.findByLabelText(/^tienda$/i)).toBeTruthy();
    });
  });
});

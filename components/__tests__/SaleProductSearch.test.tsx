import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const actions = vi.hoisted(() => ({
  searchProductsAction: vi.fn(),
  listVariantStockAtAction: vi.fn(),
  lookupCodeAction: vi.fn(),
}));
vi.mock("@/lib/actions", () => actions);
const queue = vi.hoisted(() => ({ listQueue: vi.fn() }));
vi.mock("@/lib/offline/queue-store", () => ({ listQueue: queue.listQueue }));

import { SaleProductSearch } from "@/components/sales/SaleProductSearch";

const hit = { productId: "p1", title: "Playera Logo", brand: "Guess", publicCode: "K7Q2M", imageUrl: null, sizes: ["S", "M"] };
const rows = [
  { variantId: "v-s", size: "S", sku: "LS-AAAAAA-0", price: 300, available: 0 },
  { variantId: "v-m", size: "M", sku: "LS-BBBBBB-1", price: 320, available: 4 },
];
const lookupFor = (variantId: string, size: string) => ({
  found: true as const,
  variantId,
  stock: { available: 4, sold: false },
  product: {
    id: "p1", title: "Playera Logo", category: "Playeras", brand: "Guess", imageUrl: null,
    variants: [{ id: variantId, sku: "LS-BBBBBB-1", title: size, size, color: null, price: 320, barcode: null, inventory: [] }],
  },
});

const type = (q: string) => fireEvent.change(screen.getByLabelText(/buscar producto registrado/i), { target: { value: q } });

beforeEach(() => {
  vi.clearAllMocks();
  queue.listQueue.mockResolvedValue([]);
  actions.searchProductsAction.mockResolvedValue([hit]);
  actions.listVariantStockAtAction.mockResolvedValue(rows);
  actions.lookupCodeAction.mockResolvedValue(lookupFor("v-m", "M"));
});

describe("SaleProductSearch", () => {
  it("consulta sin resultados muestra 'No encontramos productos con «…»' y no agrega nada", async () => {
    actions.searchProductsAction.mockResolvedValue([]);
    const onAdd = vi.fn();
    render(<SaleProductSearch locationId="l1" onAdd={onAdd} />);
    type("zzz");
    expect(await screen.findByText("No encontramos productos con «zzz».")).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /no, es un producto nuevo/i })).toBeNull();
  });

  it("elegir producto y talla con existencias agrega la línea de esa talla", async () => {
    const onAdd = vi.fn();
    render(<SaleProductSearch locationId="l1" onAdd={onAdd} />);
    type("playera");
    fireEvent.click(await screen.findByRole("button", { name: /^M\b.*4/ }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(actions.listVariantStockAtAction).toHaveBeenCalledWith("p1", "l1");
    expect(actions.lookupCodeAction).toHaveBeenCalledWith("LS-BBBBBB-1", "l1");
    expect(onAdd.mock.calls[0][0].variant.id).toBe("v-m");
    expect(onAdd.mock.calls[0][1]).toEqual({ available: 4, sold: false });
  });

  it("talla con cero existencias aparece deshabilitada con 'Sin existencias'", async () => {
    const onAdd = vi.fn();
    render(<SaleProductSearch locationId="l1" onAdd={onAdd} />);
    type("playera");
    const s = await screen.findByRole("button", { name: /^S\b.*Sin existencias/ });
    expect(s).toBeDisabled();
    fireEvent.click(s);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("caracteres especiales en la consulta no rompen la búsqueda", async () => {
    actions.searchProductsAction.mockResolvedValue([]);
    render(<SaleProductSearch locationId="l1" onAdd={vi.fn()} />);
    type("%_\\'\"<b>");
    expect(await screen.findByText("No encontramos productos con «%_\\'\"<b>».")).toBeInTheDocument();
    expect(actions.searchProductsAction).toHaveBeenCalledWith("%_\\'\"<b>");
  });

  it("si la tienda cambia, la búsqueda se limpia", async () => {
    const { rerender } = render(<SaleProductSearch locationId="l1" onAdd={vi.fn()} />);
    type("playera");
    await screen.findByText("Playera Logo");
    rerender(<SaleProductSearch locationId="l2" onAdd={vi.fn()} />);
    expect(screen.queryByText("Playera Logo")).toBeNull();
    expect(screen.getByLabelText(/buscar producto registrado/i)).toHaveValue("");
  });

  it("singular y plural en las existencias: '1 disponible' y '4 disponibles'", async () => {
    actions.listVariantStockAtAction.mockResolvedValue([
      { variantId: "v-s", size: "S", sku: "LS-AAAAAA-0", price: 300, available: 1 },
      rows[1],
    ]);
    render(<SaleProductSearch locationId="l1" onAdd={vi.fn()} />);
    type("playera");
    expect(await screen.findByText("1 disponible")).toBeInTheDocument();
    expect(screen.getByText("4 disponibles")).toBeInTheDocument();
  });

  it("el aviso de búsqueda se limpia al cambiar de tienda", async () => {
    actions.lookupCodeAction.mockResolvedValue({ found: false, code: "LS-BBBBBB-1" });
    const { rerender } = render(<SaleProductSearch locationId="l1" onAdd={vi.fn()} />);
    type("playera");
    fireEvent.click(await screen.findByRole("button", { name: /^M\b.*4/ }));
    await screen.findByRole("alert");
    rerender(<SaleProductSearch locationId="l2" onAdd={vi.fn()} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("deshabilitada (cobro en curso) no deja elegir tallas", async () => {
    const onAdd = vi.fn();
    render(<SaleProductSearch locationId="l1" disabled onAdd={onAdd} />);
    type("playera");
    expect(await screen.findByRole("button", { name: /^M\b.*4/ })).toBeDisabled();
  });

  it("si el código de la talla ya no resuelve a esa talla no agrega y avisa", async () => {
    actions.lookupCodeAction.mockResolvedValue({ found: false, code: "LS-BBBBBB-1" });
    const onAdd = vi.fn();
    render(<SaleProductSearch locationId="l1" onAdd={onAdd} />);
    type("playera");
    fireEvent.click(await screen.findByRole("button", { name: /^M\b.*4/ }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe("SaleProductSearch sin internet", () => {
  const snapVariant = (variantId: string, size: string, available: number) => ({
    variantId, productId: "p1", barcode: null, sku: `LS-AAAAAA-${size}`, productTitle: "Playera Guess negro",
    variantTitle: size, size, price: 450, available,
  });
  const snapshot = {
    locationId: "l1",
    generatedAt: new Date().toISOString(),
    variants: [snapVariant("v-m", "M", 3), snapVariant("v-s", "S", 0)],
  };
  const pendingSale = {
    clientRequestId: "q1", userId: "u1", locationId: "l1", channel: "store", paymentMethod: "cash",
    lines: [{ variantId: "v-m", quantity: 1, unitPrice: 450, sku: "x", productTitle: "x", variantTitle: "M" }],
    total: 450, soldAt: "2026-11-12T10:00:00.000Z", snapshotAt: "2026-11-12T09:00:00.000Z", snapshotToken: "t",
    state: "pending" as const, attempts: 0,
  };
  const BLOCKED = "Conéctate para actualizar precios y existencias";

  it("busca en la copia local, descuenta la cola y agrega sin llamar al servidor", async () => {
    queue.listQueue.mockResolvedValue([pendingSale]);
    const onAdd = vi.fn();
    render(<SaleProductSearch locationId="l1" onAdd={onAdd} offline={{ snapshot, blockedText: BLOCKED }} />);
    type("guess");
    expect(await screen.findByText("Playera Guess negro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /S\s+Sin existencias/ })).toBeDisabled();
    fireEvent.click(await screen.findByRole("button", { name: /M\s+2 disponibles/ }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        product: expect.objectContaining({ id: "p1", title: "Playera Guess negro" }),
        variant: expect.objectContaining({ id: "v-m", size: "M", price: 450 }),
      }),
      { available: 2, sold: false },
    );
    expect(actions.searchProductsAction).not.toHaveBeenCalled();
    expect(actions.listVariantStockAtAction).not.toHaveBeenCalled();
    expect(actions.lookupCodeAction).not.toHaveBeenCalled();
  });

  it("sin resultados en la copia lo dice", async () => {
    render(<SaleProductSearch locationId="l1" onAdd={vi.fn()} offline={{ snapshot, blockedText: BLOCKED }} />);
    type("zapato");
    expect(await screen.findByText("No está en la copia de esta tienda. Si es nueva, se vende cuando vuelva la conexión.")).toBeInTheDocument();
  });

  it("sin copia vigente muestra el aviso y no busca", async () => {
    render(<SaleProductSearch locationId="l1" onAdd={vi.fn()} offline={{ snapshot: null, blockedText: BLOCKED }} />);
    expect(screen.getByText(BLOCKED)).toBeInTheDocument();
    expect(screen.queryByLabelText(/buscar producto registrado/i)).toBeNull();
  });
});

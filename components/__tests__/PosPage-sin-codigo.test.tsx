import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "Lolo", role: "owner", locationId: null } },
    status: "authenticated",
  }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const actions = vi.hoisted(() => ({
  lookupCodeAction: vi.fn(),
  fetchLocationsAction: vi.fn(),
  createSaleAction: vi.fn(),
  searchProductsAction: vi.fn(),
  listVariantStockAtAction: vi.fn(),
}));
vi.mock("@/lib/actions", () => ({
  lookupCodeAction: actions.lookupCodeAction,
  fetchLocationsAction: actions.fetchLocationsAction,
  searchProductsAction: actions.searchProductsAction,
  listVariantStockAtAction: actions.listVariantStockAtAction,
}));
vi.mock("@/lib/sales/actions", () => ({ createSaleAction: actions.createSaleAction }));
vi.mock("@/components/inventory/Scanner", () => ({ Scanner: () => <div data-testid="scanner" /> }));

import POSPage from "@/app/pos/page";

const hit = { productId: "p1", title: "Playera Logo", brand: "Guess", publicCode: null, imageUrl: null, sizes: ["M"] };
const lookup = (available: number) => ({
  found: true as const,
  variantId: "v-m",
  stock: { available, sold: false },
  product: {
    id: "p1", title: "Playera Logo", category: "Playeras", brand: "Guess", imageUrl: null,
    variants: [{ id: "v-m", sku: "LS-BBBBBB-1", title: "M", size: "M", color: null, price: 320, barcode: null, inventory: [] }],
  },
});

async function ready() {
  render(<POSPage />);
  await screen.findByDisplayValue("Centro");
}
const openSearch = () => fireEvent.click(screen.getByRole("button", { name: "Sin código" }));
const searchFor = (q: string) =>
  fireEvent.change(screen.getByLabelText(/buscar producto registrado/i), { target: { value: q } });

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  actions.fetchLocationsAction.mockResolvedValue([{ id: "l1", name: "Centro" }]);
  actions.searchProductsAction.mockResolvedValue([hit]);
  actions.listVariantStockAtAction.mockResolvedValue([
    { variantId: "v-m", size: "M", sku: "LS-BBBBBB-1", price: 320, available: 1 },
  ]);
  actions.lookupCodeAction.mockResolvedValue(lookup(1));
});

describe("/pos «Sin código»", () => {
  it("buscar, elegir talla y agregar: la línea entra al carrito con la talla", async () => {
    await ready();
    openSearch();
    searchFor("playera");
    fireEvent.click(await screen.findByRole("button", { name: /^M\b.*1 disponible/ }));
    expect(await screen.findByText("Agregado: Playera Logo (M) · ×1")).toBeInTheDocument();
    expect(actions.lookupCodeAction).toHaveBeenCalledWith("LS-BBBBBB-1", "l1");
    expect(screen.getByRole("button", { name: /^cobrar/i })).toBeEnabled();
  });

  it("segunda vez la misma talla sin piezas de sobra: 'Sin existencias de la talla M en esta tienda'", async () => {
    await ready();
    openSearch();
    searchFor("playera");
    const pick = async () => fireEvent.click(await screen.findByRole("button", { name: /^M\b.*1 disponible/ }));
    await pick();
    await screen.findByText("Agregado: Playera Logo (M) · ×1");
    await pick();
    expect(await screen.findByText("Sin existencias de la talla M en esta tienda")).toBeInTheDocument();
    expect(screen.getAllByText("Playera Logo").length).toBeGreaterThan(0);
    expect(screen.queryByText("×2")).toBeNull();
  });

  it("con el cobro incierto el carrito está bloqueado y «Sin código» queda deshabilitado", async () => {
    actions.createSaleAction.mockRejectedValue(new Error("red"));
    await ready();
    openSearch();
    searchFor("playera");
    fireEvent.click(await screen.findByRole("button", { name: /^M\b.*1 disponible/ }));
    await screen.findByText("Agregado: Playera Logo (M) · ×1");
    fireEvent.click(screen.getByRole("button", { name: /^cobrar/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sin código" })).toBeDisabled());
    expect(screen.getByRole("button", { name: /^M\b.*1 disponible/ })).toBeDisabled();
  });

  describe("carrera: el cobro empieza antes de que llegue la consulta de la talla", () => {
    const defer = () => {
      let resolve!: (v: unknown) => void;
      const promise = new Promise((r) => (resolve = r));
      return { promise, resolve };
    };
    const pickM = async () => fireEvent.click(await screen.findByRole("button", { name: /^M\b.*disponible/ }));

    async function withOneLine() {
      actions.listVariantStockAtAction.mockResolvedValue([
        { variantId: "v-m", size: "M", sku: "LS-BBBBBB-1", price: 320, available: 5 },
      ]);
      actions.lookupCodeAction.mockResolvedValue(lookup(5));
      await ready();
      openSearch();
      searchFor("playera");
      await pickM();
      await screen.findByText("Agregado: Playera Logo (M) · ×1");
    }

    it("con cobro en curso avisa y no cambia el carrito", async () => {
      await withOneLine();
      const late = defer();
      actions.lookupCodeAction.mockReturnValueOnce(late.promise);
      const sale = defer();
      actions.createSaleAction.mockReturnValueOnce(sale.promise);
      await pickM();
      fireEvent.click(screen.getByRole("button", { name: /^cobrar/i }));
      await waitFor(() => expect(actions.createSaleAction).toHaveBeenCalledTimes(1));
      await act(async () => late.resolve(lookup(5)));
      expect(await screen.findByText(/Hay un cobro en curso/)).toBeInTheDocument();
      expect(screen.queryByText("×2")).toBeNull();
      expect(actions.createSaleAction.mock.calls[0][0].lines).toEqual([{ variantId: "v-m", quantity: 1, unitPrice: 320 }]);
      await act(async () => sale.resolve({ ok: false, code: "UNAVAILABLE", message: "Lento." }));
    });

    it("con el carrito bloqueado avisa y no cambia el carrito", async () => {
      await withOneLine();
      const late = defer();
      actions.lookupCodeAction.mockReturnValueOnce(late.promise);
      actions.createSaleAction.mockRejectedValueOnce(new Error("red"));
      await pickM();
      fireEvent.click(screen.getByRole("button", { name: /^cobrar/i }));
      await screen.findByText(/no sabemos si la venta se registró/i);
      await act(async () => late.resolve(lookup(5)));
      expect(await screen.findByText(/Hay un cobro en curso/)).toBeInTheDocument();
      expect(screen.queryByText("×2")).toBeNull();
    });
  });

  it("sin tienda elegida el botón queda deshabilitado y explica por qué", async () => {
    actions.fetchLocationsAction.mockResolvedValue([]);
    render(<POSPage />);
    expect(await screen.findByText("Elige la tienda de la venta.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sin código" })).toBeDisabled();
  });
});

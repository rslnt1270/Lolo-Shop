import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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
    fireEvent.click(await screen.findByRole("button", { name: /^M\b.*1 disponibles/ }));
    expect(await screen.findByText("Agregado: Playera Logo (M) · ×1")).toBeInTheDocument();
    expect(actions.lookupCodeAction).toHaveBeenCalledWith("LS-BBBBBB-1", "l1");
    expect(screen.getByRole("button", { name: /^cobrar/i })).toBeEnabled();
  });

  it("segunda vez la misma talla sin piezas de sobra: 'Sin existencias de la talla M en esta tienda'", async () => {
    await ready();
    openSearch();
    searchFor("playera");
    const pick = async () => fireEvent.click(await screen.findByRole("button", { name: /^M\b.*1 disponibles/ }));
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
    fireEvent.click(await screen.findByRole("button", { name: /^M\b.*1 disponibles/ }));
    await screen.findByText("Agregado: Playera Logo (M) · ×1");
    fireEvent.click(screen.getByRole("button", { name: /^cobrar/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sin código" })).toBeDisabled());
    expect(screen.getByRole("button", { name: /^M\b.*1 disponibles/ })).toBeDisabled();
  });
});

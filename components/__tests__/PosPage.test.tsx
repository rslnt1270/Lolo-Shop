import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const session = vi.hoisted(() => ({
  value: {
    data: { user: { id: "u1", name: "Lolo", role: "owner", locationId: null } },
    status: "authenticated",
  } as { data: unknown; status: string },
}));
vi.mock("next-auth/react", () => ({ useSession: () => session.value }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const actions = vi.hoisted(() => ({
  lookupCodeAction: vi.fn(),
  fetchLocationsAction: vi.fn(),
  createSaleAction: vi.fn(),
}));
vi.mock("@/lib/actions", () => ({
  lookupCodeAction: actions.lookupCodeAction,
  fetchLocationsAction: actions.fetchLocationsAction,
}));
vi.mock("@/lib/sales/actions", () => ({ createSaleAction: actions.createSaleAction }));
vi.mock("@/components/inventory/Scanner", () => ({
  Scanner: () => <div data-testid="scanner" />,
}));

import POSPage from "@/app/pos/page";

const variant = (id: string, price: number) => ({
  id,
  sku: `SKU-${id}`,
  title: "M / Negro",
  size: "M",
  color: "Negro",
  price,
  barcode: null,
  inventory: [],
});
const found = (id: string, price: number) => ({
  found: true as const,
  variantId: id,
  product: { id: "p", title: "Playera", category: "Ropa", brand: "Acme", imageUrl: null, variants: [variant(id, price)] },
});

async function scan(code: string) {
  fireEvent.change(screen.getByLabelText(/código del producto/i), { target: { value: code } });
  fireEvent.click(screen.getByRole("button", { name: /usar este código/i }));
  await waitFor(() => expect(actions.lookupCodeAction).toHaveBeenCalledWith(code));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  session.value = {
    data: { user: { id: "u1", name: "Lolo", role: "owner", locationId: null } },
    status: "authenticated",
  };
  actions.fetchLocationsAction.mockResolvedValue([
    { id: "l1", name: "Centro" },
    { id: "l2", name: "Plaza" },
  ]);
  actions.lookupCodeAction.mockResolvedValue(found("v1", 199.95));
});

describe("POSPage", () => {
  it("sin líneas, Cobrar está deshabilitado", async () => {
    render(<POSPage />);
    await screen.findByRole("combobox", { name: /tienda/i });
    expect(screen.getByRole("button", { name: /^cobrar/i })).toBeDisabled();
  });

  it("escanear dos veces el mismo código suma cantidad y muestra el total", async () => {
    render(<POSPage />);
    await screen.findByDisplayValue("Centro");
    await scan("111");
    await screen.findByText("Playera");
    await scan("111");
    await waitFor(() => expect(screen.getByTestId("sale-total")).toHaveTextContent("$399.90"));
    expect(screen.getByRole("button", { name: /^cobrar/i })).toBeEnabled();
  });

  it("owner y manager ven selector de tienda; el collaborator no", async () => {
    const { unmount } = render(<POSPage />);
    expect(await screen.findByRole("combobox", { name: /tienda/i })).toBeInTheDocument();
    unmount();
    session.value = {
      data: { user: { id: "u2", name: "Colab", role: "collaborator", locationId: "l2" } },
      status: "authenticated",
    };
    render(<POSPage />);
    await screen.findByRole("button", { name: /^cobrar/i });
    expect(screen.queryByRole("combobox", { name: /tienda/i })).not.toBeInTheDocument();
    expect(actions.fetchLocationsAction).toHaveBeenCalledTimes(1);
  });

  it("el collaborator no edita el precio y vende en su tienda", async () => {
    session.value = {
      data: { user: { id: "u2", name: "Colab", role: "collaborator", locationId: "l2" } },
      status: "authenticated",
    };
    actions.createSaleAction.mockResolvedValue({ ok: true, sale: { number: 5 } });
    render(<POSPage />);
    await scan("111");
    await screen.findByText("Playera");
    expect(screen.queryByLabelText(/precio unitario/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^cobrar/i }));
    await waitFor(() => expect(actions.createSaleAction).toHaveBeenCalled());
    expect(actions.createSaleAction.mock.calls[0][0].locationId).toBe("l2");
  });

  it("WhatsApp con Transferencia SPAY pide el alias opcional", async () => {
    render(<POSPage />);
    await screen.findByDisplayValue("Centro");
    expect(screen.queryByLabelText(/alias del pedido/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("WhatsApp"));
    fireEvent.click(screen.getByLabelText("Transferencia SPAY"));
    expect(screen.getByLabelText(/alias del pedido/i)).toBeInTheDocument();
    expect(screen.getByText("Sin teléfono ni nombre completo")).toBeInTheDocument();
  });

  it("tras un error de red, reintentar manda el mismo clientRequestId", async () => {
    actions.createSaleAction
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: true, sale: { number: 7 } });
    render(<POSPage />);
    await screen.findByDisplayValue("Centro");
    await scan("111");
    await screen.findByText("Playera");
    const cobrar = screen.getByRole("button", { name: /^cobrar/i });
    fireEvent.click(cobrar);
    expect(cobrar).toBeDisabled();
    await screen.findByText(/no se pudo registrar/i);
    fireEvent.click(screen.getByRole("button", { name: /^cobrar/i }));
    await screen.findByText("Venta #7 registrada");
    const [first, second] = actions.createSaleAction.mock.calls.map((c) => c[0]);
    expect(second.clientRequestId).toBe(first.clientRequestId);
    expect(first.lines).toEqual([{ variantId: "v1", quantity: 1, unitPrice: 199.95 }]);
  });

  it("NO_STOCK muestra el mensaje junto a la línea afectada", async () => {
    actions.createSaleAction.mockResolvedValue({
      ok: false,
      code: "NO_STOCK",
      message: "Solo hay 1 de esta prenda en la tienda (pediste 2).",
    });
    render(<POSPage />);
    await screen.findByDisplayValue("Centro");
    await scan("111");
    await screen.findByText("Playera");
    fireEvent.click(screen.getByRole("button", { name: /^cobrar/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Solo hay 1 de esta prenda en la tienda (pediste 2).");
    expect(screen.getByRole("listitem")).toContainElement(alert);
  });

  it("al tener éxito muestra el folio y vacía el carrito", async () => {
    actions.createSaleAction.mockResolvedValue({ ok: true, sale: { number: 12 } });
    render(<POSPage />);
    await screen.findByDisplayValue("Centro");
    await scan("111");
    await screen.findByText("Playera");
    fireEvent.click(screen.getByRole("button", { name: /^cobrar/i }));
    await screen.findByText("Venta #12 registrada");
    expect(screen.queryByText("Playera")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cobrar/i })).toBeDisabled();
  });
});

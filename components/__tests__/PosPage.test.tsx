import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const session = vi.hoisted(() => ({
  value: {
    data: { user: { id: "u1", name: "Lolo", role: "owner", locationId: null } },
    status: "authenticated",
  } as { data: unknown; status: string },
}));
vi.mock("next-auth/react", () => ({ useSession: () => session.value }));
vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
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
const found = (id: string, price: number, title = "Playera") => ({
  found: true as const,
  variantId: id,
  product: { id: `p-${id}`, title, category: "Ropa", brand: "Acme", imageUrl: null, variants: [variant(id, price)] },
});

const sentIds = () => actions.createSaleAction.mock.calls.map((c) => c[0].clientRequestId as string);
const cobrar = () => fireEvent.click(screen.getByRole("button", { name: /^cobrar/i }));
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function readyWithOneLine() {
  render(<POSPage />);
  await screen.findByDisplayValue("Centro");
  await scan("111");
  await screen.findByText("Playera");
}

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

  it("conflicto de identificador: conserva el carrito y el siguiente Cobrar usa un id nuevo", async () => {
    actions.createSaleAction
      .mockResolvedValueOnce({
        ok: false,
        code: "INVALID",
        reason: "request_conflict",
        message: "La venta #9 ya se registró con otros datos. Revisa el carrito y vuelve a cobrar.",
      })
      .mockResolvedValueOnce({ ok: true, sale: { number: 10 } });
    await readyWithOneLine();
    cobrar();
    expect(await screen.findByRole("alert")).toHaveTextContent("La venta #9 ya se registró con otros datos.");
    expect(screen.getByText("Playera")).toBeInTheDocument();
    cobrar();
    await screen.findByText("Venta #10 registrada");
    const [first, second] = sentIds();
    expect(second).not.toBe(first);
    expect(second).toMatch(UUID_V4);
  });

  it("tras un rechazo del servidor, editar el carrito cambia el id; sin cambios lo conserva", async () => {
    actions.createSaleAction.mockResolvedValue({ ok: false, code: "INVALID", message: "Algo no cuadra." });
    await readyWithOneLine();
    cobrar();
    await screen.findByText("Algo no cuadra.");
    cobrar();
    await waitFor(() => expect(actions.createSaleAction).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: /sumar una pieza de playera/i }));
    cobrar();
    await waitFor(() => expect(actions.createSaleAction).toHaveBeenCalledTimes(3));
    const [a, b, c] = sentIds();
    expect(b).toBe(a);
    expect(c).not.toBe(b);
  });

  it.each([
    ["el método de pago", () => fireEvent.click(screen.getByLabelText("Tarjeta"))],
    ["el canal", () => fireEvent.click(screen.getByLabelText("WhatsApp"))],
    ["la tienda", () => fireEvent.change(screen.getByRole("combobox", { name: /tienda/i }), { target: { value: "l2" } })],
  ])("tras un rechazo, cambiar %s cambia el id", async (_label, change) => {
    actions.createSaleAction.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "No." });
    await readyWithOneLine();
    cobrar();
    await screen.findByText("No.");
    change();
    cobrar();
    await waitFor(() => expect(actions.createSaleAction).toHaveBeenCalledTimes(2));
    const [a, b] = sentIds();
    expect(b).not.toBe(a);
  });

  it("tras un error de red, editar el carrito conserva el id (el servidor decide si ya existía)", async () => {
    actions.createSaleAction.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({ ok: true, sale: { number: 3 } });
    await readyWithOneLine();
    cobrar();
    await screen.findByText(/no se pudo registrar/i);
    fireEvent.click(screen.getByRole("button", { name: /sumar una pieza de playera/i }));
    cobrar();
    await screen.findByText("Venta #3 registrada");
    const [a, b] = sentIds();
    expect(b).toBe(a);
  });

  it("UNAVAILABLE (servidor lento): muestra el mensaje y reintenta con el mismo id", async () => {
    actions.createSaleAction
      .mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE", message: "El servidor tardó en responder. Intenta cobrar de nuevo." })
      .mockResolvedValueOnce({ ok: true, sale: { number: 4 } });
    await readyWithOneLine();
    cobrar();
    await screen.findByText("El servidor tardó en responder. Intenta cobrar de nuevo.");
    fireEvent.click(screen.getByRole("button", { name: /sumar una pieza de playera/i }));
    cobrar();
    await screen.findByText("Venta #4 registrada");
    const [a, b] = sentIds();
    expect(b).toBe(a);
  });

  it("error de red, luego INVALID antes del lookup, luego editar y reenviar: conserva el mismo id", async () => {
    actions.createSaleAction
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: false, code: "INVALID", message: "El precio no es válido." })
      .mockResolvedValueOnce({ ok: true, sale: { number: 5 } });
    await readyWithOneLine();
    cobrar();
    await screen.findByText(/no se pudo registrar/i);
    const price = screen.getByLabelText(/precio/i);
    fireEvent.change(price, { target: { value: "99999999" } });
    cobrar();
    await screen.findByText("El precio no es válido.");
    fireEvent.change(price, { target: { value: "199.95" } });
    cobrar();
    await screen.findByText("Venta #5 registrada");
    const [a, b, c] = sentIds();
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("UNAVAILABLE y luego rechazo: tampoco renueva el id", async () => {
    actions.createSaleAction
      .mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE", message: "Lento. Intenta cobrar de nuevo." })
      .mockResolvedValueOnce({ ok: false, code: "INVALID", message: "Mal." })
      .mockResolvedValueOnce({ ok: true, sale: { number: 6 } });
    await readyWithOneLine();
    cobrar();
    await screen.findByText("Lento. Intenta cobrar de nuevo.");
    fireEvent.click(screen.getByRole("button", { name: /sumar una pieza de playera/i }));
    cobrar();
    await screen.findByText("Mal.");
    fireEvent.click(screen.getByRole("button", { name: /sumar una pieza de playera/i }));
    cobrar();
    await screen.findByText("Venta #6 registrada");
    const [a, b, c] = sentIds();
    expect([b, c]).toEqual([a, a]);
  });

  it("resultado undefined (el middleware redirigió): sesión vencida con enlace, no mensaje de conexión", async () => {
    actions.createSaleAction.mockResolvedValue(undefined);
    await readyWithOneLine();
    cobrar();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Tu sesión terminó. Vuelve a iniciar sesión.");
    expect(within(alert).getByRole("link", { name: /iniciar sesión/i })).toHaveAttribute("href", "/login");
    expect(screen.queryByText(/revisa tu conexión/i)).toBeNull();
  });

  it("NO_STOCK en un carrito de varias líneas: el mensaje va junto a la prenda indicada", async () => {
    actions.lookupCodeAction.mockImplementation(async (code: string) =>
      code === "222" ? found("v2", 50, "Gorra") : found("v1", 199.95),
    );
    actions.createSaleAction.mockResolvedValue({
      ok: false,
      code: "NO_STOCK",
      variantId: "v2",
      message: "Solo hay 0 de esta prenda en la tienda (pediste 1).",
    });
    await readyWithOneLine();
    await scan("222");
    await screen.findByText("Gorra");
    cobrar();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Solo hay 0 de esta prenda");
    const items = screen.getAllByRole("listitem");
    const gorra = items.find((li) => within(li).queryByText("Gorra"))!;
    const playera = items.find((li) => within(li).queryByText("Playera"))!;
    expect(gorra).toContainElement(alert);
    expect(playera).not.toContainElement(alert);
  });

  it("sesión vencida: muestra el aviso con enlace a iniciar sesión y no reintenta solo", async () => {
    actions.createSaleAction.mockResolvedValue({
      ok: false,
      code: "FORBIDDEN",
      reason: "session_expired",
      message: "Tu sesión terminó. Vuelve a iniciar sesión.",
    });
    await readyWithOneLine();
    cobrar();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Tu sesión terminó. Vuelve a iniciar sesión.");
    expect(within(alert).getByRole("link", { name: /iniciar sesión/i })).toHaveAttribute("href", "/login");
    await new Promise((r) => setTimeout(r, 50));
    expect(actions.createSaleAction).toHaveBeenCalledTimes(1);
  });
});

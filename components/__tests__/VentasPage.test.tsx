import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

type Role = "owner" | "manager" | "collaborator";
const session = vi.hoisted(() => ({
  value: { data: { user: { id: "u1", role: "owner", locationId: null } }, status: "authenticated" } as {
    data: unknown;
    status: string;
  },
}));
vi.mock("next-auth/react", () => ({ useSession: () => session.value }));

const actions = vi.hoisted(() => ({
  getDashboardAction: vi.fn(),
  getLowStockThresholdAction: vi.fn(),
  setLowStockThresholdAction: vi.fn(),
  confirmSalePaymentAction: vi.fn(),
  cancelSaleAction: vi.fn(),
  fetchLocationsAction: vi.fn(),
}));
vi.mock("@/lib/sales/dashboard-actions", () => ({
  getDashboardAction: actions.getDashboardAction,
  getLowStockThresholdAction: actions.getLowStockThresholdAction,
  setLowStockThresholdAction: actions.setLowStockThresholdAction,
}));
vi.mock("@/lib/sales/actions", () => ({
  confirmSalePaymentAction: actions.confirmSalePaymentAction,
  cancelSaleAction: actions.cancelSaleAction,
}));
vi.mock("@/lib/actions", () => ({ fetchLocationsAction: actions.fetchLocationsAction }));

import VentasPage from "@/app/ventas/page";

const threeHoursAgo = () => new Date(Date.now() - 3 * 3_600_000).toISOString();

function dashboard() {
  return {
    soldTotal: 1234.5,
    collectedTotal: 1000,
    salesCount: 7,
    byDay: [
      { date: "2026-11-05", total: 400, count: 2 },
      { date: "2026-11-06", total: 834.5, count: 5 },
    ],
    byLocation: [{ locationId: "l1", total: 1234.5 }],
    byChannel: [{ channel: "store", total: 1000 }, { channel: "whatsapp", total: 234.5 }],
    byPaymentMethod: [{ method: "spay_transfer", total: 234.5 }, { method: "cash", total: 1000 }],
    byBrand: [{ brandId: "b1", name: "Acme", units: 3, total: 900 }],
    byDepartment: [{ departmentId: "d1", name: "Mujer", units: 4, total: 1234.5 }],
    pendingPayments: [{ saleId: "s1", number: 12, total: 234.5, locationId: "l1", createdAt: threeHoursAgo() }],
    lowStock: [
      { variantId: "v1", locationId: "l1", productTitle: "Playera", size: "M", available: 0, threshold: 2 },
    ],
  };
}

function setRole(role: Role, locationId: string | null = null) {
  session.value = { data: { user: { id: "u1", role, locationId } }, status: "authenticated" };
}

beforeEach(() => {
  vi.clearAllMocks();
  setRole("owner");
  actions.getDashboardAction.mockImplementation(async (req = {}) => ({
    query: { from: req.from ?? "2026-11-06", to: req.to ?? "2026-11-06", locationIds: "all", pendingScope: "all_dates" },
    data: dashboard(),
  }));
  actions.getLowStockThresholdAction.mockResolvedValue(2);
  actions.fetchLocationsAction.mockResolvedValue([{ id: "l1", name: "Centro" }]);
});

describe("VentasPage", () => {
  it("el collaborator ve Hoy sin selector de rango", async () => {
    setRole("collaborator", "l1");
    render(<VentasPage />);
    await screen.findByTestId("card-vendido");
    expect(screen.getByText(/hoy/i)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /rango/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "7 días" })).not.toBeInTheDocument();
  });

  it("el owner ve el selector con Hoy, 7 días, 30 días y Personalizado", async () => {
    render(<VentasPage />);
    await screen.findByTestId("card-vendido");
    const group = screen.getByRole("group", { name: /rango/i });
    for (const name of ["Hoy", "7 días", "30 días", "Personalizado"]) {
      expect(within(group).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("elegir 7 días pide el rango al servidor", async () => {
    render(<VentasPage />);
    await screen.findByTestId("card-vendido");
    fireEvent.click(screen.getByRole("button", { name: "7 días" }));
    await waitFor(() => {
      const last = actions.getDashboardAction.mock.calls.at(-1)![0];
      expect(last.from < last.to).toBe(true);
    });
  });

  it("las tarjetas muestran Vendido, Cobrado y Ventas", async () => {
    render(<VentasPage />);
    await screen.findByTestId("card-vendido");
    expect(screen.getByText("Vendido")).toBeInTheDocument();
    expect(screen.getByTestId("card-vendido")).toHaveTextContent("$1,234.50");
    expect(screen.getByTestId("card-cobrado")).toHaveTextContent("$1,000.00");
    expect(screen.getByTestId("card-ventas")).toHaveTextContent("7");
  });

  it("muestra los nombres de tienda, no los ids", async () => {
    render(<VentasPage />);
    await screen.findByTestId("card-vendido");
    expect((await screen.findAllByText("Centro")).length).toBeGreaterThan(0);
    expect(screen.queryByText("l1")).not.toBeInTheDocument();
  });

  it("cobros pendientes muestra la antigüedad y confirmar pide referencia opcional", async () => {
    actions.confirmSalePaymentAction.mockResolvedValue({ ok: true, sale: {} });
    render(<VentasPage />);
    await screen.findByText(/hace 3 h/);
    fireEvent.click(screen.getByRole("button", { name: /confirmar pago/i }));
    const ref = screen.getByLabelText(/referencia spay/i);
    fireEvent.change(ref, { target: { value: "ABC123" } });
    fireEvent.click(screen.getByRole("button", { name: /^confirmar$/i }));
    await waitFor(() => expect(actions.confirmSalePaymentAction).toHaveBeenCalledWith("s1", "ABC123"));
    await waitFor(() => expect(actions.getDashboardAction.mock.calls.length).toBeGreaterThan(1));
  });

  it("confirmar sin referencia manda undefined", async () => {
    actions.confirmSalePaymentAction.mockResolvedValue({ ok: true, sale: {} });
    render(<VentasPage />);
    await screen.findByText(/hace 3 h/);
    fireEvent.click(screen.getByRole("button", { name: /confirmar pago/i }));
    fireEvent.click(screen.getByRole("button", { name: /^confirmar$/i }));
    await waitFor(() => expect(actions.confirmSalePaymentAction).toHaveBeenCalledWith("s1", undefined));
  });

  it("el manager confirma pagos pero no anula", async () => {
    setRole("manager");
    render(<VentasPage />);
    await screen.findByText(/hace 3 h/);
    expect(screen.getByRole("button", { name: /confirmar pago/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /anular/i })).not.toBeInTheDocument();
  });

  it("el collaborator no confirma ni anula", async () => {
    setRole("collaborator", "l1");
    render(<VentasPage />);
    await screen.findByText(/hace 3 h/);
    expect(screen.queryByRole("button", { name: /confirmar pago/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /anular/i })).not.toBeInTheDocument();
  });

  it("anular exige motivo y respuesta Sí/No sin opción por omisión", async () => {
    actions.cancelSaleAction.mockResolvedValue({ ok: true, sale: {} });
    render(<VentasPage />);
    await screen.findByText(/hace 3 h/);
    fireEvent.click(screen.getByRole("button", { name: /^anular/i }));
    const yes = screen.getByRole("radio", { name: "Sí" });
    const no = screen.getByRole("radio", { name: "No" });
    expect(yes).not.toBeChecked();
    expect(no).not.toBeChecked();
    expect(screen.getByText(/¿la prenda regresó a la tienda\?/i)).toBeInTheDocument();

    const submit = screen.getByRole("button", { name: /confirmar anulación/i });
    fireEvent.click(submit);
    expect(actions.cancelSaleAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/motivo/i);

    fireEvent.change(screen.getByLabelText(/motivo/i), { target: { value: "Talla equivocada" } });
    fireEvent.click(submit);
    expect(actions.cancelSaleAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/regresó/i);

    fireEvent.click(no);
    fireEvent.click(submit);
    await waitFor(() => expect(actions.cancelSaleAction).toHaveBeenCalledWith("s1", "Talla equivocada", false));
  });

  it("muestra el mensaje del servidor si la acción falla", async () => {
    actions.confirmSalePaymentAction.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "Solo el dueño." });
    render(<VentasPage />);
    await screen.findByText(/hace 3 h/);
    fireEvent.click(screen.getByRole("button", { name: /confirmar pago/i }));
    fireEvent.click(screen.getByRole("button", { name: /^confirmar$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Solo el dueño.");
  });

  it("stock bajo muestra el umbral y el owner lo edita", async () => {
    actions.setLowStockThresholdAction.mockResolvedValue({ ok: true });
    render(<VentasPage />);
    const table = await screen.findByRole("table", { name: /stock bajo/i });
    expect(within(table).getByText("Playera")).toBeInTheDocument();
    expect(screen.getByText(/umbral ≤ 2/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/umbral de stock bajo/i), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar umbral/i }));
    await waitFor(() => expect(actions.setLowStockThresholdAction).toHaveBeenCalledWith(5));
  });

  it("solo el owner edita el umbral", async () => {
    setRole("manager");
    render(<VentasPage />);
    await screen.findByRole("table", { name: /stock bajo/i });
    expect(screen.getByText(/umbral ≤ 2/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/umbral de stock bajo/i)).not.toBeInTheDocument();
  });
});

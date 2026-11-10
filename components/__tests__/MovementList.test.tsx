import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const actions = vi.hoisted(() => ({
  listMovementsAction: vi.fn(),
  movementFilterOptionsAction: vi.fn(),
}));
vi.mock("@/lib/inventory/movement-actions", () => actions);
vi.mock("@/lib/actions", () => ({
  searchProductsAction: vi.fn().mockResolvedValue([]),
  fetchProductsAction: vi.fn(),
  getProductByBarcodeAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/movimientos", useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
const session = vi.hoisted(() => ({ role: "owner" as string }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { role: session.role } }, status: "authenticated" }) }));

import { MovementList } from "@/app/movimientos/MovementList";
import type { MovementRow } from "@/lib/data/source";

function row(over: Partial<MovementRow> = {}): MovementRow {
  return {
    id: "m1",
    // 2026-11-10 20:10Z = 14:10 en México
    timestamp: "2026-11-10T20:10:00.000Z",
    productTitle: "Playera",
    size: "M",
    locationName: "Lomas",
    type: "DAMAGE",
    typeLabel: "Merma",
    delta: -1,
    userName: "Carlos",
    notes: "mancha en la manga",
    saleNumber: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  session.role = "owner";
  actions.movementFilterOptionsAction.mockResolvedValue({
    locations: [{ id: "l1", name: "Lomas" }],
    users: [{ id: "u1", name: "Carlos" }],
  });
});

describe("MovementList", () => {
  it("muestra fecha y hora de México, tipo, delta con signo menos, quién y motivo", async () => {
    actions.listMovementsAction.mockResolvedValue({ rows: [row()], nextCursor: null });
    render(<MovementList />);
    expect(await screen.findByText("Merma")).toBeInTheDocument();
    expect(screen.getByText("10 nov · 14:10")).toBeInTheDocument();
    expect(screen.getByText("−1")).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getByText(/Carlos/)).toBeInTheDocument();
    expect(screen.getByText(/Motivo: mancha en la manga/)).toBeInTheDocument();
    expect(screen.getByText("Mostrando hoy · hora de México")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver más" })).toBeNull();
  });

  it("venta: folio V-; traspaso: Nota:", async () => {
    actions.listMovementsAction.mockResolvedValue({
      rows: [
        row({ id: "a", type: "SALE", typeLabel: "Venta", notes: null, saleNumber: 42, delta: -1 }),
        row({ id: "b", type: "TRANSFER", typeLabel: "Traspaso", notes: "exhibición", delta: 1 }),
      ],
      nextCursor: null,
    });
    render(<MovementList />);
    expect(await screen.findByText(/Folio V-0042/)).toBeInTheDocument();
    expect(screen.getByText(/Nota: exhibición/)).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("estado vacío", async () => {
    actions.listMovementsAction.mockResolvedValue({ rows: [], nextCursor: null });
    render(<MovementList />);
    expect(await screen.findByText("No hay movimientos con estos filtros.")).toBeInTheDocument();
  });

  it("'Ver más' pide la siguiente página con nextCursor, agrega renglones y desaparece con null", async () => {
    actions.listMovementsAction
      .mockResolvedValueOnce({ rows: [row({ id: "m1" })], nextCursor: "m1" })
      .mockResolvedValueOnce({ rows: [row({ id: "m2", notes: "otra" })], nextCursor: null });
    render(<MovementList />);
    const more = await screen.findByRole("button", { name: "Ver más" });
    fireEvent.click(more);
    await waitFor(() => expect(screen.getByText(/Motivo: otra/)).toBeInTheDocument());
    expect(actions.listMovementsAction).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "m1" }));
    expect(screen.getByText(/Motivo: mancha en la manga/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver más" })).toBeNull();
  });

  it("rango de 94 días: muestra el error del servidor en role=alert", async () => {
    actions.listMovementsAction
      .mockResolvedValueOnce({ rows: [], nextCursor: null })
      .mockResolvedValue({ error: "El rango máximo es de 93 días." });
    render(<MovementList />);
    await screen.findByText("No hay movimientos con estos filtros.");
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-11-10" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("El rango máximo es de 93 días.");
  });

  it("sesión vencida (null): aviso con enlace a /login", async () => {
    actions.listMovementsAction.mockResolvedValue(null);
    render(<MovementList />);
    expect(await screen.findByText(/Tu sesión terminó/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login");
  });

  it("colaborador: tienda y fechas deshabilitadas con texto, no ocultas", async () => {
    session.role = "collaborator";
    actions.listMovementsAction.mockResolvedValue({ rows: [], nextCursor: null });
    render(<MovementList />);
    await screen.findByText("No hay movimientos con estos filtros.");
    expect(screen.getByLabelText("Tienda")).toBeDisabled();
    expect(screen.getByLabelText("Desde")).toBeDisabled();
    expect(screen.getByLabelText("Hasta")).toBeDisabled();
    expect(screen.getByText(/Solo tu tienda y el día de hoy/)).toBeInTheDocument();
  });

  it("cambiar el tipo vuelve a pedir desde la primera página con ese tipo", async () => {
    actions.listMovementsAction.mockResolvedValue({ rows: [row()], nextCursor: null });
    render(<MovementList />);
    await screen.findByText("Merma");
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "DAMAGE" } });
    await waitFor(() =>
      expect(actions.listMovementsAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: "DAMAGE" })),
    );
    expect(actions.listMovementsAction.mock.calls.at(-1)![0].cursor).toBeUndefined();
  });
});

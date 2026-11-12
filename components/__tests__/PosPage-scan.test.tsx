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
  scannerRenders: vi.fn(),
  onScan: { current: null as null | ((c: string) => void) },
}));
vi.mock("@/lib/actions", () => ({
  lookupCodeAction: actions.lookupCodeAction,
  fetchLocationsAction: actions.fetchLocationsAction,
}));
vi.mock("@/lib/sales/actions", () => ({ createSaleAction: actions.createSaleAction }));
vi.mock("@/components/inventory/Scanner", () => ({
  Scanner: ({ onScan, continuous }: { onScan: (c: string) => void; continuous?: boolean }) => {
    actions.scannerRenders();
    actions.onScan.current = onScan;
    return <div data-testid="scanner" data-continuous={continuous ? "1" : "0"} />;
  },
}));

import POSPage from "@/app/pos/page";

const found = (id: string, size: string, stock?: { available: number; sold: boolean }) => ({
  found: true as const,
  variantId: id,
  ...(stock ? { stock } : {}),
  product: {
    id: `p-${id}`,
    title: "Playera",
    category: "Ropa",
    brand: "Acme",
    imageUrl: null,
    variants: [{ id, sku: `SKU-${id}`, title: size, size, color: null, price: 100, barcode: null, inventory: [] }],
  },
});

const scan = (code: string) => act(() => actions.onScan.current!(code));

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  actions.fetchLocationsAction.mockResolvedValue([{ id: "l1", name: "Centro" }]);
  actions.lookupCodeAction.mockResolvedValue(found("v1", "M", { available: 5, sold: false }));
});

async function ready() {
  render(<POSPage />);
  await screen.findByDisplayValue("Centro");
}

describe("/pos escaneo continuo", () => {
  it("escanear no vuelve a montar el escáner: el mock de Scanner se renderiza una sola vez", async () => {
    await ready();
    const first = screen.getByTestId("scanner");
    expect(first).toHaveAttribute("data-continuous", "1");
    scan("111");
    await screen.findByText(/Agregado: Playera/);
    expect(screen.getByTestId("scanner")).toBe(first);
  });

  it("escanear muestra la fila pendiente del código y, al llegar la consulta, agrega 'Agregado: … ×1'", async () => {
    let resolve!: (v: unknown) => void;
    actions.lookupCodeAction.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await ready();
    scan("111");
    expect(await screen.findByText("Buscando 111…")).toBeInTheDocument();
    resolve(found("v1", "M", { available: 5, sold: false }));
    expect(await screen.findByText("Agregado: Playera (M) · ×1")).toBeInTheDocument();
    expect(screen.queryByText("Buscando 111…")).toBeNull();
    expect(actions.lookupCodeAction).toHaveBeenCalledWith("111", "l1");
  });

  it("mismo código dos veces muestra '×2' y no crea una línea nueva", async () => {
    await ready();
    scan("111");
    await screen.findByText("Agregado: Playera (M) · ×1");
    scan("111");
    await screen.findByText("Agregado: Playera (M) · ×2");
    expect(screen.getAllByText("Playera")).toHaveLength(1);
    expect(screen.getByText("×2")).toBeInTheDocument();
  });

  it("talla sin existencias en la tienda elegida no agrega la línea y muestra 'Sin existencias de la talla M en esta tienda'", async () => {
    actions.lookupCodeAction.mockResolvedValue(found("v1", "M", { available: 0, sold: false }));
    await ready();
    scan("111");
    expect(await screen.findByText("Sin existencias de la talla M en esta tienda")).toBeInTheDocument();
    expect(screen.getByText("Aún no hay prendas en la venta")).toBeInTheDocument();
  });

  it("lectura con error de red deja la fila del código en Reintentar y no la duplica", async () => {
    actions.lookupCodeAction.mockRejectedValueOnce(new Error("red"));
    await ready();
    scan("111");
    const retry = await screen.findByRole("button", { name: "Reintentar 111" });
    expect(screen.getAllByRole("button", { name: /reintentar 111/i })).toHaveLength(1);
    fireEvent.click(retry);
    await screen.findByText("Agregado: Playera (M) · ×1");
    expect(actions.lookupCodeAction).toHaveBeenCalledTimes(2);
    expect(actions.lookupCodeAction).toHaveBeenLastCalledWith("111", "l1");
    expect(screen.queryByRole("button", { name: /reintentar 111/i })).toBeNull();
  });

  it("prenda vendida sin piezas en /pos muestra solo 'Sin existencias de la talla M en esta tienda'", async () => {
    actions.lookupCodeAction.mockResolvedValue(found("v1", "M", { available: 0, sold: true }));
    await ready();
    scan("111");
    expect(await screen.findByText("Sin existencias de la talla M en esta tienda")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar nuevamente" })).toBeNull();
  });

  it("una segunda lectura del mismo código mientras busca no abre otra consulta", async () => {
    let resolve!: (v: unknown) => void;
    actions.lookupCodeAction.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await ready();
    scan("111");
    scan("111");
    expect(actions.lookupCodeAction).toHaveBeenCalledTimes(1);
    resolve(found("v1", "M"));
    await waitFor(() => expect(screen.getByText("Playera")).toBeInTheDocument());
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchProductsAction = vi.hoisted(() => vi.fn());
const fetchLocationsAction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions", () => ({
  fetchProductsAction,
  fetchLocationsAction,
  createLocationAction: vi.fn(),
  updateProductImageAction: vi.fn(),
  uploadProductImageAction: vi.fn(),
  setProductBackImageAction: vi.fn(),
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/sales/dashboard-actions", () => ({ getLowStockThresholdAction: vi.fn().mockResolvedValue(1) }));
vi.mock("@/lib/products/actions", () => ({}));
vi.mock("@/lib/catalog/actions", () => ({ listProductTypesAction: async () => [] }));
vi.mock("react-barcode", () => ({ default: () => null }));

import Home from "@/app/page";
import ProductosPage from "@/app/productos/page";
import EtiquetasPage from "@/app/etiquetas/page";

const pages: [string, () => React.ReactElement][] = [
  ["/", () => <Home />],
  ["/productos", () => <ProductosPage />],
  ["/etiquetas", () => <EtiquetasPage />],
];

describe.each(pages)("pantalla de staff %s", (_name, page) => {
  beforeEach(() => {
    fetchProductsAction.mockReset();
    fetchLocationsAction.mockReset();
    fetchLocationsAction.mockResolvedValue([]);
  });

  it("con sesión vencida (null) avisa y enlaza a /login", async () => {
    fetchProductsAction.mockResolvedValue(null);
    render(page());
    expect(await screen.findByText("Tu sesión terminó. Vuelve a iniciar sesión.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login");
  });

  it("sin conexión muestra el aviso y Reintentar vuelve a llamar", async () => {
    fetchProductsAction.mockRejectedValue(new Error("red"));
    render(page());
    expect(await screen.findByText(/No hay conexión\./)).toBeInTheDocument();
    const calls = fetchProductsAction.mock.calls.length;
    fetchProductsAction.mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(fetchProductsAction.mock.calls.length).toBeGreaterThan(calls));
    await waitFor(() => expect(screen.queryByText(/No hay conexión/)).toBeNull());
  });

  it("mientras carga dice Cargando… y nunca '0 productos'", async () => {
    fetchProductsAction.mockReturnValue(new Promise(() => undefined));
    render(page());
    expect(screen.getByText("Cargando…")).toBeInTheDocument();
    expect(screen.queryByText(/\b0 productos\b/)).toBeNull();
  });
});

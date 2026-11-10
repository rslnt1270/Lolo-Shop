import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const session = vi.hoisted(() => ({ value: { data: { user: { role: "owner" } }, status: "authenticated" } as { data: unknown; status: string } }));
vi.mock("next-auth/react", () => ({ useSession: () => session.value }));

const base = vi.hoisted(() => ({
  fetchProductsAction: vi.fn(),
  fetchLocationsAction: vi.fn(),
  assignDepartmentAction: vi.fn(),
}));
vi.mock("@/lib/actions", () => ({
  fetchProductsAction: base.fetchProductsAction,
  fetchLocationsAction: base.fetchLocationsAction,
  updateProductImageAction: vi.fn(),
  uploadProductImageAction: vi.fn(),
  setProductBackImageAction: vi.fn(),
}));
vi.mock("@/lib/products/actions", () => ({
  assignDepartmentAction: base.assignDepartmentAction,
  listPriceChangesAction: vi.fn().mockResolvedValue([]),
  updateVariantPriceAction: vi.fn(),
  updateProductAction: vi.fn(),
  setProductActiveAction: vi.fn(),
  setVariantActiveAction: vi.fn(),
}));
vi.mock("@/lib/catalog/actions", () => ({
  listBrandsAction: vi.fn().mockResolvedValue([]),
  listDepartmentsAction: vi.fn().mockResolvedValue([
    { id: "d1", slug: "dama", name: "Dama" },
    { id: "d2", slug: "hombre", name: "Hombre" },
  ]),
}));
vi.mock("../products/ProductPhotoCapture", () => ({ ProductPhotoCapture: () => null }));

import ProductosPage from "@/app/productos/page";

const p = (id: string, title: string) => ({
  id, title, category: "Playeras", brand: "Guess", imageUrl: null, backImageUrl: null, publicCode: null,
  variants: [{ id: `${id}-v`, sku: id, title: "M", size: "M", color: "General", price: 300, barcode: null, inventory: [] }],
});

beforeEach(() => {
  vi.clearAllMocks();
  session.value = { data: { user: { role: "owner" } }, status: "authenticated" };
  base.fetchProductsAction.mockResolvedValue([p("p1", "Playera"), p("p2", "Gorra")]);
  base.fetchLocationsAction.mockResolvedValue([{ id: "l1", name: "Lomas" }]);
});

describe("/productos: ficha y departamento en lote", () => {
  it("tocar Ver ficha abre la ficha del producto", async () => {
    render(<ProductosPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir la ficha de Playera" }));
    expect(await screen.findByRole("dialog", { name: "Ficha del producto" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Regresar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("selecciona varios y asigna departamento", async () => {
    base.assignDepartmentAction.mockResolvedValue({ ok: true, updated: 2 });
    render(<ProductosPage />);
    expect(screen.queryByRole("button", { name: /asignar departamento/i })).toBeNull();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Seleccionar Playera" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar Gorra" }));
    fireEvent.click(screen.getByRole("button", { name: /^asignar departamento \(2\)/i }));
    fireEvent.change(await screen.findByLabelText(/^departamento para 2 productos/i), { target: { value: "d2" } });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
    await waitFor(() => expect(base.assignDepartmentAction).toHaveBeenCalledWith(["p1", "p2"], "d2"));
    expect(await screen.findByText("2 productos pasaron a Hombre.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /asignar departamento/i })).toBeNull();
  });

  it("si el servidor rechaza, muestra su mensaje y conserva la selección", async () => {
    base.assignDepartmentAction.mockResolvedValue({ ok: false, code: "INVALID", message: "Puedes asignar hasta 100 productos a la vez." });
    render(<ProductosPage />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Seleccionar Playera" }));
    fireEvent.click(screen.getByRole("button", { name: /^asignar departamento/i }));
    fireEvent.change(await screen.findByLabelText(/^departamento para/i), { target: { value: "d1" } });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Puedes asignar hasta 100 productos a la vez.");
    expect(screen.getByRole("checkbox", { name: "Seleccionar Playera" })).toBeChecked();
  });

  it("el colaborador no ve casillas ni ficha", async () => {
    session.value = { data: { user: { role: "collaborator" } }, status: "authenticated" };
    render(<ProductosPage />);
    await screen.findByText("Playera");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /ficha/i })).toBeNull();
    expect(base.fetchLocationsAction).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const session = vi.hoisted(() => ({ role: "owner" as string }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { role: session.role } } }) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

const fetchProductsAction = vi.fn();
vi.mock("@/lib/actions", () => ({
  fetchProductsAction: (...a: unknown[]) => fetchProductsAction(...a),
  fetchLocationsAction: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/catalog/actions", () => ({
  listDepartmentsAction: vi.fn().mockResolvedValue([
    { id: "d1", slug: "dama", name: "Dama" },
    { id: "d4", slug: "calzado", name: "Calzado" },
  ]),
  listProductTypesAction: vi.fn().mockResolvedValue([
    { id: "t1", slug: "playera", name: "Playeras", departmentIds: ["d1"] },
    { id: "t2", slug: "tenis", name: "Tenis", departmentIds: ["d4"] },
  ]),
  listBrandsAction: vi.fn().mockResolvedValue([]),
}));
const assignDepartmentAction = vi.fn();
const assignProductTypeAction = vi.fn();
vi.mock("@/lib/products/actions", () => ({
  assignDepartmentAction: (...a: unknown[]) => assignDepartmentAction(...a),
  assignProductTypeAction: (...a: unknown[]) => assignProductTypeAction(...a),
  listPriceChangesAction: vi.fn().mockResolvedValue([]),
  updateProductAction: vi.fn(), setProductActiveAction: vi.fn(), setVariantActiveAction: vi.fn(), updateVariantPriceAction: vi.fn(),
}));
vi.mock("@/components/products/ProductPhotoButton", () => ({ ProductPhotoButton: () => null }));

import ProductosPage from "@/app/productos/page";

const mk = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: `Prod ${id}`, brand: "Lolo", category: "Playeras", imageUrl: null, backImageUrl: null,
  publicCode: null, departmentId: "d1", productTypeId: "t1", style: null, audience: null, variants: [], ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  session.role = "owner";
  fetchProductsAction.mockResolvedValue([mk("a"), mk("b"), mk("c"), mk("z", { productTypeId: null, category: "General" })]);
});

async function ready() {
  await screen.findByText("Prod a");
}

describe("/productos: tipos", () => {
  it("chip Por revisar solo para owner y manager", async () => {
    render(<ProductosPage />);
    await ready();
    expect(await screen.findByRole("button", { name: /por revisar/i })).toBeInTheDocument();
  });

  it("colaborador no ve Por revisar", async () => {
    session.role = "collaborator";
    render(<ProductosPage />);
    await ready();
    expect(screen.queryByRole("button", { name: /por revisar/i })).toBeNull();
  });

  it("Por revisar filtra los productos con problemas", async () => {
    render(<ProductosPage />);
    await ready();
    fireEvent.click(await screen.findByRole("button", { name: /por revisar/i }));
    expect(screen.getByText("Prod z")).toBeInTheDocument();
    expect(screen.queryByText("Prod a")).toBeNull();
  });

  it("Asignar tipo con 3 seleccionados muestra 'Se asignó el tipo a 3 productos.'", async () => {
    assignProductTypeAction.mockResolvedValue({ ok: true, updated: 3 });
    render(<ProductosPage />);
    await ready();
    for (const t of ["a", "b", "c"]) fireEvent.click(screen.getByLabelText(`Seleccionar Prod ${t}`));
    fireEvent.click(screen.getByRole("button", { name: /asignar tipo/i }));
    fireEvent.change(await screen.findByLabelText(/^tipo para/i), { target: { value: "t1" } });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
    expect(await screen.findByText("Se asignó el tipo a 3 productos.")).toBeInTheDocument();
    expect(assignProductTypeAction).toHaveBeenCalledWith(["a", "b", "c"], "t1");
  });

  it("Asignar tipo con styleCleared 1 muestra 'Se quitó el estilo a 1 porque no aplica a ese tipo.'", async () => {
    assignProductTypeAction.mockResolvedValue({ ok: true, updated: 1, styleCleared: 1 });
    render(<ProductosPage />);
    await ready();
    fireEvent.click(screen.getByLabelText("Seleccionar Prod a"));
    fireEvent.click(screen.getByRole("button", { name: /asignar tipo/i }));
    fireEvent.change(await screen.findByLabelText(/^tipo para/i), { target: { value: "t1" } });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
    expect(await screen.findByText(/Se quitó el estilo a 1 porque no aplica a ese tipo\./)).toBeInTheDocument();
  });

  it("tras assignDepartmentAction que deja TIPO_NO_APLICA avisa 'quedaron por revisar' sin error", async () => {
    assignDepartmentAction.mockResolvedValue({ ok: true, updated: 1 });
    render(<ProductosPage />);
    await ready();
    fireEvent.click(screen.getByLabelText("Seleccionar Prod a"));
    fireEvent.click(screen.getByRole("button", { name: /asignar departamento/i }));
    fireEvent.change(await screen.findByLabelText(/^departamento para/i), { target: { value: "d4" } });
    // la recarga devuelve el producto en Calzado con un tipo de Dama
    fetchProductsAction.mockResolvedValue([mk("a", { departmentId: "d4" }), mk("b"), mk("c")]);
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
    const status = await screen.findByRole("status");
    await waitFor(() => expect(status.textContent).toMatch(/quedaron por revisar/));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("los chips de tipo salen de listProductTypesAction (hay Playeras, no Hoodies)", async () => {
    render(<ProductosPage />);
    await ready();
    const sel = await screen.findByLabelText("Categoría");
    await waitFor(() => expect(sel.textContent).toContain("Playeras"));
    expect(sel.textContent).not.toContain("Hoodies");
  });
});

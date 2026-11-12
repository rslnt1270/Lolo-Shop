import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const session = vi.hoisted(() => ({ value: { data: { user: { role: "owner" } }, status: "authenticated" } as { data: unknown; status: string } }));
vi.mock("next-auth/react", () => ({ useSession: () => session.value }));

const base = vi.hoisted(() => ({
  fetchProductsAction: vi.fn(),
  fetchLocationsAction: vi.fn(),
  setProductPublishedAction: vi.fn(),
}));
vi.mock("@/lib/actions", () => ({
  fetchProductsAction: base.fetchProductsAction,
  fetchLocationsAction: base.fetchLocationsAction,
  updateProductImageAction: vi.fn(),
  uploadProductImageAction: vi.fn(),
  setProductBackImageAction: vi.fn(),
  setCatalogPhotosAction: vi.fn(),
}));
vi.mock("@/lib/products/actions", () => ({
  assignDepartmentAction: vi.fn(),
  assignProductTypeAction: vi.fn(),
  setProductPublishedAction: base.setProductPublishedAction,
  listPriceChangesAction: vi.fn().mockResolvedValue([]),
  updateVariantPriceAction: vi.fn(),
  updateProductAction: vi.fn(),
  setProductActiveAction: vi.fn(),
  setVariantActiveAction: vi.fn(),
}));
vi.mock("@/lib/catalog/actions", () => ({
  listBrandsAction: vi.fn().mockResolvedValue([]),
  listProductTypesAction: vi.fn().mockResolvedValue([]),
  listDepartmentsAction: vi.fn().mockResolvedValue([]),
}));

import ProductosPage from "@/app/productos/page";

const locs = [
  { id: "l1", name: "Lomas", type: "store", isPublic: true },
  { id: "l2", name: "Bodega", type: "warehouse", isPublic: false },
];
const stock = (loc: string, n: number) => [{ id: `v-${loc}`, sku: "S", title: "M", size: "M", color: "General", price: 300, barcode: null, inventory: [{ locationId: loc, available: n }] }];
const prod = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id, title, category: "Playeras", brand: "Guess", publicCode: "K7Q2M", createdAt: "2026-11-01T00:00:00.000Z",
  imageUrl: `https://blob/${id}-f.jpg`, backImageUrl: `https://blob/${id}-b.jpg`, description: "Playera lisa", isPublished: false,
  variants: stock("l1", 2), ...over,
});

const pending = prod("p1", "Playera");
const all = () => [
  pending,
  prod("p2", "Sin atrás", { backImageUrl: null }),
  prod("p3", "Solo bodega", { variants: stock("l2", 4) }),
  prod("p4", "Ya publicada", { isPublished: true }),
  prod("p5", "Sin descripción", { description: null, createdAt: "2026-10-01T00:00:00.000Z" }),
];

beforeEach(() => {
  vi.clearAllMocks();
  session.value = { data: { user: { role: "owner" } }, status: "authenticated" };
  base.fetchProductsAction.mockResolvedValue(all());
  base.fetchLocationsAction.mockResolvedValue(locs);
  base.setProductPublishedAction.mockResolvedValue({ ok: true });
});

const toggle = () => screen.findByRole("button", { name: /^Por publicar \(/ });

describe("/productos: Por publicar", () => {
  it("owner ve Por publicar con el conteo de productos con dos fotos y existencias sin publicar", async () => {
    render(<ProductosPage />);
    expect(await toggle()).toHaveTextContent("Por publicar (2)");
  });

  it("manager también lo ve; el colaborador no", async () => {
    session.value = { data: { user: { role: "manager" } }, status: "authenticated" };
    const { unmount } = render(<ProductosPage />);
    expect(await toggle()).toBeInTheDocument();
    unmount();
    session.value = { data: { user: { role: "collaborator" } }, status: "authenticated" };
    render(<ProductosPage />);
    await screen.findByRole("button", { name: "Abrir la ficha de Playera" });
    expect(screen.queryByRole("button", { name: /^Por publicar/ })).toBeNull();
  });

  it("un producto sin foto de atrás, sin existencias en tienda pública o ya publicado no entra", async () => {
    render(<ProductosPage />);
    fireEvent.click(await toggle());
    expect(screen.getByText("Playera")).toBeInTheDocument();
    expect(screen.getByText("Sin descripción")).toBeInTheDocument();
    for (const t of ["Sin atrás", "Solo bodega", "Ya publicada"]) expect(screen.queryByText(t)).toBeNull();
  });

  it("ordena los más antiguos primero", async () => {
    render(<ProductosPage />);
    fireEvent.click(await toggle());
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(["Sin descripción", "Playera"]);
  });

  it("cada fila tiene Abrir foto de frente y de atrás con el enlace a la foto", async () => {
    render(<ProductosPage />);
    fireEvent.click(await toggle());
    const front = screen.getByRole("link", { name: "Abrir foto de frente de Playera" });
    expect(front).toHaveAttribute("href", "https://blob/p1-f.jpg");
    expect(front).toHaveAttribute("target", "_blank");
    expect(front).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "Abrir foto de atrás de Playera" })).toHaveAttribute("href", "https://blob/p1-b.jpg");
  });

  it("Reemplazar foto abre la captura desde la galería (input sin capture)", async () => {
    render(<ProductosPage />);
    fireEvent.click(await toggle());
    const row = screen.getByText("Playera").closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /Reemplazar foto de frente/ }));
    const input = row.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input).not.toHaveAttribute("capture");
  });

  it("producto sin descripción aparece con Falta la descripción y Publicar deshabilitado", async () => {
    render(<ProductosPage />);
    fireEvent.click(await toggle());
    const row = screen.getByText("Sin descripción").closest("li") as HTMLElement;
    expect(within(row).getByText("Falta la descripción.")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Publicar" })).toBeDisabled();
  });

  it("Publicar, tras confirmar, recarga y el producto sale de la lista", async () => {
    render(<ProductosPage />);
    fireEvent.click(await toggle());
    const row = screen.getByText("Playera").closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Publicar" }));
    base.fetchProductsAction.mockResolvedValue(all().map((p) => (p.id === "p1" ? { ...p, isPublished: true } : p)));
    fireEvent.click(within(row).getByRole("button", { name: "Sí, publicar" }));
    await waitFor(() => expect(base.setProductPublishedAction).toHaveBeenCalledWith("p1", true));
    await waitFor(() => expect(screen.queryByText("Playera")).toBeNull());
    expect(screen.getByRole("button", { name: /^Por publicar \(1\)/ })).toBeInTheDocument();
  });

  it("Por revisar y Por publicar no están activos a la vez", async () => {
    render(<ProductosPage />);
    const pub = await toggle();
    const rev = screen.getByRole("button", { name: /^Por revisar/ });
    fireEvent.click(rev);
    expect(rev).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(pub);
    expect(pub).toHaveAttribute("aria-pressed", "true");
    expect(rev).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(rev);
    expect(rev).toHaveAttribute("aria-pressed", "true");
    expect(pub).toHaveAttribute("aria-pressed", "false");
  });

  it("Ver ficha abre la ficha del producto", async () => {
    render(<ProductosPage />);
    fireEvent.click(await toggle());
    const row = screen.getByText("Playera").closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Abrir la ficha de Playera" }));
    expect(await screen.findByRole("dialog", { name: "Ficha del producto" })).toBeInTheDocument();
  });
});

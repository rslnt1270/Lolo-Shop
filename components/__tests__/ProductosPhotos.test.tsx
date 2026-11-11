import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchProductsAction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions", () => ({
  fetchProductsAction,
  fetchLocationsAction: vi.fn().mockResolvedValue([]),
  setCatalogPhotosAction: vi.fn().mockResolvedValue({ ok: true }),
  updateProductImageAction: vi.fn().mockResolvedValue({ ok: true }),
  uploadProductImageAction: vi.fn(),
  setProductBackImageAction: vi.fn().mockResolvedValue({ ok: true }),
}));
// La lista también ofrece la ficha y la selección a owner y manager; estas pruebas son de fotos y no hay sesión.
const session = vi.hoisted(() => ({ value: { data: null, status: "unauthenticated" } as { data: unknown; status: string } }));
vi.mock("next-auth/react", () => ({ useSession: () => session.value }));
vi.mock("@/lib/products/actions", () => ({
  listPriceChangesAction: vi.fn().mockResolvedValue([]),
  updateVariantPriceAction: vi.fn(),
  updateProductAction: vi.fn(),
  setProductActiveAction: vi.fn(),
  setVariantActiveAction: vi.fn(),
}));
vi.mock("@/lib/catalog/actions", () => ({
  listProductTypesAction: async () => [],
  listBrandsAction: async () => [],
  listDepartmentsAction: async () => [],
}));
vi.mock("../products/ProductPhotoCapture", () => ({
  ProductPhotoCapture: ({ onCapture }: { onCapture: (f: File) => void }) => (
    <button type="button" onClick={() => onCapture(new File(["x"], "p.jpg", { type: "image/jpeg" }))}>capturar</button>
  ),
}));

import ProductosPage from "@/app/productos/page";

const checked = "2026-11-11T00:00:00.000Z";
const owner = () => { session.value = { data: { user: { role: "owner" } }, status: "authenticated" }; };
const openSheet = async () => fireEvent.click(await screen.findByRole("button", { name: "Abrir la ficha de Gorra" }));
const base = { id: "p1", title: "Gorra", category: "Accesorios", brand: "Lolo", publicCode: "K7Q2M", variants: [] };

describe("/productos: fotos de frente y atrás", () => {
  beforeEach(() => {
    session.value = { data: null, status: "unauthenticated" };
  });

  it("C17: la lista de /productos no muestra el botón de foto", async () => {
    owner();
    fetchProductsAction.mockResolvedValue([{ ...base, imageUrl: null, backImageUrl: null }]);
    render(<ProductosPage />);
    await screen.findByRole("button", { name: "Abrir la ficha de Gorra" });
    expect(screen.queryByRole("button", { name: /foto/i })).toBeNull();
    await openSheet();
    expect(await screen.findByRole("button", { name: /fotos de catálogo/i })).toBeInTheDocument();
  });

  it("un producto con fotos revisadas ofrece cambiar frente y atrás desde la ficha", async () => {
    owner();
    fetchProductsAction.mockResolvedValue([{ ...base, imageUrl: "https://a/f.jpg", backImageUrl: "https://a/b.jpg", catalogPhotosCheckedAt: checked }]);
    render(<ProductosPage />);
    await openSheet();
    expect(await screen.findByRole("button", { name: "Cambiar foto de frente de Gorra" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar foto de atrás de Gorra" })).toBeInTheDocument();
  });

  it.each([
    [{ imageUrl: null, backImageUrl: null }, "Faltan las dos fotos para el catálogo"],
    [{ imageUrl: null, backImageUrl: "https://a/b.jpg" }, "Falta la foto de frente"],
    [{ imageUrl: "https://a/f.jpg", backImageUrl: null }, "Falta la foto de atrás"],
  ])("dice exactamente qué foto falta: %#", async (photos, copy) => {
    fetchProductsAction.mockResolvedValue([{ ...base, ...photos }]);
    render(<ProductosPage />);
    expect(await screen.findByText(copy)).toBeInTheDocument();
  });

  it("con las dos fotos no hay aviso de faltante", async () => {
    fetchProductsAction.mockResolvedValue([{ ...base, imageUrl: "https://a/f.jpg", backImageUrl: "https://a/b.jpg" }]);
    render(<ProductosPage />);
    await screen.findByText("Gorra");
    expect(screen.queryByText(/falta/i)).toBeNull();
  });

  it("Cancelar mide al menos 44 px y el aviso de éxito sigue visible en una región en vivo", async () => {
    owner();
    fetchProductsAction.mockResolvedValue([{ ...base, imageUrl: null, backImageUrl: null, catalogPhotosCheckedAt: checked }]);
    render(<ProductosPage />);
    await openSheet();
    fireEvent.click(await screen.findByRole("button", { name: "Agregar foto de frente de Gorra" }));
    expect(screen.getByRole("button", { name: "Cancelar" }).className).toMatch(/min-h-\[44px\]/);
    fireEvent.click(screen.getByText("capturar"));
    await waitFor(() => expect(screen.getAllByRole("status")[0]).toHaveTextContent("Foto de frente actualizada."));
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Foto de frente actualizada.");
  });

  it('"Guardando…" se anuncia en la región en vivo', async () => {
    let finish!: () => void;
    const actions = await import("@/lib/actions");
    vi.mocked(actions.updateProductImageAction).mockReturnValueOnce(new Promise<{ ok: true }>((r) => (finish = () => r({ ok: true }))) as never);
    owner();
    fetchProductsAction.mockResolvedValue([{ ...base, imageUrl: null, backImageUrl: null, catalogPhotosCheckedAt: checked }]);
    render(<ProductosPage />);
    await openSheet();
    fireEvent.click(await screen.findByRole("button", { name: "Agregar foto de frente de Gorra" }));
    fireEvent.click(screen.getByText("capturar"));
    await waitFor(() => expect(screen.getAllByRole("status")[0]).toHaveTextContent("Guardando…"));
    finish();
    await waitFor(() => expect(screen.getAllByRole("status")[0]).toHaveTextContent("Foto de frente actualizada."));
  });
});

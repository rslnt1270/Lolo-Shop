import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { DuplicateGroup } from "@/lib/domain/size-duplicates";
import type { Product } from "@/lib/domain/types";

const mergeProductsAction = vi.fn();
vi.mock("@/lib/products/actions", () => ({ mergeProductsAction: (i: unknown) => mergeProductsAction(i) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { MergeGroups } from "@/app/productos/unir/MergeGroups";

const prod = (id: string, size: string, over: Partial<Product> = {}): Product => ({
  id, title: `Polo Nautica - ${size}`, category: "Polos", brand: "Nautica", imageUrl: "https://x.invalid/f.jpg",
  brandId: "b", departmentId: "d", createdAt: "2026-01-01T00:00:00.000Z",
  variants: [{ id: `v-${id}`, sku: "S", title: size, size, color: "", price: 300, barcode: null, inventory: [{ locationId: "l1", available: 2 }, { locationId: "l2", available: 1 }] }],
  ...over,
});

const group: DuplicateGroup = {
  key: "k",
  products: [prod("a", "M", { backImageUrl: "https://x.invalid/b.jpg" }), prod("b", "L"), prod("c", "XL")],
  suggestedTargetId: "a",
};
const locations = [{ id: "l1", name: "Lomas" }, { id: "l2", name: "ClubAlva" }];
const saleCounts = { a: 1, b: 2, c: 0 };

const setup = (over: Partial<Parameters<typeof MergeGroups>[0]> = {}) =>
  render(<MergeGroups groups={[group]} locations={locations} saleCounts={saleCounts} isOwner {...over} />);

beforeEach(() => {
  vi.clearAllMocks();
  mergeProductsAction.mockResolvedValue({ ok: true, movedVariants: 2, movedSaleLines: 2, alreadyMerged: 0 });
});

describe("MergeGroups", () => {
  it("muestra cada producto con su talla, piezas por tienda y ventas", () => {
    setup();
    expect(screen.getAllByRole("img").length).toBeGreaterThan(0);
    const card = screen.getByTestId("merge-item-b");
    expect(within(card).getByText(/Talla L/)).toBeTruthy();
    expect(within(card).getByText(/Lomas: 2/)).toBeTruthy();
    expect(within(card).getByText(/ClubAlva: 1/)).toBeTruthy();
    expect(within(card).getByText(/2 ventas/)).toBeTruthy();
  });

  it("marca como sugerido el producto que se queda", () => {
    setup();
    expect(within(screen.getByTestId("merge-item-a")).getByText("Se queda")).toBeTruthy();
    expect((screen.getByRole("radio", { name: /Polo Nautica - M/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("la confirmación lista lo que se mueve antes de llamar a la acción", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Unir 3 productos/ }));
    expect(screen.getByText(/Se moverán 2 tallas y 2 ventas a «Polo Nautica - M»/)).toBeTruthy();
    expect(mergeProductsAction).not.toHaveBeenCalled();
  });

  it("confirmar llama a la acción con el destino y los demás como origen", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Unir 3 productos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar unión" }));
    await waitFor(() => expect(mergeProductsAction).toHaveBeenCalledWith({ targetId: "a", sourceIds: ["b", "c"] }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Listo/));
    expect(refresh).toHaveBeenCalled();
  });

  it("permite elegir otro producto que se queda", async () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: /Polo Nautica - L/ }));
    fireEvent.click(screen.getByRole("button", { name: /Unir 3 productos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar unión" }));
    await waitFor(() => expect(mergeProductsAction).toHaveBeenCalledWith({ targetId: "b", sourceIds: ["a", "c"] }));
  });

  it("Cancelar cierra la confirmación sin llamar a la acción", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Unir 3 productos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText(/Se moverán/)).toBeNull();
    expect(mergeProductsAction).not.toHaveBeenCalled();
  });

  it("un error de la acción se muestra", async () => {
    mergeProductsAction.mockResolvedValue({ ok: false, code: "INVALID", message: "Las marcas no coinciden." });
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Unir 3 productos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar unión" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Las marcas no coinciden/));
  });

  it("quien no es owner ve el aviso y ningún botón de unir", () => {
    setup({ isOwner: false });
    expect(screen.getByText("Solo el dueño puede unir productos.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Unir/ })).toBeNull();
  });

  it("sin grupos avisa que no hay duplicados", () => {
    setup({ groups: [] });
    expect(screen.getByText(/No encontramos productos duplicados/)).toBeTruthy();
  });
});

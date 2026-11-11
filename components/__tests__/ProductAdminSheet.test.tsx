import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const products = vi.hoisted(() => ({
  updateVariantPriceAction: vi.fn(),
  listPriceChangesAction: vi.fn(),
  updateProductAction: vi.fn(),
  setProductActiveAction: vi.fn(),
  setVariantActiveAction: vi.fn(),
}));
vi.mock("@/lib/products/actions", () => products);
vi.mock("@/lib/catalog/actions", () => ({
  listBrandsAction: vi.fn().mockResolvedValue([
    { id: "b1", name: "Guess", slug: "guess" },
    { id: "b2", name: "Nike", slug: "nike" },
  ]),
  listDepartmentsAction: vi.fn().mockResolvedValue([
    { id: "d1", slug: "dama", name: "Dama" },
    { id: "d2", slug: "hombre", name: "Hombre" },
  ]),
}));
vi.mock("@/components/products/ProductPhotoButton", () => ({
  ProductPhotoButton: ({ side }: { side?: string }) => <button type="button">foto {side ?? "front"}</button>,
}));

import { ProductAdminSheet } from "@/components/products/ProductAdminSheet";
import type { Product } from "@/lib/domain/types";

const product: Product = {
  id: "p1",
  title: "Playera lisa",
  brand: "Guess",
  brandId: "b1",
  departmentId: "d1",
  category: "Playeras",
  publicCode: "K7Q2M",
  isActive: true,
  imageUrl: null,
  backImageUrl: null,
  variants: [
    { id: "v1", sku: "S-M", title: "M", size: "M", color: "General", price: 899, barcode: null, inventory: [{ locationId: "l1", available: 3 }] },
    { id: "v2", sku: "S-L", title: "L", size: "L", color: "General", price: 320.5, barcode: null, inventory: [{ locationId: "l1", available: 1 }, { locationId: "l2", available: 4 }] },
  ],
};
const locations = [
  { id: "l1", name: "Lomas" },
  { id: "l2", name: "ClubAlva" },
  { id: "l3", name: "Almacén" },
];

const history = [
  // 10 nov 2026 18:20 en México (UTC-6) = 11 nov 00:20 UTC
  { oldPrice: 899, newPrice: 799, userName: "Lolo", createdAt: "2026-11-11T00:20:00.000Z" },
  { oldPrice: 850, newPrice: 899, userName: "Ana", createdAt: "2026-11-08T18:15:00.000Z" },
  { oldPrice: 800, newPrice: 850, userName: "Lolo", createdAt: "2026-11-04T22:40:00.000Z" },
  { oldPrice: 700, newPrice: 800, userName: "Carlos", createdAt: "2026-11-02T16:05:00.000Z" },
  { oldPrice: 650, newPrice: 700, userName: "Ana", createdAt: "2026-11-01T15:30:00.000Z" },
];

function open(role: "owner" | "manager" | "collaborator" = "owner", p: Product = product) {
  const onChanged = vi.fn();
  const onClose = vi.fn();
  render(<ProductAdminSheet product={p} locations={locations} role={role} onChanged={onChanged} onClose={onClose} />);
  return { onChanged, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  products.listPriceChangesAction.mockImplementation(async (id: string) => (id === "v1" ? history : []));
});

describe("ProductAdminSheet", () => {
  it("owner ve Guardar precio por talla", async () => {
    open();
    expect(await screen.findAllByRole("button", { name: /^guardar precio/i })).toHaveLength(2);
    expect(screen.getByText("Código público: K7Q2M")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /desactivar talla/i })).toHaveLength(2);
  });

  it("muestra las 5 entradas del historial con la hora de México", async () => {
    open();
    expect(await screen.findByText("$899 → $799 · Lolo · 10 nov 18:20")).toBeInTheDocument();
    expect(screen.getByText("$850 → $899 · Ana · 08 nov 12:15")).toBeInTheDocument();
    expect(screen.getByText("$800 → $850 · Lolo · 04 nov 16:40")).toBeInTheDocument();
    expect(screen.getByText("$700 → $800 · Carlos · 02 nov 10:05")).toBeInTheDocument();
    expect(screen.getByText("$650 → $700 · Ana · 01 nov 09:30")).toBeInTheDocument();
  });

  it("guarda el precio con el precio esperado, el motivo y avisa del cambio", async () => {
    products.updateVariantPriceAction.mockResolvedValue({ ok: true, price: 799 });
    const { onChanged } = open();
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    fireEvent.change(screen.getByLabelText("Precio de la talla M"), { target: { value: "799" } });
    fireEvent.change(screen.getByLabelText("Motivo (opcional) de la talla M"), { target: { value: "Promoción" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar precio de la talla M" }));
    await waitFor(() =>
      expect(products.updateVariantPriceAction).toHaveBeenCalledWith({
        variantId: "v1",
        newPrice: 799,
        expectedPrice: 899,
        reason: "Promoción",
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(await screen.findByText("Precio guardado.")).toBeInTheDocument();
  });

  it("CONFLICT muestra el precio vigente y el siguiente guardado usa ese precio como esperado", async () => {
    products.updateVariantPriceAction
      .mockResolvedValueOnce({ ok: false, code: "CONFLICT", message: "x", currentPrice: 850 })
      .mockResolvedValueOnce({ ok: true, price: 799 });
    open();
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    fireEvent.change(screen.getByLabelText("Precio de la talla M"), { target: { value: "799" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar precio de la talla M" }));
    expect(
      await screen.findByText("Alguien cambió este precio. Precio vigente: $850. Revisa y guarda de nuevo."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar precio de la talla M" }));
    await waitFor(() => expect(products.updateVariantPriceAction).toHaveBeenCalledTimes(2));
    expect(products.updateVariantPriceAction.mock.calls[1][0]).toMatchObject({ expectedPrice: 850, newPrice: 799 });
  });

  it("'1,250' guarda 1250 (la coma separa miles)", async () => {
    products.updateVariantPriceAction.mockResolvedValue({ ok: true, price: 1250 });
    open();
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    fireEvent.change(screen.getByLabelText("Precio de la talla M"), { target: { value: "1,250" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar precio de la talla M" }));
    await waitFor(() => expect(products.updateVariantPriceAction).toHaveBeenCalledTimes(1));
    expect(products.updateVariantPriceAction.mock.calls[0][0]).toMatchObject({ variantId: "v1", newPrice: 1250, expectedPrice: 899 });
  });

  it("'1,234.50' guarda 1234.5", async () => {
    products.updateVariantPriceAction.mockResolvedValue({ ok: true, price: 1234.5 });
    open();
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    fireEvent.change(screen.getByLabelText("Precio de la talla M"), { target: { value: "1,234.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar precio de la talla M" }));
    await waitFor(() => expect(products.updateVariantPriceAction).toHaveBeenCalledTimes(1));
    expect(products.updateVariantPriceAction.mock.calls[0][0]).toMatchObject({ newPrice: 1234.5 });
  });

  it("un precio con tres decimales no se manda", async () => {
    open();
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    fireEvent.change(screen.getByLabelText("Precio de la talla M"), { target: { value: "1.250" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar precio de la talla M" }));
    expect(await screen.findByText("Escribe un precio válido.")).toBeInTheDocument();
    expect(products.updateVariantPriceAction).not.toHaveBeenCalled();
  });

  it("bajar a menos de la mitad pide confirmación antes de guardar", async () => {
    products.updateVariantPriceAction.mockResolvedValue({ ok: true, price: 125 });
    open();
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    fireEvent.change(screen.getByLabelText("Precio de la talla M"), { target: { value: "125" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar precio de la talla M" }));
    expect(await screen.findByText("¿Bajar de $899 a $125?")).toBeInTheDocument();
    expect(products.updateVariantPriceAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "No, revisar" }));
    expect(screen.queryByText("¿Bajar de $899 a $125?")).toBeNull();
    expect(products.updateVariantPriceAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar precio de la talla M" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sí, bajar" }));
    await waitFor(() => expect(products.updateVariantPriceAction).toHaveBeenCalledTimes(1));
    expect(products.updateVariantPriceAction.mock.calls[0][0]).toMatchObject({ newPrice: 125, expectedPrice: 899 });
  });

  it("'350,50' muestra el aviso del punto y no se manda", async () => {
    open();
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    fireEvent.change(screen.getByLabelText("Precio de la talla M"), { target: { value: "350,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar precio de la talla M" }));
    expect(await screen.findByText("Usa punto para los centavos: 350.50")).toBeInTheDocument();
    expect(products.updateVariantPriceAction).not.toHaveBeenCalled();
  });

  it("subir a más del doble pide confirmación antes de guardar", async () => {
    products.updateVariantPriceAction.mockResolvedValue({ ok: true, price: 2000 });
    open();
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    fireEvent.change(screen.getByLabelText("Precio de la talla M"), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar precio de la talla M" }));
    expect(await screen.findByText("¿Subir de $899 a $2,000?")).toBeInTheDocument();
    expect(products.updateVariantPriceAction).not.toHaveBeenCalled();
  });

  it("sesión vencida al guardar precio: avisa con enlace y no lanza", async () => {
    products.updateVariantPriceAction.mockResolvedValue(undefined);
    open();
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    fireEvent.change(screen.getByLabelText("Precio de la talla M"), { target: { value: "799" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar precio de la talla M" }));
    expect(await screen.findByText(/Tu sesión terminó/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login");
    expect(screen.queryByText(/No se pudo guardar/)).toBeNull();
  });

  it("sesión vencida al guardar los datos: avisa con enlace", async () => {
    products.updateProductAction.mockResolvedValue(undefined);
    open();
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Playera nueva" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText(/Tu sesión terminó/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toBeInTheDocument();
  });

  it("sesión vencida al desactivar: avisa con enlace", async () => {
    products.setProductActiveAction.mockResolvedValue(undefined);
    open();
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    fireEvent.click(screen.getByRole("button", { name: "Desactivar producto" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, desactivar" }));
    expect(await screen.findByText(/Tu sesión terminó/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toBeInTheDocument();
  });

  it("INVALID del servidor aparece bajo el campo", async () => {
    products.updateVariantPriceAction.mockResolvedValue({ ok: false, code: "INVALID", message: "Ese ya es el precio actual." });
    open();
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    fireEvent.click(screen.getByRole("button", { name: "Guardar precio de la talla M" }));
    expect(await screen.findByText("Ese ya es el precio actual.")).toBeInTheDocument();
  });

  it("Desactivar producto pide confirmación y Cancelar no desactiva", async () => {
    open();
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    expect(screen.queryByText("¿Desactivar Playera lisa?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Desactivar producto" }));
    expect(screen.getByText("¿Desactivar Playera lisa?")).toBeInTheDocument();
    expect(
      screen.getByText("Deja de verse en el catálogo y no se puede vender. El historial se conserva y puedes reactivarlo."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(products.setProductActiveAction).not.toHaveBeenCalled();
    expect(screen.queryByText("¿Desactivar Playera lisa?")).toBeNull();
  });

  it("Sí, desactivar llama a la acción y avisa del cambio", async () => {
    products.setProductActiveAction.mockResolvedValue({ ok: true });
    const { onChanged } = open();
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    fireEvent.click(screen.getByRole("button", { name: "Desactivar producto" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, desactivar" }));
    await waitFor(() => expect(products.setProductActiveAction).toHaveBeenCalledWith("p1", false));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("un producto inactivo ofrece Reactivar producto", async () => {
    products.setProductActiveAction.mockResolvedValue({ ok: true });
    open("owner", { ...product, isActive: false });
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    expect(screen.queryByRole("button", { name: "Desactivar producto" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reactivar producto" }));
    await waitFor(() => expect(products.setProductActiveAction).toHaveBeenCalledWith("p1", true));
  });

  it("Desactivar talla también pide confirmación", async () => {
    products.setVariantActiveAction.mockResolvedValue({ ok: true });
    open();
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    fireEvent.click(screen.getByRole("button", { name: "Desactivar talla M" }));
    expect(screen.getByText("¿Desactivar la talla M?")).toBeInTheDocument();
    expect(products.setVariantActiveAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, desactivar" }));
    await waitFor(() => expect(products.setVariantActiveAction).toHaveBeenCalledWith("v1", false));
  });

  it("Guardar cambios manda solo lo que cambió", async () => {
    products.updateProductAction.mockResolvedValue({ ok: true });
    open();
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Playera básica" } });
    fireEvent.change(screen.getByLabelText("Departamento"), { target: { value: "d2" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() =>
      expect(products.updateProductAction).toHaveBeenCalledWith({ productId: "p1", title: "Playera básica", departmentId: "d2" }),
    );
  });

  it("el stock por tienda se muestra en lectura, con la nota y raya donde no hay fila", async () => {
    open();
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    const table = screen.getByRole("table", { name: "Stock por tienda" });
    const lomas = within(table).getByRole("row", { name: /Lomas/ });
    expect(within(lomas).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Lomas", "3", "1", "4"]);
    const club = within(table).getByRole("row", { name: /ClubAlva/ });
    expect(within(club).getAllByRole("cell").map((c) => c.textContent)).toEqual(["ClubAlva", "—", "4", "4"]);
    expect(screen.getByText("Solo lectura. Para sumar piezas usa Escanear.")).toBeInTheDocument();
    expect(within(table).queryAllByRole("textbox")).toHaveLength(0);
  });

  it("los botones miden al menos 44 px", async () => {
    open();
    await screen.findAllByRole("button", { name: /^guardar precio/i });
    for (const name of ["Guardar precio de la talla M", "Desactivar talla M", "Desactivar producto", "Guardar cambios"]) {
      expect(screen.getByRole("button", { name }).className).toMatch(/min-h-\[44px\]/);
    }
  });

  it("el colaborador ve la sección de precio y puede guardarlo", async () => {
    open("collaborator");
    expect(await screen.findByRole("region", { name: "Precio por talla" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /guardar/i }).length).toBeGreaterThan(0);
    expect(products.listPriceChangesAction).toHaveBeenCalled();
  });

  it("el colaborador no ve datos del producto ni desactivar, pero sí el stock", async () => {
    open("collaborator");
    expect(await screen.findByRole("table", { name: "Stock por tienda" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Datos del producto" })).toBeNull();
    expect(screen.queryByRole("button", { name: /desactivar/i })).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("el colaborador ve en Stock por tienda solo su tienda", async () => {
    // El servidor ya recortó: solo llegan filas de l1.
    const scoped: Product = {
      ...product,
      variants: product.variants.map((v) => ({ ...v, inventory: v.inventory.filter((l) => l.locationId === "l1") })),
    };
    open("collaborator", scoped);
    const table = await screen.findByRole("table", { name: "Stock por tienda" });
    expect(within(table).getByRole("row", { name: /Lomas/ })).toBeInTheDocument();
    expect(within(table).queryByRole("row", { name: /ClubAlva/ })).toBeNull();
    expect(within(table).queryByRole("row", { name: /Almacén/ })).toBeNull();
  });
});

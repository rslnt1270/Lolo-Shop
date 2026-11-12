import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";
import { SaleCart } from "../sales/SaleCart";
import { formatPrice } from "@/lib/public/format";
import { useSaleDraft, type DraftLine } from "@/lib/sales/use-sale-draft";
import type { VariantMatch } from "@/lib/data/source";

const match = (id: string, price: number, title = "Playera"): VariantMatch => ({
  product: { id: `p-${id}`, title, category: "Ropa", brand: "Acme", imageUrl: null, variants: [] },
  variant: {
    id,
    sku: `SKU-${id}`,
    title: "M / Negro",
    size: "M",
    color: "Negro",
    price,
    barcode: null,
    inventory: [],
  },
});

const line = (over: Partial<DraftLine> = {}): DraftLine => ({
  variantId: "v1",
  sku: "SKU-v1",
  productTitle: "Playera",
  variantTitle: "M / Negro",
  imageUrl: null,
  listPrice: 199.95,
  unitPrice: 199.95,
  quantity: 2,
  available: null,
  ...over,
});

describe("useSaleDraft", () => {
  it("escanear el mismo código dos veces deja una línea con cantidad 2", () => {
    const { result } = renderHook(() => useSaleDraft());
    act(() => result.current.add(match("v1", 199.95)));
    act(() => result.current.add(match("v1", 199.95)));
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0].quantity).toBe(2);
  });

  it("prellena el precio con Variant.price y permite cambiarlo", () => {
    const { result } = renderHook(() => useSaleDraft());
    act(() => result.current.add(match("v1", 199.95)));
    expect(result.current.lines[0].unitPrice).toBe(199.95);
    act(() => result.current.setPrice("v1", 150));
    expect(result.current.lines[0].unitPrice).toBe(150);
    expect(result.current.lines[0].listPrice).toBe(199.95);
  });

  it("setQty ignora valores inválidos y remove quita la línea", () => {
    const { result } = renderHook(() => useSaleDraft());
    act(() => result.current.add(match("v1", 10)));
    act(() => result.current.setQty("v1", 0));
    act(() => result.current.setQty("v1", Number.NaN));
    expect(result.current.lines[0].quantity).toBe(1);
    act(() => result.current.setQty("v1", 3.7));
    expect(result.current.lines[0].quantity).toBe(3);
    act(() => result.current.remove("v1"));
    expect(result.current.lines).toHaveLength(0);
  });

  it("el clientRequestId solo cambia con reset()", () => {
    const { result } = renderHook(() => useSaleDraft());
    const first = result.current.clientRequestId;
    act(() => result.current.add(match("v1", 10)));
    act(() => result.current.setQty("v1", 2));
    expect(result.current.clientRequestId).toBe(first);
    act(() => result.current.reset());
    expect(result.current.clientRequestId).not.toBe(first);
    expect(result.current.lines).toHaveLength(0);
  });
});

describe("SaleCart", () => {
  const handlers = { onSetQty: vi.fn(), onSetPrice: vi.fn(), onRemove: vi.fn() };

  it("muestra el total como $399.90", () => {
    render(<SaleCart lines={[line()]} canEditPrice {...handlers} />);
    expect(screen.getByTestId("sale-total")).toHaveTextContent("$399.90");
    expect(formatPrice(1234.5)).toBe("$1,234.50");
    expect(formatPrice(350)).toBe("$350");
  });

  it("owner y manager editan el precio unitario", () => {
    const onSetPrice = vi.fn();
    render(<SaleCart lines={[line()]} canEditPrice {...handlers} onSetPrice={onSetPrice} />);
    const input = screen.getByLabelText(/precio unitario de playera/i);
    expect(input).toHaveValue("199.95");
    fireEvent.change(input, { target: { value: "150" } });
    expect(onSetPrice).toHaveBeenCalledWith("v1", 150);
  });

  it("el collaborator ve el precio de lista solo lectura", () => {
    render(<SaleCart lines={[line()]} canEditPrice={false} {...handlers} />);
    expect(screen.queryByLabelText(/precio unitario/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("$199.95").length).toBeGreaterThan(0);
  });

  it("cambia cantidad con los botones y quita la línea", () => {
    const onSetQty = vi.fn();
    const onRemove = vi.fn();
    render(<SaleCart lines={[line()]} canEditPrice {...handlers} onSetQty={onSetQty} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /sumar una pieza de playera/i }));
    expect(onSetQty).toHaveBeenCalledWith("v1", 3);
    fireEvent.click(screen.getByRole("button", { name: /quitar playera/i }));
    expect(onRemove).toHaveBeenCalledWith("v1");
  });

  it("muestra el error de la línea junto a ella", () => {
    render(<SaleCart lines={[line()]} canEditPrice lineErrors={{ v1: "Solo hay 1 de esta prenda." }} {...handlers} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Solo hay 1 de esta prenda.");
  });

  it("sin líneas invita a escanear", () => {
    render(<SaleCart lines={[]} canEditPrice {...handlers} />);
    expect(screen.getByText(/escanea una prenda/i)).toBeInTheDocument();
  });

  it("el campo de precio se sincroniza cuando el precio cambia desde fuera", () => {
    const { rerender } = render(<SaleCart lines={[line()]} canEditPrice {...handlers} />);
    const input = screen.getByLabelText(/precio unitario de playera/i);
    expect(input).toHaveValue("199.95");
    rerender(<SaleCart lines={[line({ unitPrice: 250 })]} canEditPrice {...handlers} />);
    expect(screen.getByLabelText(/precio unitario de playera/i)).toHaveValue("250");
  });

  it("precio vacío o inválido muestra el error en vez de ignorarse", () => {
    render(<SaleCart lines={[line()]} canEditPrice {...handlers} />);
    const input = screen.getByLabelText(/precio unitario de playera/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Escribe un precio de 0 en adelante.")).toBeInTheDocument();
  });
});

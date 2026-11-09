import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductCard } from "@/components/products/ProductCard";

const fetchProductsAction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions", () => ({ fetchProductsAction }));
vi.mock("react-barcode", () => ({ default: ({ value }: { value: string }) => <svg data-testid="barcode" data-value={value} /> }));

import EtiquetasPage from "@/app/etiquetas/page";

const product = (publicCode: string | null) => ({
  id: "p1",
  title: "Chamarra",
  category: "Chamarras",
  brand: "Guess",
  imageUrl: null,
  publicCode,
  variants: [
    { id: "v1", sku: "CH-M", title: "M / Azul", size: "M", color: "Azul", price: 899, barcode: null, inventory: [{ locationId: "l1", available: 2 }] },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Código público en pantallas del personal", () => {
  it("/productos (ProductCard) muestra Código K7Q2M", () => {
    render(<ProductCard product={product("K7Q2M")} />);
    expect(screen.getByText(/Código/)).toHaveTextContent("Código K7Q2M");
  });

  it("ProductCard sin código público no muestra la línea", () => {
    render(<ProductCard product={product(null)} />);
    expect(screen.queryByText(/Código/)).not.toBeInTheDocument();
  });

  it("/etiquetas muestra Código K7Q2M en la etiqueta", async () => {
    fetchProductsAction.mockResolvedValue([product("K7Q2M")]);
    render(<EtiquetasPage />);
    expect(await screen.findByText(/Código/)).toHaveTextContent("Código K7Q2M");
  });
});

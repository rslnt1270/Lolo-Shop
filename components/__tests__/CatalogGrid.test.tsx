import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CatalogGrid } from "../virtual-store/CatalogGrid";
import { VirtualStoreCatalog } from "../virtual-store/VirtualStoreCatalog";
import { DEFAULT_HOTSPOTS_CONFIG } from "@/lib/virtual-store/zones";
import { EMPTY_CATALOG_TEXT, NO_WHATSAPP_TEXT } from "@/lib/public/whatsapp";
import type { PublicProduct } from "@/lib/data/public-projection";

vi.mock("next/navigation", () => ({
  usePathname: () => "/catalogo",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const NUM = "52" + "0".repeat(10);

const make = (i: number): PublicProduct => ({
  id: `id-interno-${i}`,
  publicCode: i === 0 ? "K7Q2M" : `C${i}XXX`,
  title: `Prenda de prueba ${i}`,
  brand: "Marca de prueba",
  category: "Playeras",
  imageUrl: `https://example.invalid/f${i}.jpg`,
  backImageUrl: `https://example.invalid/a${i}.jpg`,
  sizes: [
    { size: "M", available: true, price: 100 + i },
    { size: "L", available: true, price: 100 + i },
  ],
  price: 100 + i,
  department: null,
});
const twelve = Array.from({ length: 12 }, (_, i) => make(i));

// "LS-" va en mayúsculas (formato del SKU): en minúsculas coincidiría con clases como "grid-cols-2".
function expectNoInternalData(html: string) {
  expect(html).not.toMatch(/LS-[A-Z0-9]/);
  expect(html).not.toMatch(/sku|barcode|piezas|existencias/i);
}

afterEach(() => {
  vi.unstubAllEnvs();
  cleanup();
});

describe("CatalogGrid: favorito y Ver prenda", () => {
  it("cada tarjeta tiene el favorito como botón principal y Ver prenda como segunda acción", () => {
    render(<CatalogGrid products={twelve.slice(0, 2)} onSelect={() => {}} />);
    const card = within(screen.getAllByRole("listitem")[0]);
    const fav = card.getByRole("button", { name: /Guardar en favoritos/ });
    const ver = card.getByRole("button", { name: /^Ver prenda/ });
    expect(fav.className).toContain("bg-turquesa");
    expect(ver.className).toContain("border-turquesa-texto");
    expect(ver.className).not.toContain("bg-turquesa ");
  });
  it("Ver prenda llama onSelect con la prenda", () => {
    const onSelect = vi.fn();
    render(<CatalogGrid products={twelve.slice(0, 1)} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /^Ver prenda/ }));
    expect(onSelect).toHaveBeenCalledWith(twelve[0]);
  });
  it("el favorito no llama onSelect", () => {
    const onSelect = vi.fn();
    window.localStorage.clear();
    render(<CatalogGrid products={twelve.slice(0, 1)} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Guardar en favoritos/ }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /En favoritos/ })).toBeInTheDocument();
  });
  it("la tarjeta no contiene 'Consultar por WhatsApp' ni enlaces wa.me", () => {
    const { container } = render(<CatalogGrid products={twelve.slice(0, 3)} onSelect={() => {}} />);
    expect(container.textContent).not.toMatch(/Consultar por WhatsApp/);
    expect(container.querySelector('a[href*="wa.me"]')).toBeNull();
  });
});

describe("CatalogGrid", () => {
  it("lista un elemento por producto y avisa cuál se elige", () => {
    const onSelect = vi.fn();
    render(<CatalogGrid products={twelve.slice(0, 3)} onSelect={onSelect} />);
    const items = within(screen.getByRole("list", { name: "Prendas" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    fireEvent.click(within(items[1]).getByRole("button", { name: /^Ver prenda/ }));
    expect(onSelect).toHaveBeenCalledWith(twelve[1]);
  });

  it("muestra marca, nombre y precio; no inventa precio si falta", () => {
    render(<CatalogGrid products={[{ ...make(1), price: null }, make(2)]} onSelect={() => {}} />);
    expect(screen.getAllByText("Marca de prueba")).toHaveLength(2);
    expect(screen.getByText("Prenda de prueba 2")).toBeInTheDocument();
    expect(screen.getByText("$102")).toBeInTheDocument();
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
  });
});

const sz = (size: string, available: boolean, price: number) => ({ size, available, price });
const withSizes = (sizes: PublicProduct["sizes"], price: number | null = null): PublicProduct => ({
  ...make(1),
  sizes,
  price: price ?? Math.min(...sizes.map((s) => s.price)),
});

describe("CatalogGrid: tallas y precio por producto", () => {
  it("precios distintos: 'Desde $X' y la talla agotada con nombre accesible", () => {
    render(<CatalogGrid products={[withSizes([sz("S", false, 300), sz("M", true, 350)])]} onSelect={() => {}} />);
    expect(screen.getByText("Desde $300")).toBeInTheDocument();
    const card = within(screen.getByRole("listitem"));
    expect(card.getByLabelText("S, agotada")).toBeInTheDocument();
    expect(card.getByText("M")).toBeInTheDocument();
  });

  it("precio único: solo '$X', sin 'Desde'", () => {
    render(<CatalogGrid products={[withSizes([sz("S", true, 300), sz("M", true, 300)])]} onSelect={() => {}} />);
    expect(screen.getByText("$300")).toBeInTheDocument();
    expect(screen.queryByText(/Desde/)).not.toBeInTheDocument();
  });

  it("8 tallas: 6 chips y '+2'", () => {
    const eight = ["XS", "S", "M", "L", "XL", "XXL", "28", "30"].map((s) => sz(s, true, 100));
    render(<CatalogGrid products={[withSizes(eight)]} onSelect={() => {}} />);
    const chips = screen.getAllByTestId("size-chip");
    expect(chips).toHaveLength(6);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("6 tallas: sin '+N'", () => {
    const six = ["XS", "S", "M", "L", "XL", "XXL"].map((s) => sz(s, true, 100));
    render(<CatalogGrid products={[withSizes(six)]} onSelect={() => {}} />);
    expect(screen.getAllByTestId("size-chip")).toHaveLength(6);
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
  });

  it("no muestra la palabra Agotado en ninguna tarjeta", () => {
    const { container } = render(
      <CatalogGrid
        products={[
          withSizes([sz("S", false, 300), sz("M", true, 300)]),
          withSizes([sz("S", false, 300), sz("M", false, 300)]),
        ]}
        onSelect={() => {}}
      />,
    );
    expect(container.textContent).not.toMatch(/agotado/i);
  });

  it("la talla sin stock se muestra tachada y sin cifras", () => {
    render(<CatalogGrid products={[withSizes([sz("M", false, 300), sz("L", true, 300)])]} onSelect={() => {}} />);
    const chip = screen.getByLabelText("M, agotada");
    expect(chip.className).toContain("line-through");
    expect(chip.textContent).toBe("M");
    expect(screen.getByLabelText("L").className).not.toContain("line-through");
  });

  it("usa un solo formato de precio MXN, con miles y centavos solo si hacen falta", () => {
    render(<CatalogGrid products={[withSizes([sz("M", true, 1250.5)])]} onSelect={() => {}} />);
    expect(screen.getByText("$1,250.50")).toBeInTheDocument();
  });
});

describe("VirtualStoreCatalog sin bandera de recorrido", () => {
  it("abre en cuadrícula con los 12 productos y sin recorrido ni datos de ejemplo", () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
    const { container } = render(<VirtualStoreCatalog initialProducts={twelve} isLoggedIn={false} />);
    expect(within(screen.getByRole("list", { name: "Prendas" })).getAllByRole("listitem")).toHaveLength(12);
    expect(screen.queryByText(/Recorrido 3D/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tienda Virtual 3D/)).not.toBeInTheDocument();
    for (const h of DEFAULT_HOTSPOTS_CONFIG) {
      expect(container.innerHTML).not.toContain(h.shelfLabel);
      expect(container.innerHTML).not.toContain(h.title);
    }
    expectNoInternalData(container.innerHTML);
  });

  it("sin productos muestra el aviso", () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
    render(<VirtualStoreCatalog initialProducts={[]} isLoggedIn={false} />);
    expect(screen.getByText(EMPTY_CATALOG_TEXT)).toBeInTheDocument();
  });

  it("con número válido el modal NO muestra CTA de WhatsApp ni texto de respaldo (SHOW_WHATSAPP_CTA = false)", () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", NUM);
    const { container } = render(<VirtualStoreCatalog initialProducts={twelve} isLoggedIn={false} />);
    fireEvent.click(within(screen.getAllByRole("listitem")[0]).getByRole("button", { name: /^Ver prenda/ }));
    expect(container.querySelector('a[href^="https://wa.me"]')).toBeNull();
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).toBeNull();
    expect(screen.queryByText(NO_WHATSAPP_TEXT)).not.toBeInTheDocument();
    expectNoInternalData(container.innerHTML);
  });

  it("sin número válido tampoco hay enlace ni texto de respaldo", () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", "");
    const { container } = render(<VirtualStoreCatalog initialProducts={twelve} isLoggedIn={false} />);
    fireEvent.click(within(screen.getAllByRole("listitem")[0]).getByRole("button", { name: /^Ver prenda/ }));
    expect(container.querySelector('a[href^="https://wa.me"]')).toBeNull();
    expect(screen.queryByText(NO_WHATSAPP_TEXT)).not.toBeInTheDocument();
  });
});

describe("Modal: precio por talla", () => {
  it("elegir M muestra $350 y el mensaje lleva 'talla M'; el precio del modal usa el mismo formato", () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", NUM);
    const product = withSizes([sz("S", true, 300), sz("M", true, 350)]);
    render(<VirtualStoreCatalog initialProducts={[product]} isLoggedIn={false} />);
    fireEvent.click(within(screen.getByRole("listitem")).getByRole("button", { name: /^Ver prenda/ }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("$300")).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "M" }));
    expect(dialog.getByText("$350")).toBeInTheDocument();
    expect(dialog.queryByText("$300")).not.toBeInTheDocument();
    expect(dialog.queryByRole("link", { name: /WhatsApp/ })).toBeNull();
  });

  it("la talla agotada tiene nombre accesible '{talla}, agotada'", () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
    const product = withSizes([sz("S", false, 300), sz("M", true, 350)]);
    render(<VirtualStoreCatalog initialProducts={[product]} isLoggedIn={false} />);
    fireEvent.click(within(screen.getByRole("listitem")).getByRole("button", { name: /^Ver prenda/ }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "S, agotada" })).toBeInTheDocument();
  });
});

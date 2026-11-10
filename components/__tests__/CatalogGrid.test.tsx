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
    { size: "M", available: true },
    { size: "L", available: true },
  ],
  price: 100 + i,
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

describe("CatalogGrid", () => {
  it("lista un elemento por producto y avisa cuál se elige", () => {
    const onSelect = vi.fn();
    render(<CatalogGrid products={twelve.slice(0, 3)} onSelect={onSelect} />);
    const items = within(screen.getByRole("list", { name: "Prendas" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    fireEvent.click(within(items[1]).getByRole("button"));
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

  it("con número válido el modal enlaza a wa.me con código y talla, sin id ni SKU", () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", NUM);
    const { container } = render(<VirtualStoreCatalog initialProducts={twelve} isLoggedIn={false} />);
    fireEvent.click(within(screen.getAllByRole("listitem")[0]).getByRole("button"));
    fireEvent.click(screen.getByRole("button", { name: "L" }));
    const link = screen.getByRole("link", { name: /Consultar por WhatsApp/ });
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith(`https://wa.me/${NUM}?text=`)).toBe(true);
    const text = decodeURIComponent(href.split("?text=")[1]);
    expect(text).toContain("Código K7Q2M");
    expect(text).toContain("en talla L");
    expect(text).not.toMatch(/sku|barcode|id-interno/i);
    expectNoInternalData(container.innerHTML);
    expect(screen.queryByText(NO_WHATSAPP_TEXT)).not.toBeInTheDocument();
  });

  it("sin número válido no hay enlace a wa.me y se pide consultar en tienda", () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", "");
    const { container } = render(<VirtualStoreCatalog initialProducts={twelve} isLoggedIn={false} />);
    fireEvent.click(within(screen.getAllByRole("listitem")[0]).getByRole("button"));
    expect(container.querySelector('a[href^="https://wa.me"]')).toBeNull();
    expect(screen.getByText(NO_WHATSAPP_TEXT)).toBeInTheDocument();
  });
});

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StoreMinimap } from "../virtual-store/StoreMinimap";
import { VirtualStoreCatalog } from "../virtual-store/VirtualStoreCatalog";
import { STORE_ZONES } from "@/lib/virtual-store/zones";
import type { PublicProduct } from "@/lib/data/public-projection";
import { ProductHotspotModal } from "../virtual-store/ProductHotspotModal";
import { bindProductsToHotspots } from "@/lib/virtual-store/zones";

// Mock de next/navigation y framer-motion si fuera necesario
vi.mock("next/navigation", () => ({
  usePathname: () => "/catalogo",
}));

describe("Virtual Store Components", () => {
  const sampleProducts: PublicProduct[] = [
    {
      id: "prod-1",
      publicCode: "K7Q2M",
      title: "Playera Test",
      category: "Playeras",
      brand: "LoloShop",
      imageUrl: "https://example.com/frente.jpg",
      backImageUrl: "https://example.com/atras.jpg",
      sizes: [
        { size: "M", available: true },
        { size: "L", available: false },
      ],
      price: 350,
    },
  ];

  it("renderiza el minimapa arquitectónico y responde a la selección de zona", () => {
    const handleSelectZone = vi.fn();

    render(
      <StoreMinimap
        zones={STORE_ZONES}
        currentZoneId="entrada"
        cameraYaw={0}
        onSelectZone={handleSelectZone}
      />
    );

    expect(screen.getByText("Croquis de la Tienda")).toBeInTheDocument();
    expect(screen.getByText("Entrada")).toBeInTheDocument();

    // Minimizar y expandir plano
    const minimizeBtn = screen.getByLabelText("Minimizar plano");
    fireEvent.click(minimizeBtn);

    expect(screen.getByLabelText("Expandir plano")).toBeInTheDocument();
  });

  it("renderiza VirtualStoreCatalog en modo recorrido 3D con zonas accesibles", () => {
    render(
      <VirtualStoreCatalog
        initialProducts={sampleProducts}
        isLoggedIn={false}
      />
    );

    expect(screen.getByText("Tienda Virtual 3D")).toBeInTheDocument();
    expect(screen.getByText("Recorrido 3D")).toBeInTheDocument();
    expect(screen.getByText("Catálogo")).toBeInTheDocument();

    // Verificar botones de zonas
    expect(screen.getByRole("button", { name: /Entrada & Vitrina Principal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Muro de Sneakers & Calzado/i })).toBeInTheDocument();

    // Cambiar a vista de catálogo en cuadrícula
    const gridBtn = screen.getByText("Catálogo");
    fireEvent.click(gridBtn);

    expect(screen.getByText("Catálogo de Productos")).toBeInTheDocument();
  });

  it("el detalle del producto muestra el código público y disponibilidad sí/no, nunca SKU ni conteos", () => {
    const [hotspot] = bindProductsToHotspots(sampleProducts);
    render(<ProductHotspotModal hotspot={hotspot} onClose={() => {}} />);

    expect(screen.getByText("Código K7Q2M")).toBeInTheDocument();
    expect(screen.getByText("Disponible")).toBeInTheDocument();
    expect(screen.queryByText(/SKU/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/disponibles/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "L" }));
    expect(screen.getByText("Agotado en tienda")).toBeInTheDocument();

    const wa = screen.getByRole("link", { name: /Preguntar/i });
    expect(decodeURIComponent(wa.getAttribute("href") ?? "")).toContain("(código K7Q2M), talla L");
  });

  it("sin productos públicos el catálogo muestra un aviso en lugar de prendas de ejemplo", () => {
    render(<VirtualStoreCatalog initialProducts={[]} isLoggedIn={false} />);
    fireEvent.click(screen.getByText("Catálogo"));
    expect(screen.getByText("Pronto verás aquí las prendas de la tienda.")).toBeInTheDocument();
  });
});

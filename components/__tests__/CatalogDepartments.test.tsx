import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { VirtualStoreCatalog } from "../virtual-store/VirtualStoreCatalog";
import type { PublicProduct } from "@/lib/data/public-projection";

let search = "";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/catalogo",
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ push: vi.fn(), replace }),
}));

type Dept = PublicProduct["department"];
const DEPTS: Record<string, NonNullable<Dept>> = {
  dama: { slug: "dama", name: "Dama", sortOrder: 1 },
  caballero: { slug: "caballero", name: "Caballero", sortOrder: 2 },
  calzado: { slug: "calzado", name: "Calzado", sortOrder: 4 },
};

const make = (i: number, department: Dept = null): PublicProduct => ({
  id: `id-${i}`,
  publicCode: `C${i}XXX`,
  title: `Prenda de prueba ${i}`,
  brand: "Marca de prueba",
  category: "Playeras",
  imageUrl: `https://example.invalid/f${i}.jpg`,
  backImageUrl: `https://example.invalid/a${i}.jpg`,
  sizes: [{ size: "M", available: true, price: 100 }],
  price: 100,
  department,
});

const renderCatalog = (products: PublicProduct[]) =>
  render(<VirtualStoreCatalog initialProducts={products} isLoggedIn={false} />);
const cards = () => within(screen.getByRole("list", { name: "Prendas" })).getAllByRole("listitem");

beforeEach(() => {
  search = "";
  replace.mockClear();
});
afterEach(cleanup);

describe("catálogo: Ver más", () => {
  const thirty = Array.from({ length: 30 }, (_, i) => make(i));

  it("muestra 24 tarjetas y 'Ver más' suma el resto y desaparece", () => {
    renderCatalog(thirty);
    expect(cards()).toHaveLength(24);
    fireEvent.click(screen.getByRole("button", { name: "Ver más" }));
    expect(cards()).toHaveLength(30);
    expect(screen.queryByRole("button", { name: "Ver más" })).toBeNull();
  });

  it("con 24 o menos no hay 'Ver más'", () => {
    renderCatalog(thirty.slice(0, 24));
    expect(screen.queryByRole("button", { name: "Ver más" })).toBeNull();
  });

  it("no repite ni salta tarjetas al paginar", () => {
    renderCatalog(thirty);
    fireEvent.click(screen.getByRole("button", { name: "Ver más" }));
    const titles = cards().map((c) => c.textContent);
    expect(new Set(titles).size).toBe(30);
    thirty.forEach((p, i) => expect(titles[i]).toContain(p.title));
  });
});

describe("catálogo: departamentos", () => {
  const mixed = [
    make(0, DEPTS.dama),
    make(1, DEPTS.calzado),
    make(2, DEPTS.caballero),
    make(3, null),
  ];

  it("chips 'Todo' + departamentos presentes, en sortOrder, sin dígitos", () => {
    renderCatalog(mixed);
    const group = screen.getByRole("group", { name: "Departamentos" });
    const chips = within(group).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual(["Todo", "Dama", "Caballero", "Calzado"]);
    chips.forEach((c) => expect(c.textContent).not.toMatch(/\d/));
    expect(screen.getByRole("button", { name: "Todo" })).toHaveAttribute("aria-pressed", "true");
  });

  it("un departamento sin productos no tiene chip", () => {
    renderCatalog(mixed);
    expect(screen.queryByRole("button", { name: "Accesorios" })).toBeNull();
  });

  it("sin ningún departamento no hay chips", () => {
    renderCatalog([make(0), make(1)]);
    expect(screen.queryByRole("group", { name: "Departamentos" })).toBeNull();
  });

  it("?depto=calzado llega filtrado con el chip presionado", () => {
    search = "depto=calzado";
    renderCatalog(mixed);
    expect(screen.getByRole("button", { name: "Calzado" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Todo" })).toHaveAttribute("aria-pressed", "false");
    expect(cards()).toHaveLength(1);
    expect(cards()[0].textContent).toContain("Prenda de prueba 1");
  });

  it("?depto desconocido equivale a Todo", () => {
    search = "depto=inexistente";
    renderCatalog(mixed);
    expect(cards()).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Todo" })).toHaveAttribute("aria-pressed", "true");
  });

  it("un producto sin departamento solo aparece en Todo", () => {
    renderCatalog(mixed);
    expect(cards()).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Dama" }));
    expect(cards()).toHaveLength(1);
    expect(screen.queryByText("Prenda de prueba 3")).toBeNull();
  });

  it("al elegir un chip actualiza la URL sin recargar; 'Todo' quita el parámetro", () => {
    renderCatalog(mixed);
    fireEvent.click(screen.getByRole("button", { name: "Caballero" }));
    expect(replace).toHaveBeenLastCalledWith("/catalogo?depto=caballero", { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: "Todo" }));
    expect(replace).toHaveBeenLastCalledWith("/catalogo", { scroll: false });
  });

  it("cambiar de departamento reinicia el 'Ver más'", () => {
    const many = Array.from({ length: 30 }, (_, i) => make(i, i < 26 ? DEPTS.dama : DEPTS.calzado));
    renderCatalog(many);
    fireEvent.click(screen.getByRole("button", { name: "Ver más" }));
    expect(cards()).toHaveLength(30);
    fireEvent.click(screen.getByRole("button", { name: "Dama" }));
    expect(cards()).toHaveLength(24);
    expect(screen.getByRole("button", { name: "Ver más" })).toBeInTheDocument();
  });

  it("los chips miden al menos 44 px de alto", () => {
    renderCatalog(mixed);
    expect(screen.getByRole("button", { name: "Dama" }).className).toMatch(/min-h-\[44px\]/);
  });
});

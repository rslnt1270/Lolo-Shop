import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import FavoritesClient from "../favorites/FavoritesClient";
import { FAVORITES_KEY } from "@/lib/public/favorites";
import type { PublicProduct } from "@/lib/data/public-projection";

const make = (id: string, title: string): PublicProduct => ({
  id,
  publicCode: null,
  title,
  brand: "Marca de prueba",
  category: "Playeras",
  imageUrl: `https://example.invalid/${id}.jpg`,
  backImageUrl: null,
  sizes: [{ size: "M", available: true, price: 200 }],
  price: 200,
  department: null,
});
const products = [make("a", "Playera A"), make("b", "Vestido B")];
const save = (ids: string[]) => window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FavoritesClient", () => {
  it("lista solo las guardadas que siguen en el catálogo", () => {
    save(["a"]);
    render(<FavoritesClient products={products} />);
    expect(screen.getByText("Playera A")).toBeInTheDocument();
    expect(screen.queryByText("Vestido B")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver prenda Playera A" }).getAttribute("href")).toBe("/catalogo#p-a");
  });

  it("marca Ya no disponible las guardadas que ya no están en el catálogo", () => {
    save(["a", "viejo"]);
    render(<FavoritesClient products={products} />);
    expect(screen.getByText("Ya no disponible (n.º 1)")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Quitar/ })).toHaveLength(2);
  });

  it("quitar una prenda ya no disponible pide confirmación dentro de la pantalla", () => {
    save(["viejo"]);
    render(<FavoritesClient products={products} />);
    fireEvent.click(screen.getByRole("button", { name: /^Quitar/ }));
    expect(screen.getByText("¿Quitar de favoritos?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, quitar" }));
    expect(screen.queryByText(/Ya no disponible/)).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(FAVORITES_KEY)!)).toEqual([]);
  });

  it("al pedir confirmación el foco pasa a Cancelar", () => {
    save(["viejo"]);
    render(<FavoritesClient products={products} />);
    fireEvent.click(screen.getByRole("button", { name: /^Quitar/ }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));
  });

  it("cancelar la confirmación no quita la prenda", () => {
    save(["viejo"]);
    render(<FavoritesClient products={products} />);
    fireEvent.click(screen.getByRole("button", { name: /^Quitar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText("Ya no disponible (n.º 1)")).toBeInTheDocument();
    expect(screen.queryByText("¿Quitar de favoritos?")).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(FAVORITES_KEY)!)).toEqual(["viejo"]);
  });

  it("sin favoritos muestra un estado vacío con enlace al catálogo", () => {
    render(<FavoritesClient products={products} />);
    expect(screen.getByText("Aún no guardas prendas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir al catálogo" }).getAttribute("href")).toBe("/catalogo");
  });

  it("muestra la leyenda de que los favoritos son solo de este navegador", () => {
    render(<FavoritesClient products={products} />);
    expect(
      screen.getByText(
        "Tus favoritos se guardan solo en este navegador. Si cambias de dispositivo o borras los datos del navegador, se pierden.",
      ),
    ).toBeInTheDocument();
  });

  it("si la carga falla avisa y no inventa prendas", () => {
    save(["a"]);
    render(<FavoritesClient products={[]} loadError />);
    expect(screen.getByText("No pudimos cargar tus favoritos. Intenta de nuevo.")).toBeInTheDocument();
    expect(screen.queryByText(/Ya no disponible/)).not.toBeInTheDocument();
  });

  it("no envía IDs al servidor: no hay fetch de escritura", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    save(["a", "viejo"]);
    render(<FavoritesClient products={products} />);
    fireEvent.click(within(screen.getByText("Playera A").closest("li")!).getByRole("button", { name: "Quitar Playera A de favoritos" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, quitar" }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("tras Cancelar el foco vuelve al Quitar de esa prenda", () => {
    save(["a", "b"]);
    render(<FavoritesClient products={products} />);
    const quitarB = screen.getByRole("button", { name: "Quitar Vestido B de favoritos" });
    fireEvent.click(quitarB);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Quitar Vestido B de favoritos" }));
  });

  it("las prendas no disponibles tienen nombres accesibles únicos", () => {
    save(["viejo1", "a", "viejo2"]);
    render(<FavoritesClient products={products} />);
    expect(screen.getByText("Ya no disponible (n.º 1)")).toBeInTheDocument();
    expect(screen.getByText("Ya no disponible (n.º 2)")).toBeInTheDocument();
    const names = screen.getAllByRole("button", { name: /no está disponible/ }).map((b) => b.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(2);
  });

  it("si falla guardar muestra un aviso cortés", () => {
    save(["a"]);
    render(<FavoritesClient products={products} />);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("lleno");
    });
    fireEvent.click(screen.getByRole("button", { name: "Quitar Playera A de favoritos" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, quitar" }));
    expect(screen.getByRole("status", { name: "" }).textContent).toContain("No se pudo guardar en este navegador.");
  });
});

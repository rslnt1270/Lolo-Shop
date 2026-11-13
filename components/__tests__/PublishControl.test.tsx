import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const products = vi.hoisted(() => ({ setProductPublishedAction: vi.fn() }));
vi.mock("@/lib/products/actions", () => products);

import { PublishControl } from "@/components/products/PublishControl";
import type { Product } from "@/lib/domain/types";

const locations = [{ id: "l1", type: "store" as const, isPublic: true }];
const base: Product = {
  id: "p1", title: "Playera", brand: "Guess", category: "Playeras", publicCode: "K7Q2M",
  imageUrl: "https://blob/f.jpg", backImageUrl: "https://blob/b.jpg", description: "Playera lisa", isPublished: false,
  variants: [{ id: "v1", sku: "S", title: "M", size: "M", color: "General", price: 100, barcode: null, inventory: [{ locationId: "l1", available: 2 }] }],
};

function open(p: Product = base) {
  const onChanged = vi.fn();
  render(<PublishControl product={p} locations={locations} onChanged={onChanged} />);
  return { onChanged };
}

beforeEach(() => {
  vi.clearAllMocks();
  products.setProductPublishedAction.mockResolvedValue({ ok: true });
});

describe("PublishControl", () => {
  it("producto elegible: Publicar pide confirmación con el aviso de personas y precios", () => {
    open();
    expect(screen.getByText("No publicado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(
      screen.getByText("¿Publicar en el sitio? Revisa que las fotos no muestren personas, precios ni datos de clientes."),
    ).toBeInTheDocument();
    expect(products.setProductPublishedAction).not.toHaveBeenCalled();
  });

  it("Sí, publicar llama setProductPublishedAction(id, true) y luego onChanged", async () => {
    const { onChanged } = open();
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, publicar" }));
    await waitFor(() => expect(products.setProductPublishedAction).toHaveBeenCalledWith("p1", true));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("Cancelar no publica", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(products.setProductPublishedAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Publicar" })).toBeInTheDocument();
  });

  it("producto no elegible muestra los huecos y Publicar deshabilitado", () => {
    open({ ...base, description: null, backImageUrl: null });
    expect(screen.getByText("Falta la foto de atrás.")).toBeInTheDocument();
    expect(screen.getByText("Falta la descripción.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();
  });

  it("Quitar del sitio llama setProductPublishedAction con false", async () => {
    const { onChanged } = open({ ...base, isPublished: true });
    expect(screen.getByText("Publicado en el sitio")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quitar del sitio" }));
    await waitFor(() => expect(products.setProductPublishedAction).toHaveBeenCalledWith("p1", false));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("si el servidor rechaza, muestra su mensaje y no llama onChanged", async () => {
    products.setProductPublishedAction.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "No tienes permiso." });
    const { onChanged } = open();
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, publicar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes permiso.");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("publicado pero no elegible avisa que no aparece en el sitio y por qué", () => {
    open({ ...base, isPublished: true, description: null });
    expect(screen.getByText("Publicado, pero no aparece en el sitio: Falta la descripción.")).toBeInTheDocument();
    expect(screen.queryByText("Publicado en el sitio")).toBeNull();
    expect(screen.getByRole("button", { name: "Quitar del sitio" })).toBeInTheDocument();
  });

  it("producto inactivo no publicado: sin botón Publicar y con el aviso de reactivar", () => {
    open({ ...base, isActive: false });
    expect(screen.queryByRole("button", { name: "Publicar" })).toBeNull();
    expect(screen.getByText("Reactívalo para publicarlo.")).toBeInTheDocument();
  });

  it("producto inactivo y publicado conserva Quitar del sitio", () => {
    open({ ...base, isActive: false, isPublished: true });
    expect(screen.getByRole("button", { name: "Quitar del sitio" })).toBeInTheDocument();
  });
});

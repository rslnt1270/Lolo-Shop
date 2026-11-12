import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/actions", () => ({
  createProductAction: vi.fn(),
  uploadProductImageAction: vi.fn(),
}));
vi.mock("@/lib/catalog/actions", () => ({
  listBrandsAction: vi.fn().mockResolvedValue([]),
  createBrandAction: vi.fn(),
  listDepartmentsAction: vi.fn().mockResolvedValue([{ id: "d1", slug: "dama", name: "Dama" }]),
  listProductTypesAction: vi.fn().mockResolvedValue([]),
  listColorsAction: vi.fn().mockResolvedValue([]),
  createColorAction: vi.fn(),
}));

import { NewProductForm } from "../products/NewProductForm";
import { TOUR_KEY } from "@/lib/alta/tour-storage";

const mount = () =>
  render(<NewProductForm scannedCode="4006381333931" locationId="loc-1" onSuccess={vi.fn()} onCancel={vi.fn()} />);

describe("AltaTour en el alta", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("C1: la primera visita muestra el recorrido de 3 pasos", async () => {
    mount();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Paso 1 de 3");
    expect(dialog).toHaveTextContent(/escanea la etiqueta/i);
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent(/elige si va al catálogo/i));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent(/toma fotos de frente y atrás/i));
    expect(screen.getByRole("dialog")).not.toHaveTextContent(/blanc/i);
    expect(screen.getByRole("dialog")).toHaveTextContent(/el dueño las revisa antes de publicarlas/i);
    expect(screen.getByRole("button", { name: "Saltar" })).toBeInTheDocument();
  });

  it("C2: Saltar cierra en cualquier paso y no reaparece sin \"¿Cómo registrar?\"", async () => {
    const { unmount } = mount();
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("Paso 2 de 3"));
    fireEvent.click(screen.getByRole("button", { name: "Saltar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(TOUR_KEY)).toBe("1");

    unmount();
    mount();
    await screen.findByRole("button", { name: "¿Cómo registrar?" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "¿Cómo registrar?" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Paso 1 de 3");
  });

  it("terminar el paso 3 lo marca como visto", async () => {
    mount();
    await screen.findByRole("dialog");
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent(`Paso ${i + 2} de 3`));
    }
    fireEvent.click(screen.getByRole("button", { name: "Empezar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(TOUR_KEY)).toBe("1");
  });

  it("C3 (proxy): storage que lanza hace que el recorrido aparezca y el formulario siga", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("cuota");
    });
    mount();
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Saltar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    const desc = screen.getByLabelText(/descripción/i);
    fireEvent.change(desc, { target: { value: "Algodón" } });
    expect(desc).toHaveValue("Algodón");
  });

  it("Tab desde el último botón vuelve al primero sin salir del recorrido", async () => {
    mount();
    const dialog = await screen.findByRole("dialog");
    const saltar = screen.getByRole("button", { name: "Saltar" });
    const next = screen.getByRole("button", { name: "Siguiente" });
    next.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(saltar).toHaveFocus();
  });

  it("Shift+Tab desde el primer botón va al último", async () => {
    mount();
    const dialog = await screen.findByRole("dialog");
    const saltar = screen.getByRole("button", { name: "Saltar" });
    saltar.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Siguiente" })).toHaveFocus();
  });

  it("al cerrar con Saltar, el foco vuelve a ¿Cómo registrar?", async () => {
    mount();
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Saltar" }));
    const how = await screen.findByRole("button", { name: "¿Cómo registrar?" });
    expect(how).toHaveFocus();
  });

  it("al cerrar con Escape, el foco vuelve al elemento que tenía el foco", async () => {
    mount();
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Saltar" }));
    const how = await screen.findByRole("button", { name: "¿Cómo registrar?" });
    how.focus();
    fireEvent.click(how);
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(how).toHaveFocus();
  });
});

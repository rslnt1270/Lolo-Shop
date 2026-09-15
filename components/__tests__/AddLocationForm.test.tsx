import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddLocationForm } from "../inventory/AddLocationForm";

describe("AddLocationForm", () => {
  it("envía nombre y tipo y notifica la tienda creada", async () => {
    const onCreate = vi.fn().mockResolvedValue({ id: "loc-9", name: "Tienda Centro", type: "store" });
    const onCreated = vi.fn();
    render(<AddLocationForm onCreate={onCreate} onCreated={onCreated} />);

    fireEvent.click(screen.getByRole("button", { name: /tienda/i }));
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "Tienda Centro" } });
    fireEvent.change(screen.getByLabelText(/tipo/i), { target: { value: "warehouse" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ name: "Tienda Centro", type: "warehouse" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "loc-9", name: "Tienda Centro", type: "store" }));
  });

  it("no envía si el nombre está vacío y muestra aviso", async () => {
    const onCreate = vi.fn();
    render(<AddLocationForm onCreate={onCreate} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /tienda/i }));
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText("Escribe el nombre de la tienda.")).toBeInTheDocument();
  });

  it("muestra el error si la creación falla", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("Solo el dueño puede crear tiendas."));
    render(<AddLocationForm onCreate={onCreate} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /tienda/i }));
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(await screen.findByText(/solo el dueño/i)).toBeInTheDocument();
  });
});

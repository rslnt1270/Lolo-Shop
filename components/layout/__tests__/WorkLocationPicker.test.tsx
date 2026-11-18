import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkLocationPicker } from "@/components/layout/WorkLocationPicker";

const LOCS = [
  { id: "a", name: "Alva" },
  { id: "l", name: "Lomas" },
];

describe("WorkLocationPicker", () => {
  it("muestra la tienda actual y el selector con etiqueta", () => {
    render(<WorkLocationPicker value="l" locations={LOCS} onChange={() => {}} />);
    expect(screen.getByText("Estás en: Lomas")).toBeInTheDocument();
    expect(screen.getByLabelText("Cambiar tienda")).toHaveValue("l");
  });

  it("sin valor pide elegir", () => {
    render(<WorkLocationPicker value="" locations={LOCS} onChange={() => {}} />);
    expect(screen.getByText("Elige en qué tienda estás.")).toBeInTheDocument();
    expect(screen.queryByText(/Estás en:/)).toBeNull();
  });

  it("avisa el cambio", () => {
    const onChange = vi.fn();
    render(<WorkLocationPicker value="l" locations={LOCS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Cambiar tienda"), { target: { value: "a" } });
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("bloqueado muestra el texto de bloqueo y deshabilita", () => {
    render(
      <WorkLocationPicker value="l" locations={LOCS} onChange={() => {}} disabled lockedLabel="Bloqueada por la copia sin red" />,
    );
    expect(screen.getByLabelText("Cambiar tienda")).toBeDisabled();
    expect(screen.getByText("Bloqueada por la copia sin red")).toBeInTheDocument();
  });
});

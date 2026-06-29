import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchFilter } from "../SearchFilter";

describe("SearchFilter", () => {
  it("emite el texto escrito", () => {
    const onQuery = vi.fn();
    render(<SearchFilter onQuery={onQuery} onCategory={() => {}} categories={["Hoodies"]} />);
    fireEvent.change(screen.getByPlaceholderText("Buscar producto..."), {
      target: { value: "guess" },
    });
    expect(onQuery).toHaveBeenCalledWith("guess");
  });

  it("emite la categoría seleccionada", () => {
    const onCategory = vi.fn();
    render(<SearchFilter onQuery={() => {}} onCategory={onCategory} categories={["Hoodies"]} />);
    fireEvent.change(screen.getByLabelText("Categoría"), { target: { value: "Hoodies" } });
    expect(onCategory).toHaveBeenCalledWith("Hoodies");
  });
});

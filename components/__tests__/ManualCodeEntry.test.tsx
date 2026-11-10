import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ManualCodeEntry } from "../inventory/ManualCodeEntry";

describe("ManualCodeEntry", () => {
  it("envía el código sin espacios", () => {
    const onSubmit = vi.fn();
    render(<ManualCodeEntry onSubmit={onSubmit} onNoBarcode={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/código del producto/i), { target: { value: "  AB-123 " } });
    fireEvent.click(screen.getByRole("button", { name: /usar este código/i }));
    expect(onSubmit).toHaveBeenCalledWith("AB-123");
  });

  it("no envía si está vacío", () => {
    const onSubmit = vi.fn();
    render(<ManualCodeEntry onSubmit={onSubmit} onNoBarcode={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /usar este código/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("'Prenda sin código' llama onNoBarcode y el input admite texto (SKU LS-XXXXXX-C)", () => {
    const onNoBarcode = vi.fn();
    render(<ManualCodeEntry onSubmit={vi.fn()} onNoBarcode={onNoBarcode} />);
    expect(screen.getByLabelText(/código del producto/i)).toHaveAttribute("inputmode", "text");
    fireEvent.click(screen.getByRole("button", { name: /prenda sin código/i }));
    expect(onNoBarcode).toHaveBeenCalled();
  });
});

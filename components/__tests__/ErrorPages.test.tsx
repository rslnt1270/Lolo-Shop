import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorPage from "@/app/error";
import GlobalError from "@/app/global-error";
import NotFound from "@/app/not-found";

describe("páginas de error", () => {
  it("app/error: Reintentar llama a reset()", () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("x")} reset={reset} />);
    expect(screen.getByText("Algo falló.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("app/global-error: Reintentar llama a reset()", () => {
    const reset = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined); // <html> dentro de un div en jsdom
    render(<GlobalError error={new Error("x")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("app/not-found: enlaza al inicio", () => {
    render(<NotFound />);
    expect(screen.getByRole("link", { name: "Ir al inicio" })).toHaveAttribute("href", "/");
  });
});

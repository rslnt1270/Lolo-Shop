import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../ui/Button";

describe("Button", () => {
  it("renders a primary button by default", () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole("button", { name: "Guardar" }).className).toContain("bg-turquesa");
  });
  it("loading button shows a spinner, sets aria-busy and is disabled", () => {
    render(<Button loading>Guardando</Button>);
    const b = screen.getByRole("button", { name: /Guardando/ });
    expect(b).toHaveAttribute("aria-busy", "true");
    expect(b).toBeDisabled();
    expect(b.querySelector(".lolo-btn-spinner")).not.toBeNull();
  });
  it("success state renders an animated check path", () => {
    render(<Button success>Listo</Button>);
    expect(screen.getByRole("button", { name: /Listo/ }).querySelector(".lolo-btn-check path")).not.toBeNull();
  });
  it("loading wins over success: spinner rendered, no check", () => {
    const { container } = render(<Button loading success>Guardar</Button>);
    expect(container.querySelector(".lolo-btn-spinner")).not.toBeNull();
    expect(container.querySelector(".lolo-btn-check")).toBeNull();
  });
  it("danger variant renders agotado outline", () => {
    render(<Button variant="danger">Quitar</Button>);
    expect(screen.getByRole("button", { name: "Quitar" }).className).toContain("border-agotado");
  });
  it("forwards onClick and type", () => {
    const onClick = vi.fn();
    render(<Button type="submit" onClick={onClick}>Ok</Button>);
    const b = screen.getByRole("button");
    expect(b).toHaveAttribute("type", "submit");
    b.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("defaults to type=button and appends extra className", () => {
    render(<Button className="w-full">Ir</Button>);
    const b = screen.getByRole("button");
    expect(b).toHaveAttribute("type", "button");
    expect(b.className).toContain("w-full");
  });
  it("does not fire onClick while loading", () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Espera</Button>);
    screen.getByRole("button").click();
    expect(onClick).not.toHaveBeenCalled();
  });
});

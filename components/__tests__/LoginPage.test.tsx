import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signIn = vi.hoisted(() => vi.fn());
vi.mock("next-auth/react", () => ({ signIn, useSession: () => ({ data: null }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

import LoginPage from "@/app/login/page";

describe("login", () => {
  beforeEach(() => {
    signIn.mockReset();
  });

  it("el usuario no se capitaliza ni autocorrige", () => {
    render(<LoginPage />);
    const input = screen.getByLabelText("Usuario");
    expect(input).toHaveAttribute("autocapitalize", "none");
    expect(input).toHaveAttribute("autocomplete", "username");
    expect(input).toHaveAttribute("autocorrect", "off");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("autocomplete", "current-password");
  });

  it("recorta el usuario antes de enviarlo", async () => {
    signIn.mockResolvedValue({ error: null });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: " lolo " } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(signIn).toHaveBeenCalled());
    expect(signIn.mock.calls[0][1]).toMatchObject({ username: "lolo" });
  });

  it("si signIn lanza, reactiva el botón y avisa con role=alert", async () => {
    signIn.mockRejectedValue(new Error("red"));
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "lolo" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { NavBar } from "../layout/NavBar";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

function mockSession(status: "authenticated" | "unauthenticated" | "loading") {
  vi.mocked(useSession).mockReturnValue({
    data: status === "authenticated" ? ({ user: {} } as any) : null,
    status,
    update: vi.fn(),
  } as any);
}

describe("NavBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no renderiza nada si no hay sesión", () => {
    mockSession("unauthenticated");
    vi.mocked(usePathname).mockReturnValue("/");
    const { container } = render(<NavBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("no renderiza nada mientras carga la sesión", () => {
    mockSession("loading");
    vi.mocked(usePathname).mockReturnValue("/");
    const { container } = render(<NavBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("muestra los botones cuando hay sesión iniciada", () => {
    mockSession("authenticated");
    vi.mocked(usePathname).mockReturnValue("/");
    render(<NavBar />);
    expect(screen.getAllByText("Escanear").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Etiquetas").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Productos").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Salir").length).toBeGreaterThan(0);
  });

  it("no renderiza nada en /login aunque haya sesión", () => {
    mockSession("authenticated");
    vi.mocked(usePathname).mockReturnValue("/login");
    const { container } = render(<NavBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("no renderiza nada en /catalogo aunque haya sesión", () => {
    mockSession("authenticated");
    vi.mocked(usePathname).mockReturnValue("/catalogo");
    const { container } = render(<NavBar />);
    expect(container).toBeEmptyDOMElement();
  });
});

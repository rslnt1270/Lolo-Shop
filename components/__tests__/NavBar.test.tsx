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
    expect(screen.getAllByText("Ventas").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Salir").length).toBeGreaterThan(0);
  });

  it("incluye Vender, que lleva a /pos, en la barra de escritorio y en la móvil", () => {
    mockSession("authenticated");
    vi.mocked(usePathname).mockReturnValue("/");
    render(<NavBar />);
    const vender = screen.getAllByRole("link", { name: "Vender" });
    expect(vender).toHaveLength(2);
    for (const link of vender) expect(link).toHaveAttribute("href", "/pos");
  });

  it("en móvil cada destino tiene nombre accesible y mínimo 44 px de ancho", () => {
    mockSession("authenticated");
    vi.mocked(usePathname).mockReturnValue("/ventas");
    render(<NavBar />);
    const mobileNav = screen.getAllByRole("navigation").find((n) => n.className.includes("md:hidden"))!;
    const targets = [...mobileNav.querySelectorAll("a, button")];
    expect(targets.map((t) => t.getAttribute("aria-label"))).toEqual([
      "Inicio",
      "Vender",
      "Escanear",
      "Etiquetas",
      "Productos",
      "Ventas",
      "Movimientos",
      "Salir",
    ]);
    for (const t of targets) expect(t.className).toMatch(/\bmin-w-11\b.*\bflex-1\b|\bflex-1\b.*\bmin-w-11\b/);
    for (const t of targets) expect(t.className).toMatch(/\bh-12\b/);
    expect(screen.getAllByRole("link", { name: "Ventas" }).every((l) => l.getAttribute("aria-current") === "page")).toBe(true);
  });

  it("incluye el enlace Movimientos hacia /movimientos", () => {
    mockSession("authenticated");
    vi.mocked(usePathname).mockReturnValue("/");
    render(<NavBar />);
    const links = screen.getAllByRole("link", { name: "Movimientos" });
    expect(links).toHaveLength(2);
    for (const l of links) expect(l).toHaveAttribute("href", "/movimientos");
  });

  it("no renderiza nada en /pos (pantalla completa de venta)", () => {
    mockSession("authenticated");
    vi.mocked(usePathname).mockReturnValue("/pos");
    const { container } = render(<NavBar />);
    expect(container).toBeEmptyDOMElement();
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

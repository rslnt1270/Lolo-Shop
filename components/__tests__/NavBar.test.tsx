import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

const offline = vi.hoisted(() => ({
  clearOnSignOut: vi.fn(),
  listQueue: vi.fn(),
}));
vi.mock("@/lib/offline/identity-store", () => ({ clearOnSignOut: offline.clearOnSignOut }));
vi.mock("@/lib/offline/queue-store", () => ({ listQueue: offline.listQueue }));

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
    offline.clearOnSignOut.mockResolvedValue(undefined);
    offline.listQueue.mockResolvedValue([]);
    vi.mocked(signOut).mockResolvedValue(undefined as any);
  });

  it("no renderiza nada si no hay sesión", () => {
    mockSession("unauthenticated");
    vi.mocked(usePathname).mockReturnValue("/");
    const { container } = render(<NavBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("mientras carga la sesión solo reserva el espacio, sin enlaces ni botones", () => {
    mockSession("loading");
    vi.mocked(usePathname).mockReturnValue("/");
    const { container } = render(<NavBar />);
    expect(container.querySelector("nav[data-bottom-nav]")).not.toBeNull();
    expect(container.querySelectorAll("a, button")).toHaveLength(0);
    expect(screen.queryByRole("navigation")).toBeNull();
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
      "Salir",
    ]);
    for (const t of targets) expect(t.className).toMatch(/\bmin-w-11\b.*\bflex-1\b|\bflex-1\b.*\bmin-w-11\b/);
    for (const t of targets) expect(t.className).toMatch(/\bh-12\b/);
    expect(screen.getAllByRole("link", { name: "Ventas" }).every((l) => l.getAttribute("aria-current") === "page")).toBe(true);
  });

  it("no enlaza /movimientos", () => {
    mockSession("authenticated");
    vi.mocked(usePathname).mockReturnValue("/");
    render(<NavBar />);
    expect(screen.queryByRole("link", { name: "Movimientos" })).toBeNull();
    expect(document.querySelector('a[href="/movimientos"]')).toBeNull();
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

  describe("salir", () => {
    const sale = (state: string) => ({ clientRequestId: state + Math.random(), state });

    it("salir llama clearOnSignOut antes de signOut", async () => {
      mockSession("authenticated");
      vi.mocked(usePathname).mockReturnValue("/");
      const order: string[] = [];
      offline.clearOnSignOut.mockImplementation(async () => { order.push("clear"); });
      vi.mocked(signOut).mockImplementation((async () => { order.push("signOut"); }) as any);
      render(<NavBar />);
      fireEvent.click(screen.getAllByRole("button", { name: /Salir/ })[0]);
      await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }));
      expect(order).toEqual(["clear", "signOut"]);
    });

    it("salir con ventas sin enviar advierte y no sale hasta confirmar", async () => {
      mockSession("authenticated");
      vi.mocked(usePathname).mockReturnValue("/");
      offline.listQueue.mockResolvedValue([sale("pending"), sale("needs_attention"), sale("synced")]);
      render(<NavBar />);
      fireEvent.click(screen.getAllByRole("button", { name: /Salir/ })[0]);
      expect(
        await screen.findByText("Hay 2 ventas sin enviar en este teléfono. Se enviarán cuando vuelvas a entrar."),
      ).toBeInTheDocument();
      expect(signOut).not.toHaveBeenCalled();
      expect(offline.clearOnSignOut).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Salir de todos modos" }));
      await waitFor(() => expect(signOut).toHaveBeenCalled());
      expect(offline.clearOnSignOut).toHaveBeenCalled();
    });

    it("con una sola venta usa singular y cancelar no sale", async () => {
      mockSession("authenticated");
      vi.mocked(usePathname).mockReturnValue("/");
      offline.listQueue.mockResolvedValue([sale("sending")]);
      render(<NavBar />);
      fireEvent.click(screen.getAllByRole("button", { name: /Salir/ })[0]);
      expect(
        await screen.findByText("Hay 1 venta sin enviar en este teléfono. Se enviarán cuando vuelvas a entrar."),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(signOut).not.toHaveBeenCalled();
    });

    it("sin ventas sin enviar (solo enviadas) sale directo", async () => {
      mockSession("authenticated");
      vi.mocked(usePathname).mockReturnValue("/");
      offline.listQueue.mockResolvedValue([sale("synced")]);
      render(<NavBar />);
      fireEvent.click(screen.getAllByRole("button", { name: /Salir/ })[0]);
      await waitFor(() => expect(signOut).toHaveBeenCalled());
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it("si clearOnSignOut falla, igual sale y deja constancia", async () => {
      mockSession("authenticated");
      vi.mocked(usePathname).mockReturnValue("/");
      offline.clearOnSignOut.mockRejectedValue(new Error("idb"));
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      render(<NavBar />);
      fireEvent.click(screen.getAllByRole("button", { name: /Salir/ })[0]);
      await waitFor(() => expect(signOut).toHaveBeenCalled());
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});

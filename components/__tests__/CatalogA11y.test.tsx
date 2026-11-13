import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { VirtualStoreCatalog } from "../virtual-store/VirtualStoreCatalog";
import { CatalogDrawer } from "../virtual-store/CatalogDrawer";
import type { PublicProduct } from "@/lib/data/public-projection";
import type { StoreHotspot } from "@/lib/virtual-store/types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/catalogo",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// Movimiento reducido activo en todo el archivo (framer-motion lee matchMedia una sola vez).
const originalMatchMedia = window.matchMedia;
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterAll(() => {
  window.matchMedia = originalMatchMedia;
});
afterEach(() => {
  vi.unstubAllEnvs();
  cleanup();
});

const make = (id: string, title: string, sizes: string[]): PublicProduct => ({
  id,
  publicCode: `C${id}XXX`,
  title,
  brand: "Marca de prueba",
  category: "Playeras",
  imageUrl: `https://example.invalid/${id}.jpg`,
  backImageUrl: `https://example.invalid/${id}-a.jpg`,
  sizes: sizes.map((size) => ({ size, available: true, price: 100 })),
  price: 100,
  department: null,
});
const A = make("a", "Playera A", ["S", "M", "L"]);
const B = make("b", "Playera B", ["XS", "XL"]);

const open = (title: string) => {
  const card = screen
    .getAllByRole("button", { name: new RegExp(title) })
    .find((b) => !/^(Ver prenda|Guardar)/.test(b.getAttribute("aria-label") ?? ""))!;
  card.focus();
  fireEvent.click(card);
  return card;
};

describe("Modal público como diálogo", () => {
  it("tiene role=dialog, aria-modal y se nombra con su título", () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
    render(<VirtualStoreCatalog initialProducts={[A]} isLoggedIn={false} />);
    open("Playera A");
    const dialog = screen.getByRole("dialog", { name: "Playera A" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby");
  });

  it("Esc lo cierra y el foco vuelve a la tarjeta que lo abrió", () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
    render(<VirtualStoreCatalog initialProducts={[A, B]} isLoggedIn={false} />);
    const card = open("Playera A");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(card);
  });

  it("bloquea el scroll del fondo mientras está abierto y lo libera al cerrar", () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
    render(<VirtualStoreCatalog initialProducts={[A]} isLoggedIn={false} />);
    open("Playera A");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar modal" }));
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("atrapa el foco: Tab desde el último control vuelve al primero y Shift+Tab al revés", () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", "52" + "0".repeat(10));
    render(<VirtualStoreCatalog initialProducts={[A]} isLoggedIn={false} />);
    open("Playera A");
    const dialog = screen.getByRole("dialog");
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>("button, a[href]"));
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("abrir A, elegir M, cerrar y abrir B deja seleccionada la primera talla de B", () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
    render(<VirtualStoreCatalog initialProducts={[A, B]} isLoggedIn={false} />);
    open("Playera A");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "M" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "M" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    open("Playera B");
    const d = within(screen.getByRole("dialog"));
    expect(d.getByRole("button", { name: "XS" })).toHaveAttribute("aria-pressed", "true");
    expect(d.getByRole("button", { name: "XL" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Cuadrícula y cabecera a 44 px", () => {
  it("cada button y a del catálogo mide al menos 44 px y tiene nombre accesible", () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
    const many = Array.from({ length: 30 }, (_, i) => make(`p${i}`, `Prenda ${i}`, ["M"]));
    const { container } = render(<VirtualStoreCatalog initialProducts={many} isLoggedIn={true} />);
    const controls = Array.from(container.querySelectorAll<HTMLElement>("button, a"));
    expect(controls.length).toBeGreaterThan(24);
    for (const el of controls) {
      const cls = el.className;
      expect(cls, el.outerHTML.slice(0, 120)).toMatch(/min-h-(11|\[44px\])/);
      // Los controles de solo icono también necesitan 44 px de ancho.
      if (!(el.textContent ?? "").trim()) {
        expect(cls, el.outerHTML.slice(0, 120)).toMatch(/min-w-(11|\[44px\])|\bw-full\b/);
      }
      const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim() || el.getAttribute("title");
      expect(name, el.outerHTML.slice(0, 120)).toBeTruthy();
    }
  });

  it("las fotos de la cuadrícula traen width, height y loading=lazy", () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
    const { container } = render(<VirtualStoreCatalog initialProducts={[A, B]} isLoggedIn={false} />);
    const imgs = Array.from(container.querySelectorAll("ul img"));
    expect(imgs.length).toBe(2);
    for (const img of imgs) {
      expect(img).toHaveAttribute("width");
      expect(img).toHaveAttribute("height");
      expect(img).toHaveAttribute("loading", "lazy");
    }
  });
});

describe("Movimiento reducido", () => {
  it("la tarjeta del modal no se inclina con el puntero ni flota", async () => {
    vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
    render(<VirtualStoreCatalog initialProducts={[A]} isLoggedIn={false} />);
    open("Playera A");
    const card = screen.getByTestId("product-card-3d");
    card.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.mouseMove(card, { clientX: 100, clientY: 0 });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(card.style.transform).not.toMatch(/rotate/);
    expect(card.innerHTML).not.toMatch(/translateY\(-/);
  });
});

describe("Cajón del catálogo como diálogo", () => {
  const hotspot: StoreHotspot = {
    id: "h1",
    title: "Playera A",
    category: "Playeras",
    brand: "Marca de prueba",
    price: 100,
    yaw: 0,
    pitch: 0,
    zoneId: "entrada",
    shelfLabel: "Repisa 1",
  };

  it("tiene role=dialog con nombre, Esc cierra, bloquea scroll y devuelve el foco", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const { unmount } = render(
      <CatalogDrawer isOpen onClose={onClose} hotspots={[hotspot]} onSelectProduct={() => {}} />,
    );
    const dialog = screen.getByRole("dialog", { name: "Catálogo de la Tienda" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).not.toBe("hidden");
    trigger.remove();
  });

  it("cada producto del cajón es un botón (teclado) y los controles miden 44 px", () => {
    const onSelect = vi.fn();
    render(<CatalogDrawer isOpen onClose={() => {}} hotspots={[hotspot]} onSelectProduct={onSelect} />);
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: /Playera A/ }));
    expect(onSelect).toHaveBeenCalledWith(hotspot);
    expect(dialog.getByRole("button", { name: "Cerrar catálogo" }).className).toMatch(/min-h-11/);
    expect(dialog.getByRole("button", { name: "Cerrar catálogo" }).className).toMatch(/min-w-11/);
  });
});

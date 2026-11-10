import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { PageTransition } from "@/components/layout/PageTransition";
import { VirtualStoreCatalog } from "@/components/virtual-store/VirtualStoreCatalog";
import LoginPage from "@/app/login/page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/catalogo",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

// El HTML de servidor es lo que se ve antes de hidratar: no puede salir invisible ni desenfocado.
const HIDDEN = /opacity:\s*0(?![.\d])/;

describe("HTML de servidor sin pantalla en blanco", () => {
  it("PageTransition no emite opacity:0 ni filter", () => {
    const html = renderToString(
      <PageTransition>
        <p>Contenido</p>
      </PageTransition>,
    );
    expect(html).toContain("Contenido");
    expect(html).not.toMatch(HIDDEN);
    expect(html).not.toMatch(/filter/i);
  });

  it("/catalogo no emite opacity:0 ni filter", () => {
    const html = renderToString(<VirtualStoreCatalog initialProducts={[]} isLoggedIn={false} />);
    expect(html).not.toMatch(HIDDEN);
    expect(html).not.toMatch(/style="[^"]*filter/i);
  });

  it("/login no emite opacity:0 ni filter", () => {
    const html = renderToString(<LoginPage />);
    expect(html).toContain("Bienvenido a LoloShop");
    expect(html).not.toMatch(HIDDEN);
    expect(html).not.toMatch(/style="[^"]*filter/i);
  });
});

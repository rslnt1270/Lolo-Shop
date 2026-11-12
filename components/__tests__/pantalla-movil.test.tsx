import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { viewport, metadata } from "@/app/layout";
import { NavBar } from "../layout/NavBar";

// Contrato de pantalla móvil (hotfix 2026-11-12): la barra inferior y los
// botones fijos respetan el área segura y la altura real de la pantalla.

vi.mock("next-auth/react", () => ({ useSession: vi.fn(), signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));

const root = path.resolve(__dirname, "../..");
const src = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const OFFSET = "bottom-[var(--bottom-nav-offset)]";

describe("viewport de la app", () => {
  it("usa viewportFit cover (sin esto env(safe-area-inset-*) vale 0)", () => {
    expect(viewport.viewportFit).toBe("cover");
    expect(viewport.width).toBe("device-width");
  });

  it("themeColor vive en viewport con el turquesa de marca, no en metadata", () => {
    expect(viewport.themeColor).toBe("#22B8B8");
    expect((metadata as Record<string, unknown>).themeColor).toBeUndefined();
  });

  it("el body ya no lleva un relleno inferior fijo", () => {
    expect(src("app/layout.tsx")).not.toMatch(/pb-24/);
  });
});

describe("variables compartidas en globals.css", () => {
  const css = src("app/globals.css");

  it("define el alto de la barra y el área segura en un solo lugar", () => {
    expect(css).toMatch(/--nav-h:\s*4rem/);
    expect(css).toMatch(/--safe-bottom:\s*env\(safe-area-inset-bottom/);
    expect(css).toMatch(/--bottom-nav-offset:\s*calc\(var\(--nav-h\) \+ var\(--safe-bottom\)\)/);
  });

  it("el offset es 0 sin barra inferior y en md+", () => {
    expect(css).toMatch(/:root:not\(:has\(\[data-bottom-nav\]\)\)\s*\{\s*--bottom-nav-offset:\s*0px/);
    expect(css).toMatch(/@media \(min-width: 768px\)\s*\{\s*:root\s*\{\s*--bottom-nav-offset:\s*0px/);
  });

  it("el body reserva el hueco de la barra y respeta la muesca lateral", () => {
    expect(css).toMatch(/body\s*\{[^}]*padding-bottom:\s*var\(--bottom-nav-offset\)/);
    expect(css).toMatch(/body\s*\{[^}]*padding-left:\s*var\(--safe-left\)/);
    expect(css).toMatch(/body\s*\{[^}]*padding-right:\s*var\(--safe-right\)/);
  });

  it(".min-h-pantalla usa 100dvh con respaldo de 100vh", () => {
    expect(css).toMatch(/\.min-h-pantalla\s*\{\s*min-height:\s*100vh;\s*min-height:\s*100dvh;/);
  });
});

describe("NavBar móvil", () => {
  function renderNav(pathname = "/") {
    vi.mocked(useSession).mockReturnValue({ data: { user: {} }, status: "authenticated", update: vi.fn() } as any);
    vi.mocked(usePathname).mockReturnValue(pathname);
    return render(<NavBar />);
  }

  it("la barra inferior se marca con data-bottom-nav y usa el área segura", () => {
    const { container } = renderNav();
    const nav = container.querySelector("nav[data-bottom-nav]");
    expect(nav).not.toBeNull();
    const cls = nav!.className;
    expect(cls).toContain("fixed");
    expect(cls).toContain("bottom-0");
    expect(cls).toContain("md:hidden");
    expect(cls).toContain("h-[calc(var(--nav-h)+var(--safe-bottom))]");
    expect(cls).toContain("pb-[var(--safe-bottom)]");
    expect(cls).toContain("pl-[max(0.375rem,var(--safe-left))]");
    expect(cls).toContain("pr-[max(0.375rem,var(--safe-right))]");
    expect(cls).not.toMatch(/\bpb-6\b/);
  });

  it("7 destinos de al menos 44 px que caben en 320 px", () => {
    const { container } = renderNav();
    const items = container.querySelectorAll("nav[data-bottom-nav] a, nav[data-bottom-nav] button");
    expect(items).toHaveLength(7);
    for (const el of items) expect(el.className).toContain("min-w-11");
    // 7 × 44 px + 2 × 6 px de relleno lateral = 320 px.
  });

  it("el encabezado móvil respeta la barra de estado", () => {
    const { container } = renderNav();
    expect(container.querySelector("header")!.className).toContain("pt-[calc(0.75rem+var(--safe-top))]");
  });

  it("la barra superior (md+) oculta los textos entre md y lg para caber en iPad vertical", () => {
    const { container } = renderNav();
    const top = container.querySelector("nav:not([data-bottom-nav])")!;
    const labels = top.querySelectorAll("span.sr-only.lg\\:not-sr-only");
    expect(labels).toHaveLength(7);
  });

  it("no hay barra inferior en /pos (ni offset que reservar)", () => {
    const { container } = renderNav("/pos");
    expect(container.querySelector("[data-bottom-nav]")).toBeNull();
  });
});

describe("barras pegajosas inferiores", () => {
  const bars: Array<[string, RegExp]> = [
    ["components/products/NewProductForm.tsx", /className="sticky [^"]*"/g],
    ["components/products/AddSizeForm.tsx", /className="sticky [^"]*"/g],
    ["app/productos/page.tsx", /className="sticky bottom[^"]*"/g],
  ];

  for (const [file, re] of bars) {
    it(`${file}: queda encima de la barra en móvil y en bottom-0 en md+`, () => {
      const matches = src(file).match(re) ?? [];
      expect(matches.length).toBeGreaterThan(0);
      for (const m of matches) {
        expect(m).toContain(OFFSET);
        expect(m).toContain("md:bottom-0");
        expect(m).not.toMatch(/sticky bottom-0\b/);
      }
    });
  }

  it("/pos (sin barra de navegación) mantiene bottom-0 con el área segura", () => {
    const m = src("app/pos/page.tsx").match(/className="sticky bottom[^"]*"/g) ?? [];
    expect(m.length).toBeGreaterThan(0);
    for (const c of m) {
      expect(c).toContain("sticky bottom-0");
      expect(c).toContain("env(safe-area-inset-bottom)");
    }
  });
});

describe("altura real de pantalla", () => {
  const files = [
    "app/login/page.tsx",
    "components/layout/PageTransition.tsx",
    "components/virtual-store/VirtualStoreCatalog.tsx",
    "app/global-error.tsx",
  ];

  for (const f of files) {
    it(`${f}: sin h-screen / min-h-screen ni 100vh suelto`, () => {
      const s = src(f);
      expect(s).not.toMatch(/\b(min-h|h|max-h)-screen\b/);
      // 100vh solo se permite como respaldo inmediatamente seguido de 100dvh.
      const bare = s.replace(/min-height:100vh;min-height:100dvh/g, "");
      expect(bare).not.toMatch(/100vh/);
    });
  }

  it("login y catálogo usan .min-h-pantalla", () => {
    expect(src("app/login/page.tsx")).toContain("min-h-pantalla");
    expect(src("components/virtual-store/VirtualStoreCatalog.tsx")).toContain("min-h-pantalla");
  });
});

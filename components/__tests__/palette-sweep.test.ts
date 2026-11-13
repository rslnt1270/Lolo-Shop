import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function readSources(paths: string[]): { file: string; lines: string[] }[] {
  const files: string[] = [];
  const walk = (rel: string) => {
    const abs = join(ROOT, rel);
    const st = statSync(abs);
    if (st.isDirectory()) {
      for (const name of readdirSync(abs)) {
        if (name === "__tests__") continue;
        walk(join(rel, name));
      }
    } else if (/\.(tsx|ts)$/.test(rel)) {
      files.push(rel);
    }
  };
  paths.forEach(walk);
  return files.map((file) => ({ file, lines: readFileSync(join(ROOT, file), "utf8").split("\n") }));
}

// Relleno turquesa o loloteal junto a texto blanco, o botón crudo con texto blanco.
const WHITE_ON_FILL = /text-white(?!\/)/;
const FILL = /bg-loloteal|bg-turquesa(?![-\w])|bg-primary(?![-\w])|<button|<Button/;

function offenders(paths: string[], extra: RegExp[] = []): string[] {
  const out: string[] = [];
  for (const { file, lines } of readSources(paths)) {
    lines.forEach((line, i) => {
      const bad =
        /bg-loloteal/.test(line) ||
        (WHITE_ON_FILL.test(line) && FILL.test(line)) ||
        extra.some((r) => r.test(line));
      if (bad) out.push(`${file}:${i + 1}`);
    });
  }
  return out;
}

describe("barrido de paleta (plan B, zonas)", () => {
  it("public and access files have no bg-loloteal or text-white fill", () => {
    expect(
      offenders(
        [
          "app/page.tsx",
          "app/login",
          "app/error.tsx",
          "app/not-found.tsx",
          "app/global-error.tsx",
          "app/etiquetas",
          "app/cuenta",
          "components/layout/StaffLoadState.tsx",
          "components/layout/NavBar.tsx",
        ],
        [/#0B5E5E|#147E7E|#084848|#106666|#007272/],
      ),
    ).toEqual([]);
  });

  it("sales files use turquesa primary and agotado danger", () => {
    expect(
      offenders(["components/sales", "app/pos/page.tsx", "app/ventas/page.tsx"], [
        /#C23A2B|#9B2C20|#B7791F|#8A5A12|#147E7E|#12211F|#3A4D4A|#007272/,
        /loloteal|bg-primary|text-primary|ring-primary|error-container|bg-\[#/,
      ]),
    ).toEqual([]);
  });

  it("products files have no bg-loloteal primary fills", () => {
    expect(
      offenders(
        [
          "app/productos",
          "components/products/NewProductForm.tsx",
          "components/products/ProductAdminSheet.tsx",
          "components/products/AddSizeForm.tsx",
          "components/products/ExistingProductSearch.tsx",
          "components/products/BrandCombobox.tsx",
          "components/products/SizeRows.tsx",
          "components/products/ProductPhotoButton.tsx",
          "components/products/ProductPhotoCapture.tsx",
          "components/products/PublishControl.tsx",
          "components/products/PendingPublicationRow.tsx",
          "components/products/ProductCard.tsx",
          "components/products/ClassificationFields.tsx",
          "components/products/AltaTour.tsx",
          "components/products/SavedCheck.tsx",
        ],
        [/loloteal|#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b(?![\w-])/],
      ),
    ).toEqual([]);
  });

  it("scanner override uses turquesa fill and tinta text, not white", () => {
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
    const rule = /#reader button\s*\{[^}]*\}/.exec(css)![0];
    expect(rule).toContain("#22B8B8");
    expect(rule).toContain("#16302F");
    expect(rule).not.toMatch(/color:\s*white/);
  });

  it("stock labels pair color with text", () => {
    const src = readFileSync(join(ROOT, "components/inventory/StockSummary.tsx"), "utf8");
    expect(src).toContain("Disponible");
    expect(src).toContain("Agotado");
    expect(src).toMatch(/text-ok/);
    expect(src).toMatch(/text-agotado/);
  });

  it("inventory and scanner files have no loloteal, white fills or fixed hex", () => {
    expect(
      offenders(["components/inventory", "app/escanear/page.tsx"], [
        /loloteal|bg-primary|text-primary|bg-red-|#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b(?![\w-])/,
      ]),
    ).toEqual([]);
  });

  it("virtual store uses no loloteal or primary text colors", () => {
    const bad: string[] = [];
    for (const { file, lines } of readSources(["components/virtual-store", "components/products/ProductCard3D.tsx"])) {
      lines.forEach((line, i) => {
        if (/text-loloteal|text-primary|text-turquesa(\s|")|loloteal|bg-primary|#3cbfbf|#007272|#0f171c/i.test(line)) bad.push(`${file}:${i + 1}`);
        if (/<text[^>]*fill=\{PALETTE\.turquesa\}|<text[^>]*text-turquesa(\s|")/.test(line)) bad.push(`${file}:${i + 1}`);
        if (/bg-turquesa(?![-\w])/.test(line) && /text-white(?!\/)/.test(line)) bad.push(`${file}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });

  // Excluye virtual-store: la flecha en reposo de VirtualStoreCanvas (icono blanco sobre velo turquesa al 20% en la escena 3D oscura) es decorativa, no texto (decisión del controlador).
  it("no primary fill uses white text in app or components, outside virtual-store", () => {
    expect(offenders(["app", "components"]).filter((x) => !x.startsWith("components/virtual-store"))).toEqual([]);
  });

  it("no #007272 literal or loloteal-dark remain in app/ and components/ (lib/virtual-store keeps a zoneHalo fallback)", () => {
    const bad: string[] = [];
    for (const { file, lines } of readSources(["app", "components"])) {
      lines.forEach((line, i) => {
        if (/#007272|loloteal-dark/i.test(line)) bad.push(`${file}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
    expect(readFileSync(join(ROOT, "app/globals.css"), "utf8")).not.toMatch(/#007272/i);
  });

  it("no hardcoded palette hex classes in components", () => {
    const bad: string[] = [];
    for (const { file, lines } of readSources(["app", "components"])) {
      lines.forEach((line, i) => {
        if (/bg-\[#22B8B8\]|text-\[#16302F\]|border-\[#0C7C7C\]|text-\[#0C7C7C\]|#9A3B2E/i.test(line)) bad.push(`${file}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});

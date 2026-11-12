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
});

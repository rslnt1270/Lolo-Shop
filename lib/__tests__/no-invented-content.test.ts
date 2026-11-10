// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
// Número de ejemplo que vivía en el modal; se arma por mitades para que este archivo no lo contenga.
const NUMERO_EJEMPLO = "52112" + "34567890";
const PROHIBIDOS: Array<[string, (s: string) => boolean]> = [
  ["número de ejemplo", (s) => s.includes(NUMERO_EJEMPLO)],
  ["Ghost Puffer", (s) => s.includes("Ghost Puffer")],
  ["LoloTech", (s) => s.includes("LoloTech")],
  ["promesa de apartado", (s) => /\bapart(a|as|ado|ados|ar|o)\b/i.test(s)],
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules" || name === "generated") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("contenido inventado ante el cliente", () => {
  const files = ["app", "components", "lib"].flatMap((d) => walk(path.join(ROOT, d)));

  it("recorre archivos", () => expect(files.length).toBeGreaterThan(20));

  it.each(PROHIBIDOS)("ningún archivo contiene: %s", (_nombre, test) => {
    const malos = files.filter((f) => test(readFileSync(f, "utf8"))).map((f) => path.relative(ROOT, f));
    expect(malos).toEqual([]);
  });
});

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules" || name === "generated") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

describe("cierre de la taxonomía", () => {
  it("PRODUCT_CATEGORIES ya no existe en app, lib ni components", () => {
    const hits = ["app", "lib", "components"]
      .flatMap((d) => walk(join(process.cwd(), d)))
      .filter((f) => readFileSync(f, "utf8").includes("PRODUCT_CATEGORIES"));
    expect(hits).toEqual([]);
  });
});

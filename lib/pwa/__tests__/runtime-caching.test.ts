import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { posRuntimeCaching, runtimeCaching } from "../runtime-caching.mjs";

const defaultCache = createRequire(import.meta.url)("next-pwa/cache") as unknown[];
const rule = posRuntimeCaching[0];
const match = (mode: string, path: string) =>
  rule.urlPattern({ request: { mode }, url: new URL(path, "https://loloshop.test") });

describe("runtime caching de /pos", () => {
  it("regla /pos: NetworkFirst, networkTimeoutSeconds 4, cacheName pos-page, solo 200, maxEntries 1", () => {
    expect(posRuntimeCaching).toHaveLength(1);
    expect(rule.handler).toBe("NetworkFirst");
    expect(rule.options.networkTimeoutSeconds).toBe(4);
    expect(rule.options.cacheName).toBe("pos-page");
    expect(rule.options.cacheableResponse.statuses).toEqual([200]);
    expect(rule.options.expiration.maxEntries).toBe(1);
  });

  it("solo coincide con navegaciones a /pos (no /api ni /posx)", () => {
    expect(match("navigate", "/pos")).toBe(true);
    expect(match("cors", "/pos")).toBe(false);
    expect(match("navigate", "/posx")).toBe(false);
    expect(match("navigate", "/pos/otra")).toBe(false);
    expect(match("navigate", "/api/pos")).toBe(false);
    expect(match("navigate", "/api/probador/x")).toBe(false);
    expect(match("navigate", "/probador")).toBe(false);
  });

  it("las reglas por omisión de next-pwa siguen después", () => {
    expect(runtimeCaching[0]).toBe(rule);
    expect(runtimeCaching.slice(1)).toEqual(defaultCache);
    expect(runtimeCaching.length).toBeGreaterThan(1);
  });
});

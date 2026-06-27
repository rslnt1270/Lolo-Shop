import { describe, it, expect } from "vitest";
import manifest from "../manifest.json";

describe("manifest PWA", () => {
  it("tiene los campos requeridos para ser instalable", () => {
    expect(manifest.name).toBe("LoloShop");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    expect(manifest.icons.some((i) => i.sizes === "512x512")).toBe(true);
  });
});

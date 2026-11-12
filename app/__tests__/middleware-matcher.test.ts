import { describe, expect, it } from "vitest";
import { config } from "@/middleware";

const re = new RegExp(`^${config.matcher[0]}$`);

describe("middleware matcher", () => {
  it("el matcher deja pasar /favoritos y /catalogo y protege /productos", () => {
    expect(re.test("/favoritos")).toBe(false);
    expect(re.test("/catalogo")).toBe(false);
    expect(re.test("/productos")).toBe(true);
    expect(re.test("/pos")).toBe(true);
  });
});

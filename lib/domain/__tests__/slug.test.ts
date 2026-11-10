import { describe, it, expect } from "vitest";
import { slugify } from "../slug";

describe("slugify", () => {
  it("recorta y pasa a minúsculas", () => expect(slugify("  GUESS  ")).toBe("guess"));
  it("quita acentos y eñes", () => expect(slugify("Niños")).toBe("ninos"));
  it("colapsa símbolos en un guion", () => expect(slugify("Dolce & Gabbana")).toBe("dolce-gabbana"));
});

import { describe, expect, it } from "vitest";
import { buildSuggestedTitle } from "../product-reference";
import { PRODUCT_TYPE_CATALOG, typeSingular } from "../product-types-catalog";

describe("singular por tipo", () => {
  it("cada tipo del catálogo tiene singular no vacío", () => {
    for (const t of PRODUCT_TYPE_CATALOG) expect(t.singular.trim()).not.toBe("");
  });
  it("singulares clave", () => {
    expect(typeSingular("playera", "Playeras")).toBe("Playera");
    expect(typeSingular("pantalon", "Pantalones")).toBe("Pantalón");
    expect(typeSingular("shorts", "Shorts")).toBe("Short");
    expect(typeSingular("traje-de-bano", "Trajes de baño")).toBe("Traje de baño");
    expect(typeSingular("tenis", "Tenis")).toBe("Tenis");
  });
  it("slug desconocido usa el respaldo", () => {
    expect(typeSingular("nuevo-tipo", "Nuevos tipos")).toBe("Nuevos tipos");
    expect(typeSingular(null, "")).toBe("");
  });
  it("título sugerido en singular", () => {
    expect(buildSuggestedTitle({ typeName: typeSingular("playera", "Playeras"), brand: "Guess", color: "negro" }))
      .toBe("Playera Guess negro");
  });
});

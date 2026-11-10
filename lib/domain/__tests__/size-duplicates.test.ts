import { describe, it, expect } from "vitest";
import { findSizeDuplicateGroups, normalizeTitleKey, stripTrailingSize, trailingSize } from "../size-duplicates";
import type { Product } from "../types";

const p = (id: string, title: string, over: Partial<Product> = {}): Product => ({
  id,
  title,
  category: "Polos",
  brand: "Nautica",
  imageUrl: null,
  brandId: "b1",
  departmentId: "d1",
  mergedIntoId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  isActive: true,
  variants: [],
  ...over,
});

describe("normalizeTitleKey", () => {
  it("quita acentos, mayúsculas, espacios dobles y la talla final", () => {
    expect(normalizeTitleKey("  Polo   Náutica - M ")).toBe("polo nautica");
    expect(normalizeTitleKey("POLO NAUTICA talla XL")).toBe("polo nautica");
    expect(normalizeTitleKey("Polo Nautica - 32")).toBe("polo nautica");
  });
  it("no quita un color ni una palabra que no es talla", () => {
    expect(normalizeTitleKey("Chamarra Nike - Negro")).toBe("chamarra nike - negro");
    expect(normalizeTitleKey("Chamarra Nike Negro")).toBe("chamarra nike negro");
    expect(normalizeTitleKey("Polo Nautica Slim")).toBe("polo nautica slim");
  });
  it("con un solo espacio quita una talla de letras o numérica al final", () => {
    expect(normalizeTitleKey("Polo Nautica M")).toBe("polo nautica");
    expect(normalizeTitleKey("Polo Nautica XXL")).toBe("polo nautica");
    expect(normalizeTitleKey("Blusa Guess CH")).toBe("blusa guess");
  });
  it("con un solo espacio un número es modelo, no talla (residual 3)", () => {
    for (const t of ["Nike Air Max 90", "Nike Chuck 70", "Jordan 1", "Pack de 3", "Jeans Levis 32", "Tenis Puma 26.5"]) {
      expect(normalizeTitleKey(t), t).toBe(t.toLowerCase());
      expect(trailingSize(t), t).toBeNull();
    }
  });
  it("las numéricas cuentan con ' - ' o ' talla '", () => {
    expect(normalizeTitleKey("Jeans Levis - 30")).toBe("jeans levis");
    expect(normalizeTitleKey("Jeans Levis talla 32")).toBe("jeans levis");
    expect(normalizeTitleKey("Tenis Puma - 26.5")).toBe("tenis puma");
  });
});

describe("trailingSize", () => {
  it("devuelve la talla final normalizada", () => {
    expect(trailingSize("Polo - M")).toBe("M");
    expect(trailingSize("Polo Nautica l")).toBe("L");
    expect(trailingSize("Polo talla xg")).toBe("XG");
    expect(trailingSize("Jeans - 32")).toBe("32");
  });
  it("sin talla reconocible o con talla única devuelve null", () => {
    expect(trailingSize("Chamarra Nike - Negro")).toBeNull();
    expect(trailingSize("Polo")).toBeNull();
    expect(trailingSize("Gorra - U")).toBeNull();
    expect(trailingSize("Gorra unitalla")).toBeNull();
  });
});

describe("findSizeDuplicateGroups", () => {
  it("'Polo Nautica - M' y 'Polo Nautica talla L' con misma marca y departamento forman grupo", () => {
    const groups = findSizeDuplicateGroups([p("a", "Polo Nautica - M"), p("b", "Polo Nautica talla L")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].products.map((x) => x.id).sort()).toEqual(["a", "b"]);
  });

  it("con distinto departamento o marca no forman grupo", () => {
    expect(findSizeDuplicateGroups([p("a", "Polo Nautica - M"), p("b", "Polo Nautica - L", { departmentId: "d2" })])).toEqual([]);
    expect(findSizeDuplicateGroups([p("a", "Polo Nautica - M"), p("b", "Polo Nautica - L", { brandId: "b2" })])).toEqual([]);
  });

  it("'Polo Nautica M' y 'Polo Nautica L', misma marca y sin departamento, forman un solo grupo", () => {
    const groups = findSizeDuplicateGroups([
      p("a", "Polo Nautica M", { departmentId: null }),
      p("b", "Polo Nautica L", { departmentId: null }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].products.map((x) => x.id).sort()).toEqual(["a", "b"]);
  });

  it("sin departamento no se junta con el mismo título que sí tiene departamento", () => {
    const groups = findSizeDuplicateGroups([
      p("a", "Polo - M", { departmentId: null }),
      p("b", "Polo - L"),
    ]);
    expect(groups).toEqual([]);
  });

  it("'Chamarra Nike - Negro' y 'Chamarra Nike - Blanco' no forman grupo: un color no es talla", () => {
    expect(findSizeDuplicateGroups([p("a", "Chamarra Nike - Negro"), p("b", "Chamarra Nike - Blanco")])).toEqual([]);
  });

  it("acentos y mayúsculas no separan", () => {
    expect(findSizeDuplicateGroups([p("a", "Polo Náutica - M"), p("b", "POLO NAUTICA - L")])).toHaveLength(1);
  });

  it("ignora productos inactivos, ya unidos y sin marca", () => {
    expect(findSizeDuplicateGroups([p("a", "Polo - M"), p("b", "Polo - L", { isActive: false })])).toEqual([]);
    expect(findSizeDuplicateGroups([p("a", "Polo - M"), p("b", "Polo - L", { mergedIntoId: "a" })])).toEqual([]);
    expect(findSizeDuplicateGroups([p("a", "Polo - M", { brandId: null }), p("b", "Polo - L", { brandId: null })])).toEqual([]);
  });

  it("un solo producto no es grupo", () => {
    expect(findSizeDuplicateGroups([p("a", "Polo - M")])).toEqual([]);
  });

  it("el sugerido es el de las dos fotos", () => {
    const groups = findSizeDuplicateGroups([
      p("a", "Polo - M", { createdAt: "2026-01-01T00:00:00.000Z" }),
      p("b", "Polo - L", { createdAt: "2026-02-01T00:00:00.000Z", imageUrl: "f", backImageUrl: "b" }),
    ]);
    expect(groups[0].suggestedTargetId).toBe("b");
  });

  it("si empatan en fotos, gana el más antiguo", () => {
    const groups = findSizeDuplicateGroups([
      p("a", "Polo - M", { createdAt: "2026-03-01T00:00:00.000Z" }),
      p("b", "Polo - L", { createdAt: "2026-02-01T00:00:00.000Z" }),
      p("c", "Polo - XL", { createdAt: "2026-04-01T00:00:00.000Z" }),
    ]);
    expect(groups[0].suggestedTargetId).toBe("b");
  });
});

describe("residual 3: modelos numéricos no forman grupo", () => {
  it("'Nike Air Max 90' y 'Nike Air Max 95' no forman grupo", () => {
    expect(findSizeDuplicateGroups([p("a", "Nike Air Max 90"), p("b", "Nike Air Max 95")])).toEqual([]);
  });
  it("'Polo Nautica M' y 'Polo Nautica L' sí; 'Jeans Levis - 30' y 'Jeans Levis talla 32' sí", () => {
    expect(findSizeDuplicateGroups([p("a", "Polo Nautica M"), p("b", "Polo Nautica L")])).toHaveLength(1);
    expect(findSizeDuplicateGroups([p("a", "Jeans Levis - 30"), p("b", "Jeans Levis talla 32")])).toHaveLength(1);
  });
});

describe("stripTrailingSize", () => {
  it("quita la talla final conservando mayúsculas y acentos", () => {
    expect(stripTrailingSize("Polo Náutica - M")).toBe("Polo Náutica");
    expect(stripTrailingSize("Polo talla XL")).toBe("Polo");
    expect(stripTrailingSize("Polo M")).toBe("Polo");
  });
  it("no toca modelos numéricos, tallas únicas ni títulos sin talla", () => {
    expect(stripTrailingSize("Nike Air Max 90")).toBe("Nike Air Max 90");
    expect(stripTrailingSize("Gorra - U")).toBe("Gorra - U");
    expect(stripTrailingSize("Polo")).toBe("Polo");
  });
});

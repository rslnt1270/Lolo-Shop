import { describe, it, expect } from "vitest";
import { normalizeSize, sortSizes } from "../sizes";
import { MAX_SIZES, validateNewProduct } from "../new-product";

describe("normalizeSize", () => {
  it("recorta, colapsa espacios y pasa letras a mayúsculas", () => {
    expect(normalizeSize(" xl ")).toBe("XL");
    expect(normalizeSize("  ch   grande ")).toBe("CH GRANDE");
    expect(normalizeSize("28")).toBe("28");
  });
  it("vacío → U", () => {
    expect(normalizeSize("")).toBe("U");
    expect(normalizeSize("   ")).toBe("U");
  });
});

describe("sortSizes", () => {
  it("letras internacionales en su orden", () => {
    expect(sortSizes(["L", "S", "XL", "M"])).toEqual(["S", "M", "L", "XL"]);
    expect(sortSizes(["XXXL", "XS", "XXL", "XXS"])).toEqual(["XXS", "XS", "XXL", "XXXL"]);
  });
  it("numéricas ascendentes y U al final", () => {
    expect(sortSizes(["28", "30", "U"])).toEqual(["28", "30", "U"]);
    expect(sortSizes(["U", "30", "28", "4.5"])).toEqual(["4.5", "28", "30", "U"]);
  });
  it("tallas mexicanas CH, M, G, XG", () => {
    expect(sortSizes(["G", "CH", "M"])).toEqual(["CH", "M", "G"]);
    expect(sortSizes(["XG", "G", "CH"])).toEqual(["CH", "G", "XG"]);
  });
  it("otras alfabéticas después de las conocidas y de las numéricas; no muta la entrada", () => {
    const input = ["U", "Unitalla", "ABC", "M", "10"];
    expect(sortSizes(input)).toEqual(["M", "10", "ABC", "Unitalla", "U"]);
    expect(input).toEqual(["U", "Unitalla", "ABC", "M", "10"]);
  });
});

describe("validateNewProduct: tallas", () => {
  const row = (size: string, barcode: string | null = null, price = 100, initialStock = 1) => ({ size, barcode, price, initialStock });
  const base = { description: "Algodón suave", title: "Playera", brandId: "b1", departmentId: "d1", productTypeId: "t1" };

  it("acepta 1 a 12 tallas y normaliza talla y código", () => {
    const out = validateNewProduct({ ...base, sizes: [row(" m ", " abc-1 "), row("")] });
    expect(out.sizes).toEqual([
      { size: "M", barcode: "ABC-1", price: 100, initialStock: 1 },
      { size: "U", barcode: null, price: 100, initialStock: 1 },
    ]);
    const twelve = Array.from({ length: MAX_SIZES }, (_, i) => row(String(20 + i)));
    expect(validateNewProduct({ ...base, sizes: twelve }).sizes).toHaveLength(12);
  });

  it("rechaza 0 o 13 tallas", () => {
    expect(() => validateNewProduct({ ...base, sizes: [] })).toThrow(/talla/i);
    const thirteen = Array.from({ length: 13 }, (_, i) => row(String(20 + i)));
    expect(() => validateNewProduct({ ...base, sizes: thirteen })).toThrow(/12/);
  });

  it("rechaza dos M sin código", () => {
    expect(() => validateNewProduct({ ...base, sizes: [row("M"), row(" m ")] })).toThrow(/talla M/);
  });

  it("dos M con códigos distintos sí se aceptan", () => {
    expect(validateNewProduct({ ...base, sizes: [row("M", "AAA-1"), row("M", "AAA-2")] }).sizes).toHaveLength(2);
  });

  it("rechaza dos filas con el mismo código (también si difieren en mayúsculas)", () => {
    expect(() => validateNewProduct({ ...base, sizes: [row("M", "abc-1"), row("L", "ABC-1")] })).toThrow(/ABC-1/);
  });

  it("código vacío (no null) o con dígito verificador incorrecto → error por fila", () => {
    expect(() => validateNewProduct({ ...base, sizes: [row("M", "  ")] })).toThrow(/Sin código/);
    expect(() => validateNewProduct({ ...base, sizes: [row("M", "4006381333932")] })).toThrow(/verificador/);
  });
});

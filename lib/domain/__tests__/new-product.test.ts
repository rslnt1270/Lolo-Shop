import { describe, it, expect } from "vitest";
import { PRODUCT_CATEGORIES, validateNewProduct } from "../new-product";

const valid = {
  title: "Playera Básica",
  brandId: "brand-1",
  departmentId: "dep-1",
  category: "Playeras",
  price: 299,
  initialStock: 0,
};

describe("validateNewProduct", () => {
  it("acepta un alta válida con stock inicial 0", () => {
    expect(() => validateNewProduct(valid)).not.toThrow();
  });

  it("exige título y marca", () => {
    expect(() => validateNewProduct({ ...valid, title: "  " })).toThrow("Título y marca son obligatorios.");
    expect(() => validateNewProduct({ ...valid, brandId: "" })).toThrow("Título y marca son obligatorios.");
  });

  it("exige el departamento", () => {
    expect(() => validateNewProduct({ ...valid, departmentId: "" })).toThrow("Elige el departamento.");
    expect(() => validateNewProduct({ ...valid, departmentId: "  " })).toThrow("Elige el departamento.");
  });

  it("exige una categoría de la lista", () => {
    expect(() => validateNewProduct({ ...valid, category: "" })).toThrow("Elige una categoría válida.");
    expect(() => validateNewProduct({ ...valid, category: "Inventada" })).toThrow("Elige una categoría válida.");
  });

  it("rechaza precio negativo o no numérico", () => {
    expect(() => validateNewProduct({ ...valid, price: -1 })).toThrow(/precio/);
    expect(() => validateNewProduct({ ...valid, price: Number.NaN })).toThrow(/precio/);
  });

  it("exige precio mayor a cero (también tras redondear a centavos)", () => {
    expect(() => validateNewProduct({ ...valid, price: 0 })).toThrow(/precio/);
    expect(() => validateNewProduct({ ...valid, price: 0.004 })).toThrow(/precio/);
  });

  it("tope de precio 99 999 999.99 (Decimal(10,2))", () => {
    expect(() => validateNewProduct({ ...valid, price: 99_999_999.99 })).not.toThrow();
    expect(() => validateNewProduct({ ...valid, price: 100_000_000 })).toThrow(/precio/);
  });

  it("devuelve el alta normalizada: precio a centavos y textos recortados", () => {
    const out = validateNewProduct({ ...valid, title: "  Gorra  ", brandId: " b1 ", price: 10.005 });
    expect(out.price).toBe(10.01);
    expect(out.title).toBe("Gorra");
    expect(out.brandId).toBe("b1");
    expect(validateNewProduct({ ...valid, price: 19.999 }).price).toBe(20);
  });

  it("limita el título a 120 caracteres", () => {
    expect(() => validateNewProduct({ ...valid, title: "a".repeat(120) })).not.toThrow();
    expect(() => validateNewProduct({ ...valid, title: "a".repeat(121) })).toThrow(/120/);
  });

  it("talla opcional: por defecto U y máximo 20 caracteres", () => {
    expect(validateNewProduct(valid).size).toBe("U");
    expect(validateNewProduct({ ...valid, size: " M " }).size).toBe("M");
    expect(() => validateNewProduct({ ...valid, size: "x".repeat(21) })).toThrow(/talla/i);
  });

  it("rechaza stock inicial negativo o con decimales", () => {
    expect(() => validateNewProduct({ ...valid, initialStock: -1 })).toThrow(/stock inicial/);
    expect(() => validateNewProduct({ ...valid, initialStock: 1.5 })).toThrow(/stock inicial/);
  });

  it("las categorías coinciden con las de /productos", () => {
    expect(PRODUCT_CATEGORIES).toContain("Playeras");
    expect(PRODUCT_CATEGORIES).toContain("Accesorios");
  });
});

describe("validateNewProduct: modos de alta y descripción", () => {
  const blob = (n: string) => `https://abc.public.blob.vercel-storage.com/productos/${n}.jpg`;

  it("modo catalog sin foto trasera es inválido con el mensaje exacto", () => {
    expect(() => validateNewProduct({ ...valid, mode: "catalog", imageUrl: blob("f") })).toThrow(
      "Para el catálogo se necesitan las dos fotos: frente y atrás.",
    );
    expect(() => validateNewProduct({ ...valid, mode: "catalog", backImageUrl: blob("b") })).toThrow(
      "Para el catálogo se necesitan las dos fotos: frente y atrás.",
    );
  });

  it("modo catalog valida las dos URLs con isProductBlobUrl", () => {
    expect(() =>
      validateNewProduct({ ...valid, mode: "catalog", imageUrl: blob("f"), backImageUrl: "https://evil.example/b.jpg" }),
    ).toThrow(/foto/);
    const ok = validateNewProduct({ ...valid, mode: "catalog", imageUrl: blob("f"), backImageUrl: blob("b") });
    expect(ok).toMatchObject({ mode: "catalog", imageUrl: blob("f"), backImageUrl: blob("b") });
  });

  it("modo stock (por defecto) acepta sin fotos e ignora las que lleguen", () => {
    expect(validateNewProduct(valid)).toMatchObject({ mode: "stock", imageUrl: null, backImageUrl: null });
    expect(validateNewProduct({ ...valid, mode: "stock", imageUrl: blob("f"), backImageUrl: "basura" })).toMatchObject({
      imageUrl: null, backImageUrl: null,
    });
  });

  it("descripción opcional, recortada y de máximo 500 caracteres", () => {
    expect(validateNewProduct(valid).description).toBeNull();
    expect(validateNewProduct({ ...valid, description: "  Algodón  " }).description).toBe("Algodón");
    expect(validateNewProduct({ ...valid, description: "a".repeat(500) }).description).toHaveLength(500);
    expect(() => validateNewProduct({ ...valid, description: "a".repeat(501) })).toThrow(/500/);
  });
});

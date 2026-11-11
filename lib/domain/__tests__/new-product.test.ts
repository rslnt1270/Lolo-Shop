import { describe, it, expect } from "vitest";
import { PRODUCT_TYPE_CATALOG } from "../product-types-catalog";
import { validateNewProduct } from "../new-product";

const valid = {
  title: "Playera Básica",
  brandId: "brand-1",
  departmentId: "dep-1",
  productTypeId: "type-1",
  sizes: [{ size: "", barcode: null, price: 299, initialStock: 0 }],
};
/** Alta válida con la única talla modificada (antes `price`, `size` e `initialStock` eran sueltos). */
const row = (patch: Record<string, unknown>) => ({ ...valid, sizes: [{ ...valid.sizes[0], ...patch }] });

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

  it("un category suelto no sustituye al tipo: sin productTypeId lanza 'Elige el tipo.'", () => {
    const legacy = { ...valid, productTypeId: undefined, category: "Playeras" } as unknown as Parameters<typeof validateNewProduct>[0];
    expect(() => validateNewProduct(legacy)).toThrow("Elige el tipo.");
  });

  it("sin productTypeId lanza 'Elige el tipo.'", () => {
    expect(() => validateNewProduct({ ...valid, productTypeId: "" })).toThrow("Elige el tipo.");
    expect(() => validateNewProduct({ ...valid, productTypeId: undefined as unknown as string })).toThrow("Elige el tipo.");
  });

  it("validateNewProduct con audience fuera de la lista lanza el mensaje de para", () => {
    expect(() => validateNewProduct({ ...valid, audience: "Niño" })).toThrow(
      "Elige para quién es: dama, caballero o niño.",
    );
    expect(validateNewProduct({ ...valid, audience: "nino" }).audience).toBe("nino");
  });

  it("rechaza precio negativo o no numérico", () => {
    expect(() => validateNewProduct(row({ price: -1 }))).toThrow(/precio/);
    expect(() => validateNewProduct(row({ price: Number.NaN }))).toThrow(/precio/);
  });

  it("exige precio mayor a cero (también tras redondear a centavos)", () => {
    expect(() => validateNewProduct(row({ price: 0 }))).toThrow(/precio/);
    expect(() => validateNewProduct(row({ price: 0.004 }))).toThrow(/precio/);
  });

  it("tope de precio 99 999 999.99 (Decimal(10,2))", () => {
    expect(() => validateNewProduct(row({ price: 99_999_999.99 }))).not.toThrow();
    expect(() => validateNewProduct(row({ price: 100_000_000 }))).toThrow(/precio/);
  });

  it("devuelve el alta normalizada: precio a centavos y textos recortados", () => {
    const out = validateNewProduct({ ...row({ price: 10.005 }), title: "  Gorra  ", brandId: " b1 " });
    expect(out.sizes[0].price).toBe(10.01);
    expect(out.title).toBe("Gorra");
    expect(out.brandId).toBe("b1");
    expect(validateNewProduct(row({ price: 19.999 })).sizes[0].price).toBe(20);
  });

  it("limita el título a 120 caracteres", () => {
    expect(() => validateNewProduct({ ...valid, title: "a".repeat(120) })).not.toThrow();
    expect(() => validateNewProduct({ ...valid, title: "a".repeat(121) })).toThrow(/120/);
  });

  it("talla opcional: por defecto U y máximo 20 caracteres", () => {
    expect(validateNewProduct(valid).sizes[0].size).toBe("U");
    expect(validateNewProduct(row({ size: " M " })).sizes[0].size).toBe("M");
    expect(() => validateNewProduct(row({ size: "x".repeat(21) }))).toThrow(/talla/i);
  });

  it("rechaza stock inicial negativo o con decimales", () => {
    expect(() => validateNewProduct(row({ initialStock: -1 }))).toThrow(/stock inicial/);
    expect(() => validateNewProduct(row({ initialStock: 1.5 }))).toThrow(/stock inicial/);
  });

  it("PRODUCT_TYPE_CATALOG contiene playera y gorra", () => {
    const slugs = PRODUCT_TYPE_CATALOG.map((t) => t.slug);
    expect(slugs).toContain("playera");
    expect(slugs).toContain("gorra");
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

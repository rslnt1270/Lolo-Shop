import { describe, expect, it } from "vitest";
import {
  classificationIssues, typesForDepartment, validateClassification, type ClassificationRules,
} from "../product-taxonomy";
import {
  DEPARTMENT_TYPE_SLUGS, LEGACY_CATEGORY_TO_TYPE, PRODUCT_TYPE_CATALOG, STYLE_OPTIONS,
} from "../product-types-catalog";

const slugs = PRODUCT_TYPE_CATALOG.map((t) => t.slug);
const ok = { slug: "playera", isActive: true, appliesToDepartment: true };

describe("catálogo", () => {
  it("29 tipos con slugs y nombres únicos y sortOrder 1 a 29", () => {
    expect(PRODUCT_TYPE_CATALOG).toHaveLength(29);
    expect(new Set(slugs).size).toBe(29);
    expect(new Set(PRODUCT_TYPE_CATALOG.map((t) => t.name)).size).toBe(29);
    expect(PRODUCT_TYPE_CATALOG.map((t) => t.sortOrder)).toEqual(Array.from({ length: 29 }, (_, i) => i + 1));
  });

  it("55 pares y cada slug existe en PRODUCT_TYPE_CATALOG", () => {
    const all = Object.values(DEPARTMENT_TYPE_SLUGS).flat();
    expect(all).toHaveLength(55);
    expect(Object.values(DEPARTMENT_TYPE_SLUGS).map((l) => l.length)).toEqual([16, 12, 14, 4, 9]);
    for (const s of all) expect(slugs).toContain(s);
    for (const list of Object.values(DEPARTMENT_TYPE_SLUGS)) expect(new Set(list).size).toBe(list.length);
  });

  it("llaves de LEGACY_CATEGORY_TO_TYPE y STYLE_OPTIONS apuntan a slugs del catálogo", () => {
    for (const s of Object.values(LEGACY_CATEGORY_TO_TYPE)) expect(slugs).toContain(s);
    for (const s of Object.keys(STYLE_OPTIONS)) expect(slugs).toContain(s);
  });

  it("STYLE_OPTIONS.playera contiene polo", () => {
    expect(STYLE_OPTIONS.playera.map((o) => o.slug)).toContain("polo");
  });
});

describe("validateClassification", () => {
  it("tipo nulo lanza 'Elige el tipo.'", () => {
    expect(() => validateClassification({ departmentSlug: "dama", type: null })).toThrow("Elige el tipo.");
  });
  it("tipo inactivo lanza el mensaje de inactivo", () => {
    expect(() => validateClassification({ departmentSlug: "dama", type: { ...ok, isActive: false } })).toThrow(
      "Ese tipo ya no está activo. Elige otro de la lista.",
    );
  });
  it("tipo que no aplica lanza el mensaje de no aplica", () => {
    expect(() =>
      validateClassification({ departmentSlug: "dama", type: { ...ok, appliesToDepartment: false } }),
    ).toThrow("Ese tipo no aplica al departamento elegido. Elige otro de la lista.");
  });
  it("Calzado sin para lanza el mensaje de Calzado", () => {
    const type = { slug: "tenis", isActive: true, appliesToDepartment: true };
    expect(() => validateClassification({ departmentSlug: "calzado", type })).toThrow(
      "En Calzado elige para quién es: dama, caballero o niño.",
    );
    expect(validateClassification({ departmentSlug: "calzado", type, audience: "nino" })).toEqual({
      style: null, audience: "nino",
    });
  });
  it("para 'Niño' con mayúscula es inválido", () => {
    const type = { slug: "tenis", isActive: true, appliesToDepartment: true };
    expect(() => validateClassification({ departmentSlug: "calzado", type, audience: "Niño" })).toThrow(
      "Elige para quién es: dama, caballero o niño.",
    );
  });
  it("para en Dama lanza «Para» solo se usa en Calzado.", () => {
    expect(() => validateClassification({ departmentSlug: "dama", type: ok, audience: "dama" })).toThrow(
      "«Para» solo se usa en Calzado.",
    );
  });
  it("playera con polo devuelve style polo", () => {
    expect(validateClassification({ departmentSlug: "dama", type: ok, style: "polo" })).toEqual({
      style: "polo", audience: null,
    });
  });
  it("playera con con-capucha lanza 'Ese estilo no aplica a ese tipo.'", () => {
    expect(() => validateClassification({ departmentSlug: "dama", type: ok, style: "con-capucha" })).toThrow(
      "Ese estilo no aplica a ese tipo.",
    );
  });
  it("estilo vacío se guarda como null", () => {
    expect(validateClassification({ departmentSlug: "dama", type: ok, style: "" }).style).toBeNull();
    expect(validateClassification({ departmentSlug: "dama", type: ok, style: null }).style).toBeNull();
  });
});

const rules: ClassificationRules = {
  departments: [{ id: "d-dama", slug: "dama" }, { id: "d-cal", slug: "calzado" }],
  types: [
    { id: "t-play", slug: "playera", departmentIds: ["d-dama"] },
    { id: "t-tenis", slug: "tenis", departmentIds: ["d-cal"] },
    { id: "t-sud", slug: "sudadera", departmentIds: ["d-dama"] },
  ],
};
const base = { departmentId: null, productTypeId: null, style: null, audience: null };

describe("classificationIssues", () => {
  it("sin departamento ni tipo → SIN_DEPARTAMENTO, SIN_TIPO", () => {
    expect(classificationIssues(base, rules)).toEqual(["SIN_DEPARTAMENTO", "SIN_TIPO"]);
  });
  it("playera en Calzado → TIPO_NO_APLICA y FALTA_PARA", () => {
    expect(classificationIssues({ ...base, departmentId: "d-cal", productTypeId: "t-play" }, rules)).toEqual([
      "TIPO_NO_APLICA", "FALTA_PARA",
    ]);
  });
  it("producto completo → []", () => {
    expect(classificationIssues({ ...base, departmentId: "d-dama", productTypeId: "t-play", style: "polo" }, rules)).toEqual([]);
  });
  it("tipo que no está entre los activos → TIPO_INACTIVO", () => {
    expect(classificationIssues({ ...base, departmentId: "d-dama", productTypeId: "t-viejo" }, rules)).toEqual([
      "TIPO_INACTIVO",
    ]);
  });
  it("para en Dama → PARA_SOBRA", () => {
    expect(
      classificationIssues({ ...base, departmentId: "d-dama", productTypeId: "t-play", audience: "dama" }, rules),
    ).toEqual(["PARA_SOBRA"]);
  });
  it("estilo de otro tipo → ESTILO_NO_APLICA", () => {
    expect(
      classificationIssues({ ...base, departmentId: "d-dama", productTypeId: "t-play", style: "con-capucha" }, rules),
    ).toEqual(["ESTILO_NO_APLICA"]);
  });
  it("tenis de niño en Calzado → []", () => {
    expect(
      classificationIssues({ ...base, departmentId: "d-cal", productTypeId: "t-tenis", audience: "nino" }, rules),
    ).toEqual([]);
  });
});

describe("typesForDepartment", () => {
  it("en Calzado solo devuelve tenis", () => {
    expect(typesForDepartment(rules.types, "d-cal").map((t) => t.slug)).toEqual(["tenis"]);
  });
});

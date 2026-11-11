import { describe, it, expect } from "vitest";
import {
  colorApplies,
  normalizeColorKey,
  displayColor,
  buildSuggestedTitle,
  validateReference,
  productPhotoStatus,
  BASE_COLORS,
} from "@/lib/domain/product-reference";

describe("product-reference", () => {
  it("expone los 12 colores base", () => {
    expect(BASE_COLORS).toHaveLength(12);
    expect(BASE_COLORS[0]).toBe("Negro");
  });

  it("C10: el color se oculta en Accesorios y en Perfume", () => {
    expect(colorApplies({ departmentSlug: "accesorios", typeSlug: "gorra" })).toBe(false);
    expect(colorApplies({ departmentSlug: "dama", typeSlug: "perfume" })).toBe(false);
    expect(colorApplies({ departmentSlug: null, typeSlug: null })).toBe(true);
    expect(
      validateReference({ brand: "Hugo Boss", color: "azul", departmentSlug: "accesorios", typeSlug: "perfume" }).color
    ).toBeNull();
  });

  it("C10: el color es opcional en Playeras", () => {
    const r = validateReference({ brand: "ALO", color: null, departmentSlug: "dama", typeSlug: "playera" });
    expect(r.color).toBeNull();
  });

  it('C11: "Rosa" y "rosas" dan la misma clave', () => {
    expect(normalizeColorKey("Rosa")).toBe("rosa");
    expect(normalizeColorKey("rosas")).toBe("rosa");
    expect(normalizeColorKey("Azules")).toBe("azul");
    expect(normalizeColorKey("Café")).toBe(normalizeColorKey("cafés"));
  });

  it("review: color con emoji o solo espacios se rechaza o se limpia", () => {
    expect(normalizeColorKey("🔥🔥")).toBe("");
    expect(normalizeColorKey("   ")).toBe("");
    expect(
      validateReference({ brand: "ALO", color: "   ", departmentSlug: "dama", typeSlug: "playera" }).color
    ).toBeNull();
    expect(normalizeColorKey("rosa 🔥")).toBe("rosa");
  });

  it("displayColor capitaliza y colapsa espacios", () => {
    expect(displayColor("  ROSA   palo ")).toBe("Rosa palo");
  });

  it("color de más de 40 caracteres lanza", () => {
    expect(() =>
      validateReference({ brand: "ALO", color: "a".repeat(41), departmentSlug: "dama", typeSlug: "playera" })
    ).toThrow("El color puede tener máximo 40 caracteres.");
  });

  it("C9: no se guarda sin marca", () => {
    expect(() =>
      validateReference({ brand: "  ", color: null, departmentSlug: "dama", typeSlug: "playera" })
    ).toThrow("Elige la marca.");
  });

  it("C12: el título sugerido es tipo + marca + color", () => {
    expect(buildSuggestedTitle({ typeName: "Leggins", brand: "ALO", color: "rosa" })).toBe("Leggins ALO rosa");
  });

  it("C12: sin color queda tipo + marca", () => {
    expect(buildSuggestedTitle({ typeName: "Perfume", brand: "Hugo Boss", color: null })).toBe("Perfume Hugo Boss");
  });

  it("C13: productPhotoStatus sin fotos", () => {
    expect(productPhotoStatus({ hasFront: false, hasBack: false, hasStock: true })).toBe("Solo stock");
  });

  it("C14: productPhotoStatus con una foto", () => {
    expect(productPhotoStatus({ hasFront: true, hasBack: false, hasStock: true })).toBe(
      "Falta completar registro fotográfico"
    );
    expect(productPhotoStatus({ hasFront: false, hasBack: true, hasStock: true })).toBe(
      "Falta completar registro fotográfico"
    );
  });

  it("C15: productPhotoStatus con dos fotos y existencias", () => {
    expect(productPhotoStatus({ hasFront: true, hasBack: true, hasStock: true })).toBe("Listo para catálogo");
  });

  it("review: productPhotoStatus con dos fotos sin existencias", () => {
    expect(productPhotoStatus({ hasFront: true, hasBack: true, hasStock: false })).toBe(
      "Fotos completas, sin existencias"
    );
  });
});

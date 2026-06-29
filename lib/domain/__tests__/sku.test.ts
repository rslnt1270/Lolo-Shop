import { describe, it, expect } from "vitest";
import { generateSku } from "../sku";

describe("generateSku", () => {
  it("genera SKU con prefijo LS y tres primeras letras en mayúscula", () => {
    expect(
      generateSku({ category: "Playeras", brand: "Guess", size: "M", color: "Blanco" })
    ).toBe("LS-PLA-GUE-M-BLA");
  });

  it("normaliza acentos a letras ASCII", () => {
    expect(
      generateSku({ category: "Pantalones", brand: "Adídas", size: "L", color: "Café" })
    ).toBe("LS-PAN-ADI-L-CAF");
  });

  it("ignora espacios al tomar las iniciales", () => {
    expect(
      generateSku({ category: "Raquetas de Padel", brand: "Head", size: "Única", color: "Negro" })
    ).toBe("LS-RAQ-HEA-UNI-NEG");
  });

  it("rellena con X cuando el texto es más corto que 3", () => {
    expect(
      generateSku({ category: "Tenis", brand: "K", size: "8", color: "Az" })
    ).toBe("LS-TEN-KXX-8-AZX");
  });

  it("convierte todo a mayúsculas", () => {
    expect(
      generateSku({ category: "hoodies", brand: "ny", size: "xl", color: "rojo" })
    ).toBe("LS-HOO-NYX-XL-ROJ");
  });
});

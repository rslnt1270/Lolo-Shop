import { describe, it, expect, vi, afterEach } from "vitest";
import {
  normalizeCode,
  codeCandidates,
  isValidGtin,
  generateInternalSku,
  isValidInternalSku,
} from "../barcode";

describe("normalizeCode", () => {
  it("quita espacios, saltos y caracteres de control que mete el lector", () => {
    expect(normalizeCode("  7501234567890\r\n")).toBe("7501234567890");
    expect(normalizeCode("750 1234 567890")).toBe("7501234567890");
    expect(normalizeCode("\u001d750123\t")).toBe("750123");
  });

  it("conserva mayúsculas/minúsculas (los barcode alfanuméricos se guardan tal cual)", () => {
    expect(normalizeCode(" abC-12 ")).toBe("abC-12");
  });

  it("devuelve cadena vacía si no hay nada", () => {
    expect(normalizeCode("   ")).toBe("");
  });
});

describe("codeCandidates", () => {
  it("UPC-A (12) también busca su forma EAN-13 con 0 inicial", () => {
    expect(codeCandidates("036000291452")).toEqual(["036000291452", "0036000291452"]);
  });

  it("EAN-13 con 0 inicial también busca su forma UPC-A", () => {
    expect(codeCandidates("0036000291452")).toEqual(["0036000291452", "036000291452"]);
  });

  it("EAN-13 sin 0 inicial no genera alternativas", () => {
    expect(codeCandidates("7501234567890")).toEqual(["7501234567890"]);
  });

  it("alfanumérico: agrega la versión en mayúsculas (SKU tecleado en minúsculas)", () => {
    expect(codeCandidates(" ls-abc123-x ")).toEqual(["ls-abc123-x", "LS-ABC123-X"]);
  });

  it("alfanumérico en mayúsculas: conserva la forma original y la mayúscula", () => {
    expect(codeCandidates("ABC-1")).toEqual(["ABC-1"]);
    expect(codeCandidates("abc-1")).toEqual(["abc-1", "ABC-1"]);
  });

  it("vacío → sin candidatos", () => {
    expect(codeCandidates("  ")).toEqual([]);
  });
});

describe("isValidGtin", () => {
  it("acepta GTIN válidos de 8, 12, 13 y 14 dígitos", () => {
    expect(isValidGtin("96385074")).toBe(true); // EAN-8
    expect(isValidGtin("036000291452")).toBe(true); // UPC-A
    expect(isValidGtin("4006381333931")).toBe(true); // EAN-13
    expect(isValidGtin("00012345600012")).toBe(true); // GTIN-14
  });

  it("rechaza dígito verificador incorrecto", () => {
    expect(isValidGtin("96385075")).toBe(false);
    expect(isValidGtin("036000291453")).toBe(false);
    expect(isValidGtin("4006381333932")).toBe(false);
    expect(isValidGtin("00012345600013")).toBe(false);
  });

  it("no aplica (true) a códigos no numéricos o de otra longitud", () => {
    expect(isValidGtin("LS-ABC123-X")).toBe(true);
    expect(isValidGtin("ABC-12")).toBe(true);
    expect(isValidGtin("12345")).toBe(true);
  });

  it("normaliza antes de validar", () => {
    expect(isValidGtin(" 4006381333931\n")).toBe(true);
  });
});

describe("generateInternalSku / isValidInternalSku", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("formato LS-XXXXXX-C con alfabeto Crockford", () => {
    for (let i = 0; i < 1000; i++) {
      const sku = generateInternalSku();
      expect(sku).toMatch(/^LS-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]$/);
      expect(isValidInternalSku(sku)).toBe(true);
    }
  });

  it("usa crypto.getRandomValues", () => {
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    generateInternalSku();
    expect(spy).toHaveBeenCalled();
  });

  it("checksum mod 37 determinista", () => {
    // Σ valor·(2i+1) mod 32: 000000 → 0 → "0"; 00000Z → 31·11=341 → 21 → "N";
    // 000011 → 1·9 + 1·11 = 20 → "M"
    expect(isValidInternalSku("LS-000000-0")).toBe(true);
    expect(isValidInternalSku("LS-00000Z-N")).toBe(true);
    expect(isValidInternalSku("LS-000011-M")).toBe(true);
  });

  it("el carácter de control es solo Crockford (sin * ~ $ = U)", () => {
    expect(isValidInternalSku("LS-NYBDHH-~")).toBe(false);
    expect(isValidInternalSku("LS-000000-U")).toBe(false);
  });

  it("detecta un carácter alterado o el checksum incorrecto", () => {
    const sku = generateInternalSku();
    const body = sku.slice(3, 9);
    const swapped = body[0] === "0" ? "1" + body.slice(1) : "0" + body.slice(1);
    expect(isValidInternalSku(`LS-${swapped}-${sku[10]}`)).toBe(false);
    expect(isValidInternalSku("LS-000000-1")).toBe(false);
  });

  it("rechaza formatos ajenos (SKU viejos, barcodes)", () => {
    expect(isValidInternalSku("LS-PLA-GUE-M-BLA")).toBe(false);
    expect(isValidInternalSku("7501234567890")).toBe(false);
    expect(isValidInternalSku("LS-00000I-0")).toBe(false); // I no es Crockford
  });

  it("acepta minúsculas y espacios del operador", () => {
    expect(isValidInternalSku(" ls-00000z-n ")).toBe(true);
  });
});

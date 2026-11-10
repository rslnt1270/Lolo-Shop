import { describe, it, expect } from "vitest";
import { validateStockMovement, validateReason } from "../stock-movement";

const base = {
  variantId: "v1",
  locationId: "l1",
  requestId: "3f2b8c1e-9a4d-4e7b-8c55-0a1b2c3d4e5f",
};

describe("validateStockMovement", () => {
  it.each([0, 201, 1.5, 2 ** 31, -1, NaN])("rechaza la cantidad %s", (quantity) => {
    expect(validateStockMovement({ ...base, kind: "restock", quantity }).ok).toBe(false);
  });

  it("rechaza una cantidad que no es número", () => {
    expect(validateStockMovement({ ...base, kind: "restock", quantity: "3" }).ok).toBe(false);
  });

  it("acepta los límites 1 y 200", () => {
    expect(validateStockMovement({ ...base, kind: "restock", quantity: 1 }).ok).toBe(true);
    expect(validateStockMovement({ ...base, kind: "restock", quantity: 200 }).ok).toBe(true);
  });

  it("damage sin motivo es inválido", () => {
    expect(validateStockMovement({ ...base, kind: "damage", quantity: 1 }).ok).toBe(false);
  });

  it("motivo con 7 dígitos es inválido", () => {
    const r = validateStockMovement({ ...base, kind: "damage", quantity: 1, reason: "ref 1234567" });
    expect(r.ok).toBe(false);
  });

  it("damage 2 resta 2", () => {
    const r = validateStockMovement({ ...base, kind: "damage", quantity: 2, reason: "Manchada" });
    expect(r).toEqual({
      ok: true,
      value: { ...base, kind: "damage", delta: -2, reason: "Manchada" },
    });
  });

  it("adjustment in 3 suma 3 y out 3 resta 3", () => {
    const i = validateStockMovement({ ...base, kind: "adjustment", direction: "in", quantity: 3, reason: "Conteo" });
    const o = validateStockMovement({ ...base, kind: "adjustment", direction: "out", quantity: 3, reason: "Conteo" });
    expect(i.ok && i.value.delta).toBe(3);
    expect(o.ok && o.value.delta).toBe(-3);
  });

  it("adjustment sin dirección es inválido", () => {
    expect(validateStockMovement({ ...base, kind: "adjustment", quantity: 3, reason: "Conteo" }).ok).toBe(false);
  });

  it("restock sin motivo es válido con reason null", () => {
    const r = validateStockMovement({ ...base, kind: "restock", quantity: 4 });
    expect(r.ok && r.value.reason).toBeNull();
    expect(r.ok && r.value.delta).toBe(4);
  });

  it("rechaza kind desconocido (por ejemplo salida) y requestId que no es UUID", () => {
    expect(validateStockMovement({ ...base, kind: "out", quantity: 1 }).ok).toBe(false);
    expect(validateStockMovement({ ...base, kind: "restock", quantity: 1, requestId: "abc" }).ok).toBe(false);
  });

  it("rechaza entrada que no es objeto o sin ids", () => {
    expect(validateStockMovement(null).ok).toBe(false);
    expect(validateStockMovement({ ...base, kind: "restock", quantity: 1, variantId: "" }).ok).toBe(false);
  });
});

describe("validateReason", () => {
  it("recorta y devuelve el motivo", () => {
    expect(validateReason("  Manchada  ", true)).toBe("Manchada");
  });
  it("opcional vacío devuelve null", () => {
    expect(validateReason("", false)).toBeNull();
    expect(validateReason(undefined, false)).toBeNull();
  });
  it("obligatorio vacío lanza 'Escribe el motivo.'", () => {
    expect(() => validateReason("  ", true)).toThrow("Escribe el motivo.");
    expect(() => validateReason(undefined, true)).toThrow("Escribe el motivo.");
  });
  it("lanza con menos de 3, más de 120 y con 7+ dígitos", () => {
    expect(() => validateReason("ab", true)).toThrow();
    expect(() => validateReason("a".repeat(121), true)).toThrow();
    expect(() => validateReason("llamar 5512345678", true)).toThrow();
  });
  it("opcional con valor inválido también lanza", () => {
    expect(() => validateReason("ab", false)).toThrow();
  });
  it("acepta 6 dígitos y exactamente 120 caracteres", () => {
    expect(validateReason("lote 123456", true)).toBe("lote 123456");
    expect(validateReason("a".repeat(120), true)).toHaveLength(120);
  });
});

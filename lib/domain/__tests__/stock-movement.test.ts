import { describe, it, expect } from "vitest";
import { validateStockMovement, validateReason, validateTransfer } from "../stock-movement";

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

  it("motivo con 7 dígitos es inválido", () => {
    const r = validateStockMovement({ ...base, kind: "restock", quantity: 1, reason: "ref 1234567" });
    expect(r.ok).toBe(false);
  });

  it.each(["damage", "adjustment"])("%s ya no existe: INVALID", (kind) => {
    expect(validateStockMovement({ ...base, kind, direction: "in", quantity: 1, reason: "Manchada" }).ok).toBe(false);
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
    expect(() => validateReason(`llamar ${"0".repeat(10)}`, true)).toThrow();
  });
  it("opcional con valor inválido también lanza", () => {
    expect(() => validateReason("ab", false)).toThrow();
  });
  it("acepta 6 dígitos y exactamente 120 caracteres", () => {
    expect(validateReason("lote 123456", true)).toBe("lote 123456");
    expect(validateReason("a".repeat(120), true)).toHaveLength(120);
  });
});

describe("validateTransfer", () => {
  const t = {
    variantId: "v1",
    fromLocationId: "l1",
    toLocationId: "l2",
    quantity: 2,
    requestId: "3f2b8c1e-9a4d-4e7b-8c55-0a1b2c3d4e5f",
  };

  it("acepta un traspaso sin motivo", () => {
    expect(validateTransfer(t)).toEqual({
      ok: true,
      value: { ...t, reason: null },
    });
  });

  it("acepta un traspaso con motivo", () => {
    const r = validateTransfer({ ...t, reason: "  Reposición  " });
    expect(r).toEqual({ ok: true, value: { ...t, reason: "Reposición" } });
  });

  it("rechaza origen igual a destino", () => {
    expect(validateTransfer({ ...t, toLocationId: "l1" })).toEqual({
      ok: false,
      message: "Elige otra tienda de destino.",
    });
  });

  it.each([0, 201, 1.5, "2"])("rechaza la cantidad %s", (quantity) => {
    expect(validateTransfer({ ...t, quantity })).toEqual({
      ok: false,
      message: "La cantidad debe ser un entero entre 1 y 200.",
    });
  });

  it("rechaza requestId que no es UUID", () => {
    expect(validateTransfer({ ...t, requestId: "abc" })).toEqual({
      ok: false,
      message: "Identificador de la operación inválido.",
    });
  });

  it("rechaza motivo de 2 caracteres", () => {
    expect(validateTransfer({ ...t, reason: "ab" }).ok).toBe(false);
  });

  it("rechaza motivo con un teléfono", () => {
    expect(validateTransfer({ ...t, reason: "llamar 5512345678" }).ok).toBe(false);
  });

  it("pide la prenda y las tiendas", () => {
    expect(validateTransfer({ ...t, variantId: "" })).toEqual({ ok: false, message: "Falta la prenda." });
    expect(validateTransfer({ ...t, fromLocationId: "" })).toEqual({ ok: false, message: "Falta la tienda." });
    expect(validateTransfer({ ...t, toLocationId: undefined })).toEqual({ ok: false, message: "Falta la tienda." });
  });

  it("rechaza datos que no son objeto", () => {
    expect(validateTransfer(null).ok).toBe(false);
  });
});

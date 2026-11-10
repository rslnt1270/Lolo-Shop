import { describe, it, expect } from "vitest";
import { validateNewSale, initialStatus, saleTotal, businessDateMx, isSameSaleRequest } from "../sale";

const base = {
  clientRequestId: "3f2b8c1e-9d4a-4e6b-8a1c-2b7d5e9f0a11",
  locationId: "loc1",
  channel: "store",
  paymentMethod: "cash",
  lines: [{ variantId: "v1", quantity: 1, unitPrice: 100 }],
};
const withPatch = (patch: object) => validateNewSale({ ...base, ...patch });

describe("businessDateMx", () => {
  it("23:30 en México sigue siendo el día anterior", () => {
    expect(businessDateMx(new Date("2026-11-14T05:30:00Z"))).toBe("2026-11-13");
  });
  it("00:30 en México ya es el día siguiente", () => {
    expect(businessDateMx(new Date("2026-11-14T06:30:00Z"))).toBe("2026-11-14");
  });
});

describe("initialStatus", () => {
  it("SPAY queda pendiente; efectivo y tarjeta pagados", () => {
    expect(initialStatus("spay_transfer")).toBe("pending_payment");
    expect(initialStatus("cash")).toBe("paid");
    expect(initialStatus("card")).toBe("paid");
  });
});

describe("saleTotal", () => {
  it("suma sin deriva de flotantes", () => {
    expect(saleTotal([
      { variantId: "a", quantity: 2, unitPrice: 199.9 },
      { variantId: "b", quantity: 1, unitPrice: 0.1 },
    ])).toBe(399.9);
  });
});

describe("validateNewSale", () => {
  it("acepta una venta válida y alias natural", () => {
    const r = withPatch({ customerAlias: "chamarra azul 2" });
    expect(r.ok).toBe(true);
  });
  it("recorta alias y referencia, y los omite si quedan vacíos", () => {
    const r = withPatch({ customerAlias: "  Ana  ", paymentReference: "   " });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.value.customerAlias).toBe("Ana");
      expect(r.value.paymentReference).toBeUndefined();
    }
  });
  it("rechaza venta sin líneas", () => expect(withPatch({ lines: [] }).ok).toBe(false));
  it.each([0, -1, 1.5])("rechaza quantity %s", (quantity) => {
    expect(withPatch({ lines: [{ variantId: "v1", quantity, unitPrice: 10 }] }).ok).toBe(false);
  });
  it("rechaza unitPrice negativo", () => {
    expect(withPatch({ lines: [{ variantId: "v1", quantity: 1, unitPrice: -1 }] }).ok).toBe(false);
  });
  it("rechaza variante repetida", () => {
    const l = { variantId: "v1", quantity: 1, unitPrice: 10 };
    expect(withPatch({ lines: [l, l] }).ok).toBe(false);
  });
  it("rechaza alias de 41 caracteres", () => {
    expect(withPatch({ customerAlias: "a".repeat(41) }).ok).toBe(false);
    expect(withPatch({ customerAlias: "a".repeat(40) }).ok).toBe(true);
  });
  it("rechaza alias con 7 o más dígitos seguidos", () => {
    expect(withPatch({ customerAlias: `Ana ${"0".repeat(10)}` }).ok).toBe(false);
  });
  it.each(["Ana 55 1234 5678", "Ana 55-1234-5678", "(55) 1234.5678"])("rechaza alias con teléfono separado: %s", (customerAlias) => {
    expect(withPatch({ customerAlias }).ok).toBe(false);
  });
  it.each(["55/1234/5678", "+52 55 1234 5678", "55_1234_5678", "５５１２３４５６７８", "Ana: 55*12*34*56"])(
    "rechaza alias con teléfono y cualquier separador o dígitos de ancho completo: %s",
    (customerAlias) => {
      expect(withPatch({ customerAlias }).ok).toBe(false);
    },
  );
  it.each(["Talla 38 y 40", "pedido 12 34", "chamarra azul 2"])("acepta alias con pocos dígitos: %s", (customerAlias) => {
    expect(withPatch({ customerAlias }).ok).toBe(true);
  });
  it("rechaza clientRequestId que no es uuid", () => {
    expect(withPatch({ clientRequestId: "abc" }).ok).toBe(false);
  });
  it("rechaza canal o método fuera de lista", () => {
    expect(withPatch({ channel: "web" }).ok).toBe(false);
    expect(withPatch({ paymentMethod: "bitcoin" }).ok).toBe(false);
  });
  it("rechaza entradas que no son objeto", () => {
    expect(validateNewSale(null).ok).toBe(false);
  });
});

describe("isSameSaleRequest", () => {
  const base = {
    locationId: "A",
    channel: "store" as const,
    paymentMethod: "cash" as const,
    lines: [
      { variantId: "v1", quantity: 1, unitPrice: 100 },
      { variantId: "v2", quantity: 2, unitPrice: 49.9 },
    ],
  };
  it("misma petición en otro orden y con deriva de flotante: igual", () => {
    expect(
      isSameSaleRequest(base, {
        ...base,
        lines: [
          { variantId: "v2", quantity: 2, unitPrice: 49.900000001 },
          { variantId: "v1", quantity: 1, unitPrice: 100 },
        ],
      }),
    ).toBe(true);
  });
  it.each([
    ["tienda", { locationId: "B" }],
    ["canal", { channel: "whatsapp" as const }],
    ["método", { paymentMethod: "card" as const }],
    ["cantidad", { lines: [{ variantId: "v1", quantity: 2, unitPrice: 100 }, base.lines[1]] }],
    ["precio", { lines: [{ variantId: "v1", quantity: 1, unitPrice: 99.99 }, base.lines[1]] }],
    ["renglón de más", { lines: [...base.lines, { variantId: "v3", quantity: 1, unitPrice: 1 }] }],
    ["renglón de menos", { lines: [base.lines[0]] }],
    ["otra prenda", { lines: [base.lines[0], { variantId: "v9", quantity: 2, unitPrice: 49.9 }] }],
  ])("distinto %s: diferente", (_label, patch) => {
    expect(isSameSaleRequest(base, { ...base, ...patch })).toBe(false);
  });
});

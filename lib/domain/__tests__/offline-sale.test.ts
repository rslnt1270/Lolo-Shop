import { describe, expect, it } from "vitest";
import {
  REVIEW_REASON_TEXT,
  isPriceKnown,
  offlineFolio,
  planOfflineLine,
  resolveOfflineTimes,
  resolveSoldAt,
  validateOfflineSale,
} from "../offline-sale";
import { REVIEW_REASONS } from "../sale";

const ID = "3f9a2c1b-1111-4222-8333-444455556666";
const base = {
  clientRequestId: ID,
  locationId: "loc1",
  channel: "store",
  paymentMethod: "cash",
  lines: [{ variantId: "v1", quantity: 1, unitPrice: 199.9 }],
  soldAt: "2026-11-12T10:00:00.000Z",
  snapshotAt: "2026-11-12T09:00:00.000Z",
};

describe("planOfflineLine", () => {
  it.each([
    [3, 2, { taken: 2, shortfall: 0 }],
    [1, 2, { taken: 1, shortfall: 1 }],
    [0, 1, { taken: 0, shortfall: 1 }],
    [null, 2, { taken: 0, shortfall: 2 }],
  ])("available %s, quantity %s", (available, quantity, expected) => {
    expect(planOfflineLine(available, quantity)).toEqual(expected);
  });
  it("trata disponible negativo como 0", () => {
    expect(planOfflineLine(-2, 1)).toEqual({ taken: 0, shortfall: 1 });
  });
});

describe("resolveSoldAt", () => {
  const now = new Date("2026-11-12T12:00:00.000Z");
  it("hora futura (+6 min) se marca y usa now", () => {
    const r = resolveSoldAt("2026-11-12T12:06:00.000Z", now);
    expect(r.skewed).toBe(true);
    expect(r.at).toEqual(now);
  });
  it("+5 min exactos no es sesgo", () => {
    expect(resolveSoldAt("2026-11-12T12:05:00.000Z", now).skewed).toBe(false);
  });
  it("hace 8 días se marca", () => {
    const r = resolveSoldAt("2026-11-04T12:00:00.000Z", now);
    expect(r.skewed).toBe(true);
    expect(r.at).toEqual(now);
  });
  it("hace 2 h es válida", () => {
    const r = resolveSoldAt("2026-11-12T10:00:00.000Z", now);
    expect(r.skewed).toBe(false);
    expect(r.at).toEqual(new Date("2026-11-12T10:00:00.000Z"));
  });
});

describe("validateOfflineSale", () => {
  it("acepta una venta válida y conserva soldAt y snapshotAt", () => {
    const r = validateOfflineSale(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.soldAt).toBe(base.soldAt);
      expect(r.value.snapshotAt).toBe(base.snapshotAt);
      expect(r.value.lines).toHaveLength(1);
    }
  });
  it.each(["ayer", "", 5, undefined, "2026-13-45T00:00:00Z", "2026-11-12"])("rechaza soldAt %s", (soldAt) => {
    expect(validateOfflineSale({ ...base, soldAt })).toEqual({
      ok: false,
      message: "La hora de la venta no es válida.",
    });
  });
  it("rechaza snapshotAt no ISO", () => {
    const r = validateOfflineSale({ ...base, snapshotAt: "x" });
    expect(r.ok).toBe(false);
  });
  it("hereda el rechazo del alias con 7 dígitos", () => {
    expect(validateOfflineSale({ ...base, customerAlias: "Ana 5512345" })).toEqual({
      ok: false,
      message: "El alias no puede incluir teléfonos ni números largos.",
    });
  });
  it("hereda el rechazo de venta no objeto", () => {
    expect(validateOfflineSale(null).ok).toBe(false);
  });
});

describe("isPriceKnown", () => {
  it("precio vigente", () => expect(isPriceKnown(249, 249, [])).toBe(true));
  it("precio previo dentro de cambios recientes", () => {
    expect(isPriceKnown(199.9, 249, [{ oldPrice: 199.9, newPrice: 249 }])).toBe(true);
  });
  it("precio desconocido", () => expect(isPriceKnown(1, 249, [])).toBe(false));
  it("compara en centavos", () => {
    expect(isPriceKnown(0.1 + 0.2, 0.3, [])).toBe(true);
  });
});

describe("textos y folio", () => {
  it("cubre todos los motivos", () => {
    for (const r of REVIEW_REASONS) expect(REVIEW_REASON_TEXT[r]).toBeTruthy();
    expect(REVIEW_REASON_TEXT).toEqual({
      insufficient_stock: "Faltó stock",
      price_unverified: "Precio distinto al registrado",
      inactive_product: "Prenda dada de baja",
      clock_skew: "Hora del teléfono incorrecta",
    });
  });
  it("folio local", () => expect(offlineFolio(ID)).toBe("L-3f9a2c1b"));
});

describe("resolveOfflineTimes", () => {
  const now = new Date("2026-11-12T12:00:00.000Z");
  const h = (n: number) => n * 60 * 60 * 1000;
  const iso = (ms: number) => new Date(now.getTime() + ms).toISOString();

  it("copia de 1 h antes de la venta: sin sesgo; precios desde la copia", () => {
    const r = resolveOfflineTimes({ soldAt: iso(-h(2)), snapshotAt: iso(-h(3)) }, now);
    expect(r).toEqual({ soldAt: new Date(iso(-h(2))), skewed: false, priceSince: new Date(iso(-h(3))) });
  });
  it("copia de exactamente 24 h antes de la venta es válida", () => {
    expect(resolveOfflineTimes({ soldAt: iso(-h(1)), snapshotAt: iso(-h(25)) }, now).skewed).toBe(false);
  });
  it("copia de más de 24 h antes de la venta se marca", () => {
    expect(resolveOfflineTimes({ soldAt: iso(-h(1)), snapshotAt: iso(-h(25) - 1000) }, now).skewed).toBe(true);
  });
  it("copia con fecha futura (+6 min respecto al servidor) se marca y no habilita cambios de precio", () => {
    const r = resolveOfflineTimes({ soldAt: iso(-h(1)), snapshotAt: iso(6 * 60 * 1000) }, now);
    expect(r.skewed).toBe(true);
    expect(r.priceSince).toEqual(now);
  });
  it("copia generada más de 5 min después de la venta se marca", () => {
    expect(resolveOfflineTimes({ soldAt: iso(-h(2)), snapshotAt: iso(-h(1)) }, now).skewed).toBe(true);
  });
  it("hora de venta absurda: usa now y se marca", () => {
    const r = resolveOfflineTimes({ soldAt: iso(-h(24 * 8)), snapshotAt: iso(-h(24 * 8) - h(1)) }, now);
    expect(r.skewed).toBe(true);
    expect(r.soldAt).toEqual(now);
  });
  it("los cambios de precio nunca se miran más allá de 7 días", () => {
    const r = resolveOfflineTimes({ soldAt: iso(-h(24 * 7) + h(1)), snapshotAt: iso(-h(24 * 7) - h(1)) }, now);
    expect(r.skewed).toBe(false);
    expect(r.priceSince).toEqual(new Date(iso(-h(24 * 7))));
  });
});

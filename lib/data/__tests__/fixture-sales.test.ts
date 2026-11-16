import { describe, expect, it } from "vitest";
import { pinMexicoNoon } from "../../../test/mexico-noon";
import { FixtureSalesDataSource } from "../fixture-sales-source";
import { InsufficientStockError, SaleRequestConflictError, SalesRuleError } from "../errors";
import type { NewSaleInput, PaymentMethod } from "@/lib/domain/sale";

// Fixtures: var-1 tiene 3 en loc-1; var-2 tiene 1 en loc-1.
let n = 0;
const reqId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

function sale(lines: NewSaleInput["lines"], paymentMethod: PaymentMethod = "cash", clientRequestId = reqId()): NewSaleInput {
  return { clientRequestId, locationId: "loc-1", channel: "store", paymentMethod, lines };
}

describe("FixtureSalesDataSource", () => {
  describe("stock insuficiente", () => {
    it("rechaza la venta completa sin descontar ningún renglón", async () => {
      const ds = new FixtureSalesDataSource();
      const err = await ds
        .createSale(sale([{ variantId: "var-1", quantity: 2, unitPrice: 450 }, { variantId: "var-2", quantity: 2, unitPrice: 450 }]), "u1")
        .catch((e) => e);

      expect(err).toBeInstanceOf(InsufficientStockError);
      expect(err).toMatchObject({ variantId: "var-2", available: 1, requested: 2 });
      expect(ds.available("var-1", "loc-1")).toBe(3);
      expect(ds.available("var-2", "loc-1")).toBe(1);
    });

    it("una variante sin fila en la tienda cuenta como 0", async () => {
      const ds = new FixtureSalesDataSource();
      const err = await ds
        .createSale({ ...sale([{ variantId: "var-1", quantity: 1, unitPrice: 450 }]), locationId: "loc-x" }, "u1")
        .catch((e) => e);
      expect(err).toMatchObject({ available: 0, requested: 1 });
    });

    it("descuenta y calcula el total cuando alcanza", async () => {
      const ds = new FixtureSalesDataSource();
      const rec = await ds.createSale(sale([{ variantId: "var-1", quantity: 2, unitPrice: 450 }]), "u1");
      expect(rec).toMatchObject({ status: "paid", total: 900, createdById: "u1" });
      expect(ds.available("var-1", "loc-1")).toBe(1);
    });
  });

  it("venta en línea nace origin online, sin revisión y shortfall 0", async () => {
    const ds = new FixtureSalesDataSource();
    const rec = await ds.createSale(sale([{ variantId: "var-1", quantity: 1, unitPrice: 450 }]), "u1");
    expect(rec.origin).toBe("online");
    expect(rec.soldAt).toBeNull();
    expect(rec.reviewStatus).toBeNull();
    expect(rec.reviewReasons).toEqual([]);
    expect(rec.lines.every((l) => l.shortfall === 0)).toBe(true);
  });

  describe("idempotencia", () => {
    it("el mismo clientRequestId devuelve la misma venta y descuenta una vez", async () => {
      const ds = new FixtureSalesDataSource();
      const input = sale([{ variantId: "var-1", quantity: 1, unitPrice: 450 }]);
      const [a, b] = await Promise.all([ds.createSale(input, "u1"), ds.createSale(input, "u1")]);
      expect(a.id).toBe(b.id);
      expect(ds.available("var-1", "loc-1")).toBe(2);
    });

    it("el mismo clientRequestId con otro carrito: conflicto con el folio y sin descontar", async () => {
      const ds = new FixtureSalesDataSource();
      const rid = reqId();
      const first = await ds.createSale(sale([{ variantId: "var-1", quantity: 1, unitPrice: 450 }], "cash", rid), "u1");
      const err = await ds
        .createSale(sale([{ variantId: "var-1", quantity: 2, unitPrice: 450 }], "cash", rid), "u1")
        .catch((e) => e);
      expect(err).toBeInstanceOf(SaleRequestConflictError);
      expect(err.saleNumber).toBe(first.number);
      expect(ds.available("var-1", "loc-1")).toBe(2);
    });
  });

  describe("estados", () => {
    it("spay_transfer nace pendiente y se confirma una sola vez", async () => {
      const ds = new FixtureSalesDataSource();
      const rec = await ds.createSale(sale([{ variantId: "var-1", quantity: 1, unitPrice: 450 }], "spay_transfer"), "u1");
      expect(rec.status).toBe("pending_payment");
      expect((await ds.confirmPayment(rec.id, "owner")).status).toBe("paid");
      await expect(ds.confirmPayment(rec.id, "owner")).rejects.toBeInstanceOf(SalesRuleError);
    });

    it("anular con prenda devuelta reingresa; sin devolver no; no se anula dos veces", async () => {
      const ds = new FixtureSalesDataSource();
      const a = await ds.createSale(sale([{ variantId: "var-1", quantity: 1, unitPrice: 450 }]), "u1");
      const b = await ds.createSale(sale([{ variantId: "var-1", quantity: 1, unitPrice: 450 }], "spay_transfer"), "u1");
      expect(ds.available("var-1", "loc-1")).toBe(1);

      expect((await ds.cancelSale(a.id, "owner", "Error", true)).status).toBe("cancelled");
      expect(ds.available("var-1", "loc-1")).toBe(2);
      await ds.cancelSale(b.id, "owner", "impago", false);
      expect(ds.available("var-1", "loc-1")).toBe(2);

      await expect(ds.cancelSale(a.id, "owner", "Otra", true)).rejects.toBeInstanceOf(SalesRuleError);
      await expect(ds.cancelSale(b.id, "owner", " ", false)).rejects.toBeInstanceOf(SalesRuleError);
      await expect(ds.confirmPayment(b.id, "owner")).rejects.toBeInstanceOf(SalesRuleError);
    });

    it("umbral de stock bajo: 2 por omisión, entero 0–99", async () => {
      const ds = new FixtureSalesDataSource();
      expect(await ds.getLowStockThreshold()).toBe(2);
      await ds.setLowStockThreshold(5, "owner");
      expect(await ds.getLowStockThreshold()).toBe(5);
      await expect(ds.setLowStockThreshold(100, "owner")).rejects.toBeInstanceOf(SalesRuleError);
    });
  });
});

describe("FixtureSalesDataSource.getDashboard: alias y Ventas de hoy", () => {
  it("pendientes con alias; recentSales solo con recentSalesDate, sin canceladas, más nueva primero", async () => {
    const ds = new FixtureSalesDataSource();
    const a = await ds.createSale(
      { ...sale([{ variantId: "var-1", quantity: 1, unitPrice: 450 }], "spay_transfer"), channel: "whatsapp", customerAlias: "chamarra azul" },
      "u1",
    );
    const b = await ds.createSale(sale([{ variantId: "var-1", quantity: 1, unitPrice: 450 }]), "u1");
    const c = await ds.createSale(sale([{ variantId: "var-2", quantity: 1, unitPrice: 450 }]), "u1");
    await ds.cancelSale(c.id, "owner", "error", false);
    const q = { from: a.businessDate, to: a.businessDate, locationIds: "all" as const, pendingScope: "all_dates" as const };

    const plain = await ds.getDashboard(q);
    expect(plain.recentSales).toBeUndefined();
    expect(plain.pendingPayments.map((p) => p.customerAlias)).toEqual(["chamarra azul"]);

    const withRecent = await ds.getDashboard({ ...q, recentSalesDate: a.businessDate });
    expect(withRecent.recentSales!.map((r) => r.saleId)).toEqual([b.id, a.id]);
  });
});

describe("FixtureSalesDataSource sin internet", () => {
  pinMexicoNoon();
  const HOUR = 60 * 60 * 1000;
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const meta = (soldMsAgo = HOUR, gap = HOUR) => ({ soldAt: ago(soldMsAgo), snapshotAt: ago(soldMsAgo + gap) });
  const line = (quantity: number, unitPrice = 450, variantId = "var-2") => ({ variantId, quantity, unitPrice });

  it("stock insuficiente: descuenta hasta 0, guarda el faltante y queda en revisión", async () => {
    const ds = new FixtureSalesDataSource();
    const m = meta();
    const rec = await ds.createSale(sale([line(2)]), "u1", { offline: m });
    expect(rec).toMatchObject({ origin: "offline", soldAt: m.soldAt, reviewStatus: "pending", reviewReasons: ["insufficient_stock"] });
    expect(rec.lines).toEqual([{ variantId: "var-2", quantity: 2, unitPrice: 450, shortfall: 1 }]);
    expect(ds.available("var-2", "loc-1")).toBe(0);
  });

  it("con stock suficiente no queda en revisión; sin fila el faltante es todo", async () => {
    const ds = new FixtureSalesDataSource();
    const ok = await ds.createSale(sale([line(2, 450, "var-1")]), "u1", { offline: meta() });
    expect(ok.reviewStatus).toBeNull();
    const none = await ds.createSale({ ...sale([line(1, 450, "var-1")]), locationId: "loc-x" }, "u1", { offline: meta() });
    expect(none.lines[0].shortfall).toBe(1);
    expect(ds.available("var-1", "loc-x")).toBeNull();
  });

  it("replay con el mismo id no descuenta dos veces", async () => {
    const ds = new FixtureSalesDataSource();
    const input = sale([line(1, 450, "var-1")]);
    const m = meta();
    const a = await ds.createSale(input, "u1", { offline: m });
    const b = await ds.createSale(input, "u1", { offline: m });
    expect(b.number).toBe(a.number);
    expect(ds.available("var-1", "loc-1")).toBe(2);
  });

  it("variante inexistente lanza SalesRuleError", async () => {
    const ds = new FixtureSalesDataSource();
    await expect(ds.createSale(sale([line(1, 450, "var-x")]), "u1", { offline: meta() })).rejects.toThrow(
      "Un producto de la venta ya no existe.",
    );
  });

  it("precio: solo con checkPrice; un cambio posterior a la copia lo valida, uno anterior no", async () => {
    const ds = new FixtureSalesDataSource();
    // loc-2 tiene 5 de var-1: el stock alcanza en las cuatro ventas.
    const at2 = (opts: Parameters<FixtureSalesDataSource["createSale"]>[2]) =>
      ds.createSale({ ...sale([line(1, 400, "var-1")]), locationId: "loc-2" }, "u1", opts).then((r) => r.reviewReasons);
    expect(await at2({ offline: meta() })).toEqual([]);
    expect(await at2({ offline: meta(), checkPrice: true })).toEqual(["price_unverified"]);
    ds.recordPriceChange("var-1", 400, 450, new Date(Date.now() - 3 * HOUR));
    expect(await at2({ offline: meta(HOUR, HOUR), checkPrice: true })).toEqual(["price_unverified"]);
    ds.recordPriceChange("var-1", 400, 450, new Date(Date.now() - HOUR / 2));
    expect(await at2({ offline: meta(HOUR, HOUR), checkPrice: true })).toEqual([]);
  });

  it("reloj: 8 días atrás o copia de más de 24 h → clock_skew", async () => {
    const ds = new FixtureSalesDataSource();
    const old = await ds.createSale(sale([line(1, 450, "var-1")]), "u1", { offline: meta(8 * 24 * HOUR) });
    expect(old.reviewReasons).toEqual(["clock_skew"]);
    const stale = await ds.createSale(sale([line(1, 450, "var-1")]), "u1", { offline: meta(HOUR, 25 * HOUR) });
    expect(stale.reviewReasons).toEqual(["clock_skew"]);
  });

  it("reloj: venta de ayer → clock_skew", async () => {
    const ds = new FixtureSalesDataSource();
    const rec = await ds.createSale(sale([line(1, 450, "var-1")]), "u1", { offline: meta(24 * HOUR) });
    expect(rec).toMatchObject({ reviewStatus: "pending", reviewReasons: ["clock_skew"] });
  });

  it("copia no verificada: con checkPrice solo cuadra el precio vigente; sin checkPrice no se marca", async () => {
    const ds = new FixtureSalesDataSource();
    const at2 = (unitPrice: number, opts: Parameters<FixtureSalesDataSource["createSale"]>[2]) =>
      ds.createSale({ ...sale([line(1, unitPrice, "var-1")]), locationId: "loc-2" }, "u1", opts).then((r) => r.reviewReasons);
    ds.recordPriceChange("var-1", 400, 450, new Date(Date.now() - HOUR / 2));
    // Precio vigente (450): no se marca aunque la copia no esté firmada.
    expect(await at2(450, { offline: meta(), checkPrice: true, snapshotUnverified: true })).toEqual([]);
    // Precio viejo (400): cuadra con copia firmada, no sin firma.
    expect(await at2(400, { offline: meta(HOUR, HOUR), checkPrice: true })).toEqual([]);
    expect(await at2(400, { offline: meta(HOUR, HOUR), checkPrice: true, snapshotUnverified: true })).toEqual(["price_unverified"]);
    // Owner y manager (sin checkPrice): nunca price_unverified, como en línea.
    expect(await at2(400, { offline: meta(HOUR, HOUR), snapshotUnverified: true })).toEqual([]);
    expect(await at2(1, { offline: meta(), snapshotUnverified: true })).toEqual([]);
  });

  it("checkPrice sin offline se ignora", async () => {
    const ds = new FixtureSalesDataSource();
    const rec = await ds.createSale(sale([line(1, 400, "var-1")]), "u1", { checkPrice: true });
    expect(rec).toMatchObject({ origin: "online", reviewStatus: null });
  });

  it("anular con devolución reingresa quantity - shortfall y una venta en revisión queda rejected", async () => {
    const ds = new FixtureSalesDataSource();
    const rec = await ds.createSale(sale([line(2)]), "u1", { offline: meta() });
    const cancelled = await ds.cancelSale(rec.id, "owner", "Rechazada", true);
    expect(cancelled.reviewStatus).toBe("rejected");
    expect(ds.available("var-2", "loc-1")).toBe(1);
  });
});

describe("FixtureSalesDataSource: revisión del dueño", () => {
  pinMexicoNoon();
  const HOUR = 60 * 60 * 1000;
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const meta = () => ({ soldAt: ago(HOUR), snapshotAt: ago(2 * HOUR) });
  const pend = async (ds: FixtureSalesDataSource) =>
    ds.createSale(sale([{ variantId: "var-2", quantity: 2, unitPrice: 450 }]), "u1", { offline: meta() });
  const q = { from: "2000-01-01", to: "2999-12-31", locationIds: "all" as const, pendingScope: "all_dates" as const };

  it("aprobar deja approved y no cambia available", async () => {
    const ds = new FixtureSalesDataSource();
    const rec = await pend(ds);
    const out = await ds.approveReview(rec.id, "owner", "ok");
    expect(out.reviewStatus).toBe("approved");
    expect(ds.available("var-2", "loc-1")).toBe(0);
  });

  it("rechazar con devolución reingresa quantity - shortfall; sin devolución no toca stock", async () => {
    const ds = new FixtureSalesDataSource();
    const a = await pend(ds);
    expect(await ds.rejectReview(a.id, "owner", "No procede", true)).toMatchObject({ status: "cancelled", reviewStatus: "rejected" });
    expect(ds.available("var-2", "loc-1")).toBe(1);
    const b = await ds.createSale(sale([{ variantId: "var-2", quantity: 2, unitPrice: 450 }]), "u1", { offline: meta() });
    await ds.rejectReview(b.id, "owner", "No procede", false);
    expect(ds.available("var-2", "loc-1")).toBe(0);
  });

  it("no pendiente, motivo vacío y notas largas lanzan SalesRuleError", async () => {
    const ds = new FixtureSalesDataSource();
    const rec = await pend(ds);
    await expect(ds.approveReview(rec.id, "owner", "x".repeat(201))).rejects.toThrow(SalesRuleError);
    await expect(ds.rejectReview(rec.id, "owner", " ", true)).rejects.toThrow(SalesRuleError);
    await expect(ds.rejectReview(rec.id, "owner", "x".repeat(201), true)).rejects.toThrow(SalesRuleError);
    await ds.approveReview(rec.id, "owner");
    await expect(ds.approveReview(rec.id, "owner")).rejects.toThrow("Esta venta ya no está por aprobar.");
    await expect(ds.rejectReview(rec.id, "owner", "tarde", true)).rejects.toThrow("Esta venta ya no está por aprobar.");
    await expect(ds.approveReview("nope", "owner")).rejects.toThrow(SalesRuleError);
  });

  it("listSalesForReview lista solo pendientes, más vieja primero", async () => {
    const ds = new FixtureSalesDataSource();
    const a = await pend(ds);
    const b = await ds.createSale(sale([{ variantId: "var-2", quantity: 1, unitPrice: 450 }]), "u1", { offline: meta() });
    const items = await ds.listSalesForReview();
    expect(items.map((i) => i.saleId)).toEqual([a.id, b.id]);
    expect(items[0]).toMatchObject({ number: a.number, locationId: "loc-1", total: 900, reasons: ["insufficient_stock"] });
    expect(items[0].lines[0]).toMatchObject({ variantId: "var-2", quantity: 2, shortfall: 1, unitPrice: 450 });
    await ds.approveReview(a.id, "owner");
    expect((await ds.listSalesForReview()).map((i) => i.saleId)).toEqual([b.id]);
  });

  it("pendingReviewCount cuenta solo pending del alcance; en revisión suma en soldTotal y rechazada no", async () => {
    const ds = new FixtureSalesDataSource();
    const rec = await pend(ds);
    const d = await ds.getDashboard(q);
    expect(d.pendingReviewCount).toBe(1);
    expect(d.soldTotal).toBe(900);
    expect((await ds.getDashboard({ ...q, locationIds: ["loc-2"] })).pendingReviewCount).toBe(0);
    await ds.rejectReview(rec.id, "owner", "No procede", true);
    const after = await ds.getDashboard(q);
    expect(after).toMatchObject({ pendingReviewCount: 0, soldTotal: 0 });
  });
});

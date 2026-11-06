import { describe, expect, it } from "vitest";
import { FixtureSalesDataSource } from "../fixture-sales-source";
import { InsufficientStockError, SalesRuleError } from "../errors";
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

  describe("idempotencia", () => {
    it("el mismo clientRequestId devuelve la misma venta y descuenta una vez", async () => {
      const ds = new FixtureSalesDataSource();
      const input = sale([{ variantId: "var-1", quantity: 1, unitPrice: 450 }]);
      const [a, b] = await Promise.all([ds.createSale(input, "u1"), ds.createSale(input, "u1")]);
      expect(a.id).toBe(b.id);
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

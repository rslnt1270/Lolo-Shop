import type { Product } from "@/lib/domain/types";
import {
  businessDateMx,
  initialStatus,
  saleTotal,
  validateNewSale,
  MAX_REFERENCE_LENGTH,
  type NewSaleInput,
} from "@/lib/domain/sale";
import { fixtureProducts } from "./fixtures";
import { InsufficientStockError, SalesRuleError } from "./errors";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  isValidLowStockThreshold,
  type DashboardData,
  type DashboardQuery,
  type SaleRecord,
  type SalesDataSource,
} from "./sales-source";

const stockKey = (variantId: string, locationId: string) => `${variantId}|${locationId}`;
const splitKey = (key: string) => {
  const [variantId, locationId] = key.split("|");
  return { variantId, locationId };
};
const copy = (s: SaleRecord): SaleRecord => ({ ...s, lines: s.lines.map((l) => ({ ...l })) });

let seq = 0;

/**
 * Doble en memoria con las mismas reglas que Prisma: stock insuficiente sin
 * cambios parciales, idempotencia por `clientRequestId` y transiciones de estado.
 * Cada método muta el estado sin `await` intermedio, así que es atómico.
 */
export class FixtureSalesDataSource implements SalesDataSource {
  private stock = new Map<string, number>();
  private variants = new Set<string>();
  private sales = new Map<string, SaleRecord>();
  private byRequestId = new Map<string, SaleRecord>();
  private threshold = DEFAULT_LOW_STOCK_THRESHOLD;
  private nextNumber = 1;
  private brandOf = new Map<string, string>();
  private titleOf = new Map<string, { title: string; size: string }>();

  constructor(products: Product[] = fixtureProducts) {
    for (const p of products) {
      for (const v of p.variants) {
        this.variants.add(v.id);
        this.brandOf.set(v.id, p.brand);
        this.titleOf.set(v.id, { title: p.title, size: v.size });
        for (const lvl of v.inventory) this.stock.set(stockKey(v.id, lvl.locationId), lvl.available);
      }
    }
  }

  /** Para pruebas: piezas disponibles de una variante en una tienda (null si no hay fila). */
  available(variantId: string, locationId: string): number | null {
    return this.stock.get(stockKey(variantId, locationId)) ?? null;
  }

  async createSale(input: NewSaleInput, userId: string): Promise<SaleRecord> {
    const checked = validateNewSale(input);
    if (!checked.ok) throw new SalesRuleError(checked.message);
    const sale = checked.value;

    const existing = this.byRequestId.get(sale.clientRequestId);
    if (existing) return copy(existing);

    const lines = [...sale.lines].sort((a, b) => (a.variantId < b.variantId ? -1 : 1));
    for (const line of lines) {
      if (!this.variants.has(line.variantId)) {
        throw new SalesRuleError("Un producto de la venta ya no está disponible.");
      }
    }
    // Se revisa todo antes de descontar: todo o nada, como el rollback de Prisma.
    for (const line of lines) {
      const have = this.available(line.variantId, sale.locationId) ?? 0;
      if (have < line.quantity) throw new InsufficientStockError(line.variantId, have, line.quantity);
    }
    for (const line of lines) {
      const key = stockKey(line.variantId, sale.locationId);
      this.stock.set(key, this.stock.get(key)! - line.quantity);
    }

    const now = new Date();
    const rec: SaleRecord = {
      id: `sale-${++seq}`,
      number: this.nextNumber++,
      status: initialStatus(sale.paymentMethod),
      channel: sale.channel,
      paymentMethod: sale.paymentMethod,
      total: saleTotal(lines),
      businessDate: businessDateMx(now),
      locationId: sale.locationId,
      createdById: userId,
      createdAt: now.toISOString(),
      lines: lines.map((l) => ({ ...l })),
    };
    this.sales.set(rec.id, rec);
    this.byRequestId.set(sale.clientRequestId, rec);
    return copy(rec);
  }

  async confirmPayment(saleId: string, _userId: string, reference?: string): Promise<SaleRecord> {
    if (reference && reference.trim().length > MAX_REFERENCE_LENGTH) {
      throw new SalesRuleError(`La referencia no puede pasar de ${MAX_REFERENCE_LENGTH} caracteres.`);
    }
    const s = this.sales.get(saleId);
    if (!s) throw new SalesRuleError("La venta no existe.");
    if (s.status !== "pending_payment") {
      throw new SalesRuleError("Solo se confirma el pago de una venta pendiente.");
    }
    s.status = "paid";
    return copy(s);
  }

  async cancelSale(saleId: string, _userId: string, reason: string, itemsReturned: boolean): Promise<SaleRecord> {
    if (!reason.trim()) throw new SalesRuleError("Escribe el motivo de la anulación.");
    const s = this.sales.get(saleId);
    if (!s) throw new SalesRuleError("La venta no existe.");
    if (s.status !== "pending_payment" && s.status !== "paid") {
      throw new SalesRuleError("Esta venta ya no se puede anular.");
    }
    s.status = "cancelled";
    if (itemsReturned) {
      for (const line of s.lines) {
        const key = stockKey(line.variantId, s.locationId);
        this.stock.set(key, (this.stock.get(key) ?? 0) + line.quantity);
      }
    }
    return copy(s);
  }

  /** Misma forma que Prisma; el fixture no tiene departamentos ni `minStock`. */
  async getDashboard(q: DashboardQuery): Promise<DashboardData> {
    const inScope = (loc: string) => q.locationIds === "all" || q.locationIds.includes(loc);
    const all = [...this.sales.values()].filter((s) => inScope(s.locationId));
    const valid = all.filter(
      (s) =>
        (s.status === "paid" || s.status === "pending_payment") &&
        s.businessDate >= q.from &&
        s.businessDate <= q.to,
    );
    const cents = (n: number) => Math.round(n * 100);
    const sum = (rows: SaleRecord[]) => rows.reduce((a, s) => a + cents(s.total), 0) / 100;
    const group = <K extends string>(key: (s: SaleRecord) => K) => {
      const m = new Map<K, SaleRecord[]>();
      for (const s of valid) m.set(key(s), [...(m.get(key(s)) ?? []), s]);
      return [...m.entries()];
    };

    const brands = new Map<string, { units: number; cents: number }>();
    for (const s of valid) {
      for (const l of s.lines) {
        const name = this.brandOf.get(l.variantId) ?? "Sin marca";
        const cur = brands.get(name) ?? { units: 0, cents: 0 };
        brands.set(name, { units: cur.units + l.quantity, cents: cur.cents + l.quantity * cents(l.unitPrice) });
      }
    }

    return {
      soldTotal: sum(valid),
      collectedTotal: sum(valid.filter((s) => s.status === "paid")),
      salesCount: valid.length,
      byDay: group((s) => s.businessDate)
        .map(([date, rows]) => ({ date, total: sum(rows), count: rows.length }))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
      byLocation: group((s) => s.locationId).map(([locationId, rows]) => ({ locationId, total: sum(rows) })),
      byChannel: group((s) => s.channel).map(([channel, rows]) => ({ channel, total: sum(rows) })),
      byPaymentMethod: group((s) => s.paymentMethod).map(([method, rows]) => ({ method, total: sum(rows) })),
      byBrand: [...brands.entries()]
        .map(([name, v]) => ({ brandId: null, name, units: v.units, total: v.cents / 100 }))
        .sort((a, b) => b.total - a.total),
      byDepartment: [],
      pendingPayments: all
        .filter((s) => s.status === "pending_payment")
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
        .map((s) => ({ saleId: s.id, number: s.number, total: s.total, locationId: s.locationId, createdAt: s.createdAt })),
      lowStock: [...this.stock.entries()]
        .map(([key, available]) => ({ key, available, ...splitKey(key) }))
        .filter((r) => inScope(r.locationId) && r.available <= this.threshold && this.titleOf.has(r.variantId))
        .map((r) => ({
          variantId: r.variantId,
          locationId: r.locationId,
          productTitle: this.titleOf.get(r.variantId)!.title,
          size: this.titleOf.get(r.variantId)!.size,
          available: r.available,
          threshold: this.threshold,
        })),
    };
  }

  async getLowStockThreshold(): Promise<number> {
    return this.threshold;
  }

  async setLowStockThreshold(n: number, _userId: string): Promise<void> {
    if (!isValidLowStockThreshold(n)) {
      throw new SalesRuleError("El umbral de stock bajo debe ser un entero de 0 a 99.");
    }
    this.threshold = n;
  }
}

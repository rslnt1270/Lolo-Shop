import { Prisma, type PrismaClient } from "@prisma/client";
import prisma from "../prisma";
import {
  businessDateMx,
  initialStatus,
  saleTotal,
  validateNewSale,
  MAX_REFERENCE_LENGTH,
  type NewSaleInput,
} from "../domain/sale";
import { InsufficientStockError, SalesRuleError } from "./errors";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  LOW_STOCK_THRESHOLD_KEY,
  isValidLowStockThreshold,
  type DashboardData,
  type DashboardQuery,
  type SaleRecord,
  type SalesDataSource,
} from "./sales-source";

/**
 * Límites de la transacción interactiva, pensados para una función serverless:
 * `maxWait` es la espera por una conexión del pool y `timeout` la duración
 * máxima de la transacción. Un ticket normal tarda milisegundos; si se pasa,
 * se hace rollback en vez de retener bloqueos de fila mientras la función sigue viva.
 */
export const SALE_TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 5_000,
  timeout: 10_000,
} as const;

const saleWithLines = { lines: { orderBy: { variantId: "asc" } } } satisfies Prisma.SaleInclude;
type SaleWithLines = Prisma.SaleGetPayload<{ include: typeof saleWithLines }>;

function toRecord(s: SaleWithLines): SaleRecord {
  return {
    id: s.id,
    number: s.number,
    status: s.status,
    channel: s.channel,
    paymentMethod: s.paymentMethod,
    total: Number(s.total),
    businessDate: s.businessDate.toISOString().slice(0, 10),
    locationId: s.locationId,
    createdById: s.createdById,
    createdAt: s.createdAt.toISOString(),
    lines: s.lines.map((l) => ({
      variantId: l.variantId,
      quantity: l.quantity,
      unitPrice: Number(l.unitPrice),
    })),
  };
}

function isClientRequestIdRace(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  const target = (err.meta as { target?: unknown } | undefined)?.target;
  return String(Array.isArray(target) ? target.join(",") : target ?? "").includes("clientRequestId");
}

export class PrismaSalesDataSource implements SalesDataSource {
  constructor(private readonly db: PrismaClient = prisma) {}

  private async findByClientRequestId(clientRequestId: string): Promise<SaleRecord | null> {
    const s = await this.db.sale.findUnique({ where: { clientRequestId }, include: saleWithLines });
    return s ? toRecord(s) : null;
  }

  async createSale(input: NewSaleInput, userId: string): Promise<SaleRecord> {
    // Paso 1 (ER §3.1): validación fuera de la transacción.
    const checked = validateNewSale(input);
    if (!checked.ok) throw new SalesRuleError(checked.message);
    const sale = checked.value;

    const existing = await this.findByClientRequestId(sale.clientRequestId);
    if (existing) return existing;

    const variants = await this.db.variant.findMany({
      where: { id: { in: sale.lines.map((l) => l.variantId) } },
      select: {
        id: true,
        isActive: true,
        product: { select: { id: true, isActive: true, brandId: true, departmentId: true, category: true } },
      },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));
    for (const line of sale.lines) {
      const v = byId.get(line.variantId);
      if (!v || !v.isActive || !v.product.isActive) {
        throw new SalesRuleError("Un producto de la venta ya no está disponible.");
      }
    }

    // Paso 2: orden fijo de bloqueos por variantId (sin interbloqueos).
    const lines = [...sale.lines].sort((a, b) => (a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0));
    const now = new Date();

    try {
      return await this.db.$transaction(async (tx) => {
        // Paso 3: cabecera. El índice único de clientRequestId frena un reintento simultáneo.
        const created = await tx.sale.create({
          data: {
            clientRequestId: sale.clientRequestId,
            channel: sale.channel,
            paymentMethod: sale.paymentMethod,
            status: initialStatus(sale.paymentMethod),
            locationId: sale.locationId,
            total: saleTotal(lines),
            businessDate: new Date(`${businessDateMx(now)}T00:00:00.000Z`),
            stockCommittedAt: now,
            createdAt: now,
            createdById: userId,
            paymentReference: sale.paymentReference ?? null,
            customerAlias: sale.customerAlias ?? null,
          },
        });

        for (const line of lines) {
          // Paso 4: un solo UPDATE … WHERE available >= n. Sin upsert: sin fila no hay stock.
          const { count } = await tx.inventoryLevel.updateMany({
            where: { variantId: line.variantId, locationId: sale.locationId, available: { gte: line.quantity } },
            data: { available: { decrement: line.quantity } },
          });
          // Paso 5: rollback completo de la transacción.
          if (count === 0) {
            const level = await tx.inventoryLevel.findUnique({
              where: { variantId_locationId: { variantId: line.variantId, locationId: sale.locationId } },
              select: { available: true },
            });
            throw new InsufficientStockError(line.variantId, level?.available ?? 0, line.quantity);
          }
        }

        // Paso 6: renglones con copias del producto y Movement SALE por renglón.
        await tx.saleLine.createMany({
          data: lines.map((line) => {
            const product = byId.get(line.variantId)!.product;
            return {
              saleId: created.id,
              variantId: line.variantId,
              productId: product.id,
              brandId: product.brandId,
              departmentId: product.departmentId,
              category: product.category,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
            };
          }),
        });
        await tx.movement.createMany({
          data: lines.map((line) => ({
            variantId: line.variantId,
            locationId: sale.locationId,
            userId,
            delta: -line.quantity,
            type: "SALE" as const,
            saleId: created.id,
            timestamp: now,
          })),
        });

        return toRecord(
          await tx.sale.findUniqueOrThrow({ where: { id: created.id }, include: saleWithLines }),
        );
      }, SALE_TX_OPTIONS);
    } catch (err) {
      // Carrera del mismo reintento: la otra transacción ya registró la venta.
      if (isClientRequestIdRace(err)) {
        const winner = await this.findByClientRequestId(sale.clientRequestId);
        if (winner) return winner;
      }
      throw err;
    }
  }

  async confirmPayment(saleId: string, userId: string, reference?: string): Promise<SaleRecord> {
    const ref = reference?.trim() || undefined;
    if (ref && ref.length > MAX_REFERENCE_LENGTH) {
      throw new SalesRuleError(`La referencia no puede pasar de ${MAX_REFERENCE_LENGTH} caracteres.`);
    }
    // Cambio condicional al estado: dos confirmaciones simultáneas no pisan la auditoría.
    const { count } = await this.db.sale.updateMany({
      where: { id: saleId, status: "pending_payment" },
      data: {
        status: "paid",
        paymentConfirmedById: userId,
        paymentConfirmedAt: new Date(),
        ...(ref ? { paymentReference: ref } : {}),
      },
    });
    const s = await this.db.sale.findUnique({ where: { id: saleId }, include: saleWithLines });
    if (!s) throw new SalesRuleError("La venta no existe.");
    if (count === 0) throw new SalesRuleError("Solo se confirma el pago de una venta pendiente.");
    return toRecord(s);
  }

  async cancelSale(saleId: string, userId: string, reason: string, itemsReturned: boolean): Promise<SaleRecord> {
    const cancelReason = reason.trim();
    if (!cancelReason) throw new SalesRuleError("Escribe el motivo de la anulación.");

    return this.db.$transaction(async (tx) => {
      // El UPDATE condicional bloquea la fila: una segunda anulación ve "cancelled" y no reingresa.
      const now = new Date();
      const { count } = await tx.sale.updateMany({
        where: { id: saleId, status: { in: ["pending_payment", "paid"] } },
        data: { status: "cancelled", cancelReason, cancelledById: userId, cancelledAt: now },
      });
      const s = await tx.sale.findUnique({ where: { id: saleId }, include: saleWithLines });
      if (!s) throw new SalesRuleError("La venta no existe.");
      if (count === 0) throw new SalesRuleError("Esta venta ya no se puede anular.");

      if (itemsReturned) {
        // Mismo orden por variantId que al vender; las líneas ya vienen ordenadas.
        for (const line of s.lines) {
          const qty = line.quantity - line.returnedQuantity;
          if (qty <= 0) continue;
          await tx.inventoryLevel.upsert({
            where: { variantId_locationId: { variantId: line.variantId, locationId: s.locationId } },
            update: { available: { increment: qty } },
            create: { variantId: line.variantId, locationId: s.locationId, available: qty },
          });
          await tx.movement.create({
            data: {
              variantId: line.variantId,
              locationId: s.locationId,
              userId,
              delta: qty,
              type: "RETURN",
              saleId: s.id,
              timestamp: now,
            },
          });
        }
      }
      return toRecord(s);
    }, SALE_TX_OPTIONS);
  }

  async getDashboard(_q: DashboardQuery): Promise<DashboardData> {
    throw new Error("not implemented");
  }

  async getLowStockThreshold(): Promise<number> {
    const row = await this.db.appSetting.findUnique({ where: { key: LOW_STOCK_THRESHOLD_KEY } });
    const value = row?.value;
    return isValidLowStockThreshold(value) ? value : DEFAULT_LOW_STOCK_THRESHOLD;
  }

  async setLowStockThreshold(n: number, userId: string): Promise<void> {
    if (!isValidLowStockThreshold(n)) {
      throw new SalesRuleError("El umbral de stock bajo debe ser un entero de 0 a 99.");
    }
    await this.db.appSetting.upsert({
      where: { key: LOW_STOCK_THRESHOLD_KEY },
      create: { key: LOW_STOCK_THRESHOLD_KEY, value: n, updatedById: userId },
      update: { value: n, updatedById: userId },
    });
  }
}

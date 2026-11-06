import type { NewSaleInput, PaymentMethod, SaleChannel, SaleStatus } from "@/lib/domain/sale";

export interface SaleRecord {
  id: string;
  /** Folio legible del ticket. */
  number: number;
  status: SaleStatus;
  channel: SaleChannel;
  paymentMethod: PaymentMethod;
  total: number;
  /** Día de negocio (YYYY-MM-DD) en America/Mexico_City. */
  businessDate: string;
  locationId: string;
  createdById: string;
  /** ISO 8601. */
  createdAt: string;
  /** Ordenados por variantId. */
  lines: { variantId: string; quantity: number; unitPrice: number }[];
}

// Placeholders: la Tarea 6 define la consulta y la respuesta del dashboard.
export type DashboardQuery = unknown;
export type DashboardData = unknown;

/**
 * Ventas con descuento de stock (ER §3.1) y anulación (ER §3.3). Los permisos
 * por rol se revisan en las actions, no aquí.
 */
export interface SalesDataSource {
  /**
   * Registra la venta y descuenta stock en una sola transacción. Idempotente
   * por `clientRequestId`: un reintento devuelve la venta ya creada. Si falta
   * stock en algún renglón lanza `InsufficientStockError` y no deja nada.
   */
  createSale(input: NewSaleInput, userId: string): Promise<SaleRecord>;
  /** `pending_payment` → `paid`. Cualquier otro estado lanza `SalesRuleError`. */
  confirmPayment(saleId: string, userId: string, reference?: string): Promise<SaleRecord>;
  /**
   * Anula una venta `pending_payment` o `paid`. `reason` obligatorio. Si
   * `itemsReturned`, reingresa el stock a la tienda de la venta con `Movement RETURN`.
   */
  cancelSale(saleId: string, userId: string, reason: string, itemsReturned: boolean): Promise<SaleRecord>;
  getDashboard(q: DashboardQuery): Promise<DashboardData>;
  /** Umbral global de stock bajo (AppSetting `lowStockThreshold`), entero 0–99. */
  getLowStockThreshold(): Promise<number>;
  setLowStockThreshold(n: number, userId: string): Promise<void>;
}

export const LOW_STOCK_THRESHOLD_KEY = "lowStockThreshold";
export const DEFAULT_LOW_STOCK_THRESHOLD = 2;
export const MAX_LOW_STOCK_THRESHOLD = 99;

export function isValidLowStockThreshold(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_LOW_STOCK_THRESHOLD;
}

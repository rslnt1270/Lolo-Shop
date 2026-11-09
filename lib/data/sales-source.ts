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

/** Fechas de negocio `YYYY-MM-DD`, inclusivas. */
export interface DashboardQuery {
  from: string;
  to: string;
  locationIds: string[] | "all";
  /**
   * Cobros pendientes: "all_dates" (owner/manager) no filtra por fecha;
   * "range" (collaborator) los limita a from..to. Lo fija el servidor por rol.
   */
  pendingScope: "all_dates" | "range";
}

/** Importes en pesos con 2 decimales. */
export interface DashboardData {
  /** Vendido: paid + pending_payment (salió mercancía). */
  soldTotal: number;
  /** Cobrado: solo paid. */
  collectedTotal: number;
  salesCount: number;
  byDay: { date: string; total: number; count: number }[];
  byLocation: { locationId: string; total: number }[];
  byChannel: { channel: SaleChannel; total: number }[];
  byPaymentMethod: { method: PaymentMethod; total: number }[];
  byBrand: { brandId: string | null; name: string; units: number; total: number }[];
  byDepartment: { departmentId: string | null; name: string; units: number; total: number }[];
  pendingPayments: { saleId: string; number: number; total: number; locationId: string; createdAt: string }[];
  lowStock: {
    variantId: string;
    locationId: string;
    productTitle: string;
    size: string;
    available: number;
    threshold: number;
  }[];
}

/**
 * Ventas con descuento de stock (ER §3.1) y anulación (ER §3.3). Los permisos
 * por rol se revisan en las actions, no aquí.
 */
export interface SalesDataSource {
  /**
   * Registra la venta y descuenta stock en una sola transacción. Idempotente
   * por `clientRequestId`: un reintento con los mismos datos devuelve la venta
   * ya creada; con otra tienda, canal, método o renglones lanza
   * `SaleRequestConflictError`. Si falta stock en algún renglón lanza
   * `InsufficientStockError` y no deja nada.
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

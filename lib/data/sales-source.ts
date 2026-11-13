import type { OfflineMeta } from "@/lib/domain/offline-sale";
import type { NewSaleInput, PaymentMethod, ReviewReason, SaleChannel, SaleOrigin, SaleReviewStatus, SaleStatus } from "@/lib/domain/sale";

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
  origin: SaleOrigin;
  /** ISO 8601 de la venta sin internet en el teléfono; null si es en línea. */
  soldAt: string | null;
  reviewStatus: SaleReviewStatus | null;
  reviewReasons: ReviewReason[];
  /** Ordenados por variantId. `shortfall`: piezas vendidas sin existencia (sin internet). */
  lines: { variantId: string; quantity: number; unitPrice: number; shortfall: number }[];
}

/** Opciones de `createSale`. Sin `offline` el camino en línea no cambia. */
export interface CreateSaleOptions {
  /** Venta cobrada sin internet: descuenta hasta 0 y registra el faltante (spec F §8.3). */
  offline?: OfflineMeta;
  /** Solo con `offline`: verifica el precio contra `PriceChange` (la acción lo pide para colaborador). */
  checkPrice?: boolean;
}

/** Una venta sin internet por aprobar (spec F §9). */
export interface ReviewItem {
  saleId: string;
  number: number;
  locationId: string;
  locationName: string;
  cashierName: string;
  /** Hora de la venta en el teléfono (ISO 8601). */
  soldAt: string | null;
  /** Hora de llegada al servidor (ISO 8601). */
  createdAt: string;
  total: number;
  paymentMethod: PaymentMethod;
  reasons: ReviewReason[];
  lines: { variantId: string; productTitle: string; size: string; quantity: number; shortfall: number; unitPrice: number }[];
}

/** Máximo de ventas en la lista de revisión. */
export const REVIEW_LIST_LIMIT = 100;
/** Máximo de caracteres de la nota de aprobación. */
export const MAX_REVIEW_NOTE_LENGTH = 200;

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
  /**
   * Solo el dueño: día de negocio de la lista "Ventas de hoy" (para anular).
   * Sin valor no se devuelve `recentSales`. Lo fija el servidor por rol.
   */
  recentSalesDate?: string;
}

/** Máximo de filas en "Ventas de hoy" y en stock bajo. */
export const RECENT_SALES_LIMIT = 50;
export const LOW_STOCK_LIMIT = 50;

/** Importes en pesos con 2 decimales. */
export interface DashboardData {
  /** Vendido: paid + pending_payment (salió mercancía). */
  soldTotal: number;
  /** Cobrado: solo paid. */
  collectedTotal: number;
  salesCount: number;
  /** Ventas sin internet por aprobar en las tiendas del alcance (sin filtro de fecha). */
  pendingReviewCount: number;
  byDay: { date: string; total: number; count: number }[];
  byLocation: { locationId: string; total: number }[];
  byChannel: { channel: SaleChannel; total: number }[];
  byPaymentMethod: { method: PaymentMethod; total: number }[];
  byBrand: { brandId: string | null; name: string; units: number; total: number }[];
  byDepartment: { departmentId: string | null; name: string; units: number; total: number }[];
  pendingPayments: {
    saleId: string;
    number: number;
    total: number;
    locationId: string;
    createdAt: string;
    /** Alias del pedido (solo personal), para reconocerlo. */
    customerAlias: string | null;
  }[];
  /**
   * Solo con `recentSalesDate`: ventas paid y pending_payment de ese día, en
   * las tiendas del alcance, de la más nueva a la más vieja (máx. 50).
   */
  recentSales?: {
    saleId: string;
    number: number;
    total: number;
    locationId: string;
    status: SaleStatus;
    channel: SaleChannel;
    paymentMethod: PaymentMethod;
    createdAt: string;
  }[];
  /** Las 50 filas con menos piezas. */
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
   *
   * Con `opts.offline` (venta cobrada sin internet) nunca lanza por stock:
   * descuenta `min(available, quantity)` por renglón, guarda el resto en
   * `shortfall` y, si hay faltante, producto inactivo, precio no verificado o
   * reloj raro, deja la venta con `reviewStatus = "pending"`. Variante
   * inexistente: `SalesRuleError`. `checkPrice` sin `offline` se ignora.
   */
  createSale(input: NewSaleInput, userId: string, opts?: CreateSaleOptions): Promise<SaleRecord>;
  /**
   * ¿Ya hay una venta con este `clientRequestId`? Sirve para no evaluar reglas
   * previas (p. ej. el cambio de precio) en un reintento: lo resuelve `createSale`.
   */
  hasClientRequest(clientRequestId: string): Promise<boolean>;
  /** `pending_payment` → `paid`. Cualquier otro estado lanza `SalesRuleError`. */
  confirmPayment(saleId: string, userId: string, reference?: string): Promise<SaleRecord>;
  /**
   * Anula una venta `pending_payment` o `paid`. `reason` obligatorio. Si
   * `itemsReturned`, reingresa a la tienda de la venta, por renglón,
   * `quantity − returnedQuantity − shortfall` (solo lo que sí se descontó) con
   * `Movement RETURN`. Si la venta estaba en revisión (`pending`), queda `rejected`.
   */
  cancelSale(saleId: string, userId: string, reason: string, itemsReturned: boolean): Promise<SaleRecord>;
  /** Ventas con `reviewStatus = pending`, la más vieja primero (máx. 100). */
  listSalesForReview(): Promise<ReviewItem[]>;
  /**
   * Aprueba una venta en revisión: `approved` + auditoría + nota opcional (≤ 200).
   * El stock no cambia. Si ya no está pendiente lanza
   * `SalesRuleError("Esta venta ya no está por aprobar.")`. Solo la gana una
   * de dos llamadas simultáneas.
   */
  approveReview(saleId: string, userId: string, note?: string): Promise<SaleRecord>;
  /**
   * Rechaza una venta en revisión (motivo obligatorio ≤ 200): `rejected` +
   * `cancelled` en una transacción. Si `itemsReturned`, reingresa por renglón
   * `quantity − returnedQuantity − shortfall` con `Movement RETURN`.
   */
  rejectReview(saleId: string, userId: string, reason: string, itemsReturned: boolean): Promise<SaleRecord>;
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

import { Prisma } from "@prisma/client";

/**
 * Límites de la transacción interactiva, pensados para una función serverless:
 * `maxWait` es la espera por una conexión del pool y `timeout` la duración
 * máxima de la transacción. Una operación normal tarda milisegundos; si se pasa,
 * se hace rollback (P2028) en vez de retener bloqueos de fila mientras la función sigue viva.
 * Los valores por omisión de Prisma (2 s y 5 s) se quedan cortos con el pooler en frío.
 */
export const TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 5_000,
  timeout: 10_000,
} as const;

/** Ventas (tickets, cancelaciones). */
export const SALE_TX_OPTIONS = TX_OPTIONS;
/** Stock, alta, precio y unión de productos: mismos límites que las ventas. */
export const INVENTORY_TX_OPTIONS = TX_OPTIONS;

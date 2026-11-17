import { isSameSaleRequest } from "@/lib/domain/sale";
import type { NewSaleInput } from "@/lib/domain/sale";
import type { SaleRecord } from "./sales-source";
import { SaleRequestConflictError } from "./errors";

/**
 * Mismo `clientRequestId` (en línea y sin internet): idempotente solo si es el
 * mismo cobro del mismo usuario. Si la venta guardada es de otro usuario es
 * conflicto sin folio (no se devuelve ni se revela esa venta); si es del mismo
 * usuario con otros datos, conflicto con su folio.
 */
export function replayOrConflict(existing: SaleRecord, request: NewSaleInput, userId: string): SaleRecord {
  if (existing.createdById !== userId) throw new SaleRequestConflictError(null);
  if (!isSameSaleRequest(existing, request)) throw new SaleRequestConflictError(existing.number);
  return existing;
}

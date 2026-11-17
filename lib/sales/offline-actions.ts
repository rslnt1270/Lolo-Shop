"use server";
import { revalidatePath } from "next/cache";
import { ForbiddenError } from "@/lib/auth/errors";
import { assertCanOperate, currentUserOrNull, isStoreBound } from "@/lib/auth/permissions";
import { getDataSource } from "@/lib/data/get-source";
import { getSalesSource } from "@/lib/data/get-sales-source";
import { isTransactionTimeout } from "@/lib/data/errors";
import {
  MAX_SNAPSHOT_VARIANTS, type OfflineSnapshot, type OfflineSnapshotVariant,
} from "@/lib/data/source";
import type { SaleRecord } from "@/lib/data/sales-source";
import { validateOfflineSale } from "@/lib/domain/offline-sale";
import { fail, mapOfflineError, sessionExpired, type SaleActionResult } from "./action-errors";
import { SnapshotSigningUnavailableError, signSnapshotToken, verifySnapshotToken } from "./snapshot-token";

export type OfflineSnapshotResult =
  /**
   * `snapshotToken`: firma del servidor sobre usuario, tienda y `generatedAt`. El
   * teléfono la guarda con la copia y la manda con cada venta hecha con ella.
   */
  | { ok: true; snapshot: OfflineSnapshot; snapshotToken: string }
  | { ok: false; reason: "session_expired" | "forbidden" | "too_large" | "unavailable" };

/**
 * `USER_MISMATCH`: la venta se cobró con otro usuario (`sellerUserId`) que el de
 * la sesión. No se crea nada; el teléfono la deja en espera hasta que entre
 * quien la cobró.
 */
export type OfflineUserMismatch = { ok: false; code: "USER_MISMATCH"; message: string };

export type OfflineSaleResult =
  | { ok: true; sale: SaleRecord; review: boolean }
  | Extract<SaleActionResult, { ok: false }>
  | OfflineUserMismatch;

const userMismatch = (): OfflineUserMismatch => ({
  ok: false,
  code: "USER_MISMATCH",
  message: "Esta venta la cobró otro usuario. Se enviará cuando esa persona inicie sesión.",
});

/** Forma cerrada (spec §5): lo que no esté aquí no llega al teléfono aunque el data source lo trajera. */
const projectVariant = (v: OfflineSnapshotVariant): OfflineSnapshotVariant => ({
  variantId: v.variantId,
  productId: v.productId,
  barcode: v.barcode,
  sku: v.sku,
  productTitle: v.productTitle,
  variantTitle: v.variantTitle,
  size: v.size,
  price: v.price,
  available: v.available,
});

/**
 * Copia de precios y existencias de una tienda para vender sin internet. Relee
 * rol y tienda de la base; colaborador y manager con tienda solo bajan la suya.
 * Nunca lanza por sesión, permiso, tamaño o base lenta.
 */
export async function getOfflineSnapshotAction(locationId: string): Promise<OfflineSnapshotResult> {
  const user = await currentUserOrNull();
  if (!user) return { ok: false, reason: "session_expired" };
  if (typeof locationId !== "string" || locationId === "") return { ok: false, reason: "forbidden" };
  try {
    assertCanOperate(user, locationId);
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, reason: "forbidden" };
    throw err;
  }
  let snapshot: OfflineSnapshot;
  try {
    snapshot = await getDataSource().getOfflineSnapshot(locationId);
  } catch (err) {
    if (isTransactionTimeout(err)) return { ok: false, reason: "unavailable" };
    throw err;
  }
  if (snapshot.variants.length > MAX_SNAPSHOT_VARIANTS) return { ok: false, reason: "too_large" };
  let snapshotToken: string;
  try {
    snapshotToken = signSnapshotToken({ userId: user.id, locationId, generatedAt: snapshot.generatedAt });
  } catch (err) {
    // Nunca se entrega una copia sin firma.
    if (err instanceof SnapshotSigningUnavailableError) return { ok: false, reason: "unavailable" };
    throw err;
  }
  return {
    ok: true,
    snapshotToken,
    snapshot: {
      locationId: snapshot.locationId,
      generatedAt: snapshot.generatedAt,
      variants: snapshot.variants.map(projectVariant),
    },
  };
}

/**
 * Envía una venta cobrada sin internet (spec §8.4). Misma sesión y alcance de
 * tienda que `createSaleAction`; no evalúa `PRICE_CHANGED`: el precio lo verifica
 * `createSale` contra `PriceChange` solo para colaborador y, si no cuadra, la
 * venta queda en revisión del dueño. Reenviar el mismo `clientRequestId`
 * devuelve la venta original (replay). El usuario de la venta es siempre el de
 * la sesión.
 *
 * La fecha de la copia sale solo del `snapshotToken` firmado (el `snapshotAt`
 * del cliente se ignora). Sin token válido para este usuario y esta tienda la
 * venta se acepta igual (ya se cobró) y la copia no cuenta: para el colaborador
 * solo cuadra el precio vigente (si no, `price_unverified`); owner y manager no
 * se verifican por precio, como en línea.
 *
 * `sellerUserId` es el usuario con el que el teléfono cobró la venta. Si no es
 * el de la sesión (o falta) responde `USER_MISMATCH` antes de validar nada: una
 * venta nunca queda registrada a nombre de alguien distinto de quien la cobró.
 */
export async function submitOfflineSaleAction(input: unknown): Promise<OfflineSaleResult> {
  const user = await currentUserOrNull();
  if (!user) return sessionExpired();
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
  if (raw && raw.sellerUserId !== user.id) return userMismatch();
  // La hora del servidor como fecha de copia provisional: solo para validar la forma.
  const parsed = validateOfflineSale(raw && { ...raw, snapshotAt: new Date().toISOString() });
  if (!parsed.ok) return fail("INVALID", parsed.message);
  const { soldAt, snapshotAt: serverNow, ...sale } = parsed.value;

  if (user.role === "collaborator" && !user.locationId) {
    return fail("FORBIDDEN", "No tienes tienda asignada. Pide al dueño que te asigne una.");
  }
  if (isStoreBound(user) && sale.locationId !== user.locationId) {
    return fail("FORBIDDEN", "Solo puedes vender en tu tienda.");
  }

  const signed = verifySnapshotToken(raw?.snapshotToken, { userId: user.id, locationId: sale.locationId });

  try {
    const record = await getSalesSource().createSale(sale, user.id, {
      offline: { soldAt, snapshotAt: signed ? signed.generatedAt : serverNow },
      checkPrice: user.role === "collaborator",
      snapshotUnverified: !signed,
    });
    revalidatePath("/ventas");
    return { ok: true, sale: record, review: record.reviewStatus === "pending" };
  } catch (err) {
    return mapOfflineError(err);
  }
}

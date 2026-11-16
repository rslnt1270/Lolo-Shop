import { describe, expect, it } from "vitest";
import type { OfflineSnapshot, OfflineSnapshotVariant } from "@/lib/data/source";
import type { QueuedSale } from "../db";
import { lookupOffline, searchOffline, toDraftMatch } from "../lookup";

const v = (over: Partial<OfflineSnapshotVariant> = {}): OfflineSnapshotVariant => ({
  variantId: "v1",
  productId: "p1",
  barcode: "7501234567890",
  sku: "LS-AAAAAA-1",
  productTitle: "Playera Guess negro",
  variantTitle: "M",
  size: "M",
  price: 450,
  available: 3,
  ...over,
});

const snap = (variants: OfflineSnapshotVariant[], locationId = "loc-1"): OfflineSnapshot => ({
  locationId,
  generatedAt: "2026-11-16T09:00:00.000Z",
  variants,
});

const queued = (variantId: string, quantity: number, over: Partial<QueuedSale> = {}): QueuedSale => ({
  clientRequestId: `${variantId}-${quantity}-${over.state ?? "pending"}-${over.locationId ?? "loc-1"}`,
  userId: "u1",
  locationId: "loc-1",
  channel: "store",
  paymentMethod: "cash",
  lines: [{ variantId, quantity, unitPrice: 450, sku: "S", productTitle: "Playera", variantTitle: "M" }],
  total: 450 * quantity,
  soldAt: "2026-11-16T10:00:00.000Z",
  snapshotAt: "2026-11-16T09:00:00.000Z",
  snapshotToken: "tok.sig",
  state: "pending",
  attempts: 0,
  ...over,
});

describe("lookupOffline", () => {
  it("lookupOffline encuentra por barcode y por sku normalizados", () => {
    const s = snap([v(), v({ variantId: "v2", barcode: "ABC123", sku: "LS-BBBBBB-2", size: "L" })]);
    // Espacios y caracteres de control del lector se quitan, como en el servidor.
    expect(lookupOffline(" 7501234567890\n", s, [])).toMatchObject({ found: true, variant: { variantId: "v1" } });
    // UPC-A de 12 dígitos equivale al EAN-13 con 0 inicial.
    const upc = snap([v({ barcode: "0012345678905" })]);
    expect(lookupOffline("012345678905", upc, [])).toMatchObject({ found: true, variant: { variantId: "v1" } });
    // SKU tecleado en minúsculas.
    expect(lookupOffline("ls-bbbbbb-2", s, [])).toMatchObject({ found: true, variant: { variantId: "v2" } });
    expect(lookupOffline("abc123", s, [])).toMatchObject({ found: true, variant: { variantId: "v2" } });
    expect(lookupOffline("9999", s, [])).toEqual({ found: false });
    expect(lookupOffline("   ", s, [])).toEqual({ found: false });
  });

  it("available descuenta la cola pending", () => {
    const s = snap([v({ available: 3 })]);
    const queue = [
      queued("v1", 1),
      queued("v1", 1, { state: "sending" }),
      // Ya enviadas, rechazadas o de otra tienda: no se restan.
      queued("v1", 1, { state: "synced" }),
      queued("v1", 1, { state: "needs_attention" }),
      queued("v1", 1, { locationId: "loc-2" }),
    ];
    expect(lookupOffline("LS-AAAAAA-1", s, queue)).toMatchObject({ found: true, available: 1 });
    expect(lookupOffline("LS-AAAAAA-1", s, [queued("v1", 5)])).toMatchObject({ found: true, available: 0 });
  });

  it("incluye las prendas con 0 piezas para decir sin existencias", () => {
    expect(lookupOffline("LS-AAAAAA-1", snap([v({ available: 0 })]), [])).toMatchObject({ found: true, available: 0 });
  });
});

describe("toDraftMatch", () => {
  it("arma la prenda para el carrito sin foto", () => {
    const m = toDraftMatch(v());
    expect(m.product).toMatchObject({ id: "p1", title: "Playera Guess negro", imageUrl: null });
    expect(m.variant).toMatchObject({ id: "v1", sku: "LS-AAAAAA-1", title: "M", size: "M", price: 450 });
    expect(m.product.variants).toEqual([m.variant]);
  });
});

describe("searchOffline", () => {
  const s = snap([
    v(),
    v({ variantId: "v2", sku: "LS-AAAAAA-2", size: "L", variantTitle: "L", available: 0 }),
    v({ variantId: "v3", productId: "p2", sku: "LS-CCCCCC-3", productTitle: "Pantalón Levi's azul", barcode: null }),
  ]);

  it("busca por tipo, marca o color en el título y agrupa tallas por producto", () => {
    const hits = searchOffline("guess", s, []);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ productId: "p1", title: "Playera Guess negro" });
    expect(hits[0].sizes.map((x) => [x.size, x.available])).toEqual([["M", 3], ["L", 0]]);
    expect(searchOffline("PANTALÓN", s, []).map((h) => h.productId)).toEqual(["p2"]);
    expect(searchOffline("azul", s, []).map((h) => h.productId)).toEqual(["p2"]);
  });

  it("busca por código interno y descuenta la cola", () => {
    const hits = searchOffline("ls-cccccc-3", s, [queued("v3", 2)]);
    expect(hits.map((h) => h.productId)).toEqual(["p2"]);
    expect(hits[0].sizes[0].available).toBe(1);
  });

  it("menos de 2 letras no busca", () => {
    expect(searchOffline("g", s, [])).toEqual([]);
    expect(searchOffline("  ", s, [])).toEqual([]);
  });
});

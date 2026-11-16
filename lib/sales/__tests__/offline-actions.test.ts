import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const sales = { hasClientRequest: vi.fn(), createSale: vi.fn() };
const inventory = { getOfflineSnapshot: vi.fn() };
const variantFindMany = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/data/get-sales-source", () => ({ getSalesSource: () => sales }));
vi.mock("@/lib/data/get-source", () => ({ getDataSource: () => inventory }));
vi.mock("@/lib/prisma", () => ({
  default: { variant: { findMany: (a: unknown) => variantFindMany(a) } },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getOfflineSnapshotAction, submitOfflineSaleAction } from "../offline-actions";
import { MAX_SNAPSHOT_VARIANTS, type OfflineSnapshotVariant } from "@/lib/data/source";
import { InsufficientStockError, SaleRequestConflictError, SalesRuleError } from "@/lib/data/errors";
import { UnauthenticatedError } from "@/lib/auth/errors";
import { revalidatePath } from "next/cache";

const RID = "123e4567-e89b-42d3-a456-426614174000";
const SOLD_AT = "2026-11-12T18:00:00.000Z";
const SNAP_AT = "2026-11-12T10:00:00.000Z";
const input = (over: Record<string, unknown> = {}) => ({
  clientRequestId: RID,
  locationId: "B",
  channel: "store",
  paymentMethod: "cash",
  lines: [{ variantId: "v1", quantity: 1, unitPrice: 100 }],
  soldAt: SOLD_AT,
  snapshotAt: SNAP_AT,
  ...over,
});
const sale = (over: Record<string, unknown> = {}) => ({ id: "s1", locationId: "B", reviewStatus: null, ...over });
const as = (role: string, locationId: string | null = null) =>
  getCurrentUser.mockResolvedValue({ id: "u1", role, locationId });

const variant = (i: number): OfflineSnapshotVariant => ({
  variantId: `v${i}`,
  productId: "p1",
  barcode: null,
  sku: `SKU-${i}`,
  productTitle: "Playera",
  variantTitle: "M",
  size: "M",
  price: 300,
  available: 1,
});
const snapshot = (n = 1) => ({
  locationId: "B",
  generatedAt: "2026-11-12T10:00:00.000Z",
  variants: Array.from({ length: n }, (_, i) => variant(i)),
});

const prismaError = (code: string) => Object.assign(new Error(`prisma ${code}`), { code });
const SESSION = {
  ok: false,
  code: "FORBIDDEN",
  message: "Tu sesión terminó. Vuelve a iniciar sesión.",
  reason: "session_expired",
};

beforeEach(() => {
  vi.clearAllMocks();
  as("owner");
  inventory.getOfflineSnapshot.mockResolvedValue(snapshot());
  sales.createSale.mockResolvedValue(sale());
  sales.hasClientRequest.mockResolvedValue(false);
  variantFindMany.mockResolvedValue([{ id: "v1", price: "999.00" }]);
});

describe("getOfflineSnapshotAction", () => {
  it("sin sesión → session_expired", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    await expect(getOfflineSnapshotAction("B")).resolves.toEqual({ ok: false, reason: "session_expired" });
    expect(inventory.getOfflineSnapshot).not.toHaveBeenCalled();
  });

  it("otro error al leer el usuario se propaga", async () => {
    getCurrentUser.mockRejectedValue(new Error("db caída"));
    await expect(getOfflineSnapshotAction("B")).rejects.toThrow("db caída");
  });

  it("colaborador no baja la copia de otra tienda → forbidden", async () => {
    as("collaborator", "A");
    await expect(getOfflineSnapshotAction("B")).resolves.toEqual({ ok: false, reason: "forbidden" });
    expect(inventory.getOfflineSnapshot).not.toHaveBeenCalled();
  });

  it("colaborador sin tienda → forbidden", async () => {
    as("collaborator", null);
    await expect(getOfflineSnapshotAction("B")).resolves.toEqual({ ok: false, reason: "forbidden" });
  });

  it("manager con tienda A no baja B → forbidden", async () => {
    as("manager", "A");
    await expect(getOfflineSnapshotAction("B")).resolves.toEqual({ ok: false, reason: "forbidden" });
  });

  it.each([[""], [42], [null], [undefined]])("tienda inválida (%s) → forbidden", async (loc) => {
    await expect(getOfflineSnapshotAction(loc as string)).resolves.toEqual({ ok: false, reason: "forbidden" });
    expect(inventory.getOfflineSnapshot).not.toHaveBeenCalled();
  });

  it.each([
    ["collaborator", "B"],
    ["manager", "B"],
    ["manager", null],
    ["owner", null],
  ])("%s (tienda %s) baja la copia de B", async (role, loc) => {
    as(role, loc);
    const r = await getOfflineSnapshotAction("B");
    expect(r).toEqual({ ok: true, snapshot: snapshot() });
    expect(inventory.getOfflineSnapshot).toHaveBeenCalledWith("B");
  });

  it("las llaves de cada variante son exactamente las de OfflineSnapshotVariant", async () => {
    // Aunque el data source trajera algo de más, la acción proyecta la forma cerrada.
    inventory.getOfflineSnapshot.mockResolvedValue({
      locationId: "B",
      generatedAt: "2026-11-12T10:00:00.000Z",
      variants: [{ ...variant(1), cost: 50, minStock: 2, inventory: [{ locationId: "A", available: 9 }], imageUrl: "x" }],
      extra: "no",
    });
    const r = await getOfflineSnapshotAction("B");
    if (!r.ok) throw new Error("se esperaba ok");
    expect(Object.keys(r.snapshot).sort()).toEqual(["generatedAt", "locationId", "variants"]);
    expect(Object.keys(r.snapshot.variants[0]).sort()).toEqual(
      ["available", "barcode", "price", "productId", "productTitle", "size", "sku", "variantId", "variantTitle"],
    );
  });

  it(`exactamente ${MAX_SNAPSHOT_VARIANTS} variantes → ok`, async () => {
    inventory.getOfflineSnapshot.mockResolvedValue(snapshot(MAX_SNAPSHOT_VARIANTS));
    const r = await getOfflineSnapshotAction("B");
    expect(r.ok).toBe(true);
  });

  it("más de 20 000 → too_large", async () => {
    inventory.getOfflineSnapshot.mockResolvedValue(snapshot(MAX_SNAPSHOT_VARIANTS + 1));
    await expect(getOfflineSnapshotAction("B")).resolves.toEqual({ ok: false, reason: "too_large" });
  });

  it.each([["P2024"], ["P2028"]])("%s → unavailable", async (code) => {
    inventory.getOfflineSnapshot.mockRejectedValue(prismaError(code));
    await expect(getOfflineSnapshotAction("B")).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("otro error del data source se propaga", async () => {
    inventory.getOfflineSnapshot.mockRejectedValue(new Error("boom"));
    await expect(getOfflineSnapshotAction("B")).rejects.toThrow("boom");
  });
});

describe("submitOfflineSaleAction", () => {
  it("sin sesión → FORBIDDEN session_expired", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    await expect(submitOfflineSaleAction(input())).resolves.toEqual(SESSION);
    expect(sales.createSale).not.toHaveBeenCalled();
  });

  it("otro error al leer el usuario se propaga", async () => {
    getCurrentUser.mockRejectedValue(new Error("db caída"));
    await expect(submitOfflineSaleAction(input())).rejects.toThrow("db caída");
  });

  it("colaborador en otra tienda → FORBIDDEN", async () => {
    as("collaborator", "A");
    await expect(submitOfflineSaleAction(input())).resolves.toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "Solo puedes vender en tu tienda.",
    });
    expect(sales.createSale).not.toHaveBeenCalled();
  });

  it("manager con tienda A vende en B → FORBIDDEN", async () => {
    as("manager", "A");
    const r = await submitOfflineSaleAction(input());
    expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(sales.createSale).not.toHaveBeenCalled();
  });

  it("colaborador sin tienda → FORBIDDEN", async () => {
    as("collaborator", null);
    const r = await submitOfflineSaleAction(input());
    expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(sales.createSale).not.toHaveBeenCalled();
  });

  it("soldAt inválido → INVALID", async () => {
    const r = await submitOfflineSaleAction(input({ soldAt: "ayer" }));
    expect(r).toEqual({ ok: false, code: "INVALID", message: "La hora de la venta no es válida." });
    expect(sales.createSale).not.toHaveBeenCalled();
  });

  it("snapshotAt faltante → INVALID", async () => {
    const r = await submitOfflineSaleAction(input({ snapshotAt: undefined }));
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("venta inválida (sin renglones) → INVALID", async () => {
    const r = await submitOfflineSaleAction(input({ lines: [] }));
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("no evalúa PRICE_CHANGED ni consulta hasClientRequest", async () => {
    as("collaborator", "B");
    const r = await submitOfflineSaleAction(input());
    expect(r.ok).toBe(true);
    expect(variantFindMany).not.toHaveBeenCalled();
    expect(sales.hasClientRequest).not.toHaveBeenCalled();
  });

  it.each([
    ["collaborator", "B", true],
    ["manager", "B", false],
    ["manager", null, false],
    ["owner", null, false],
  ])("pasa checkPrice true solo a colaborador (%s)", async (role, loc, checkPrice) => {
    as(role, loc);
    await submitOfflineSaleAction(input());
    expect(sales.createSale).toHaveBeenCalledWith(
      expect.objectContaining({ clientRequestId: RID, locationId: "B" }),
      "u1",
      { offline: { soldAt: SOLD_AT, snapshotAt: SNAP_AT }, checkPrice },
    );
  });

  it("el usuario de la venta es el de la sesión, no el que mande el cliente", async () => {
    await submitOfflineSaleAction(input({ userId: "otro", createdById: "otro" }));
    const [sent, userId] = sales.createSale.mock.calls[0];
    expect(userId).toBe("u1");
    expect(sent).not.toHaveProperty("userId");
    expect(sent).not.toHaveProperty("createdById");
  });

  it("ok sin revisión: review false y revalida /ventas", async () => {
    const r = await submitOfflineSaleAction(input());
    expect(r).toEqual({ ok: true, sale: sale(), review: false });
    expect(revalidatePath).toHaveBeenCalledWith("/ventas");
  });

  it("ok con revisión pendiente: review true", async () => {
    sales.createSale.mockResolvedValue(sale({ reviewStatus: "pending" }));
    const r = await submitOfflineSaleAction(input());
    expect(r).toMatchObject({ ok: true, review: true });
  });

  it("replay con el mismo clientRequestId devuelve la venta original", async () => {
    sales.createSale.mockResolvedValue(sale({ id: "original" }));
    const a = await submitOfflineSaleAction(input());
    const b = await submitOfflineSaleAction(input());
    expect(a).toEqual(b);
    expect(sales.createSale.mock.calls.map((c) => c[0].clientRequestId)).toEqual([RID, RID]);
  });

  it.each([["P2028"], ["P2024"]])("%s → UNAVAILABLE (se reintenta con el mismo id)", async (code) => {
    sales.createSale.mockRejectedValue(prismaError(code));
    const r = await submitOfflineSaleAction(input());
    expect(r).toEqual({ ok: false, code: "UNAVAILABLE", message: "El servidor tardó en responder. Intenta cobrar de nuevo." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("P2003 → INVALID", async () => {
    sales.createSale.mockRejectedValue(prismaError("P2003"));
    await expect(submitOfflineSaleAction(input())).resolves.toEqual({
      ok: false,
      code: "INVALID",
      message: "La tienda o la prenda ya no existe.",
    });
  });

  it("request_conflict → INVALID con reason", async () => {
    sales.createSale.mockRejectedValue(new SaleRequestConflictError(12));
    const r = await submitOfflineSaleAction(input());
    expect(r).toMatchObject({ ok: false, code: "INVALID", reason: "request_conflict" });
  });

  it("SalesRuleError de prenda inexistente → NOT_FOUND", async () => {
    sales.createSale.mockRejectedValue(new SalesRuleError("La prenda no existe."));
    await expect(submitOfflineSaleAction(input())).resolves.toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "La prenda no existe.",
    });
  });

  it("SalesRuleError de regla → INVALID", async () => {
    sales.createSale.mockRejectedValue(new SalesRuleError("Regla rota."));
    await expect(submitOfflineSaleAction(input())).resolves.toEqual({ ok: false, code: "INVALID", message: "Regla rota." });
  });

  it("UnauthenticatedError dentro del cobro → session_expired", async () => {
    sales.createSale.mockRejectedValue(new UnauthenticatedError());
    await expect(submitOfflineSaleAction(input())).resolves.toEqual(SESSION);
  });

  it("InsufficientStockError (no debería ocurrir sin internet) no se reporta como NO_STOCK", async () => {
    // Queda en needs_attention en el teléfono (visible), sin reintentos infinitos.
    sales.createSale.mockRejectedValue(new InsufficientStockError("v1", 0, 1));
    const r = await submitOfflineSaleAction(input());
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(r).not.toHaveProperty("variantId");
  });

  it("error desconocido se propaga", async () => {
    sales.createSale.mockRejectedValue(new Error("boom"));
    await expect(submitOfflineSaleAction(input())).rejects.toThrow("boom");
  });
});

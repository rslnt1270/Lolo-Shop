import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const sales = { hasClientRequest: vi.fn(), createSale: vi.fn() };
// Algunas pruebas usan el doble en memoria de punta a punta.
let salesImpl: unknown = sales;
const inventory = { getOfflineSnapshot: vi.fn() };
const variantFindMany = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/data/get-sales-source", () => ({ getSalesSource: () => salesImpl }));
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
import { signSnapshotToken, verifySnapshotToken } from "../snapshot-token";
import { FixtureSalesDataSource } from "@/lib/data/fixture-sales-source";
import { pinMexicoNoon } from "../../../test/mexico-noon";

// Secreto solo de prueba (no es el de ningún ambiente).
const TEST_SECRET = "test-only-snapshot-secret";

const RID = "123e4567-e89b-42d3-a456-426614174000";
const SOLD_AT = "2026-11-12T18:00:00.000Z";
const SNAP_AT = "2026-11-12T10:00:00.000Z";
const token = (userId = "u1", locationId = "B", generatedAt = SNAP_AT) =>
  signSnapshotToken({ userId, locationId, generatedAt });
const input = (over: Record<string, unknown> = {}) => ({
  clientRequestId: RID,
  locationId: "B",
  channel: "store",
  paymentMethod: "cash",
  lines: [{ variantId: "v1", quantity: 1, unitPrice: 100 }],
  soldAt: SOLD_AT,
  snapshotAt: SNAP_AT,
  snapshotToken: token(),
  sellerUserId: "u1",
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
  vi.unstubAllEnvs();
  vi.stubEnv("NEXTAUTH_SECRET", TEST_SECRET);
  salesImpl = sales;
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

  it.each([[""], [42], [null], [undefined]])("tienda inválida (%s) → forbidden", async (loc) => {
    await expect(getOfflineSnapshotAction(loc as string)).resolves.toEqual({ ok: false, reason: "forbidden" });
    expect(inventory.getOfflineSnapshot).not.toHaveBeenCalled();
  });

  it.each([
    ["collaborator", "B"],
    ["collaborator", "A"],
    ["collaborator", null],
    ["manager", "B"],
    ["manager", "A"],
    ["manager", null],
    ["owner", null],
  ])("%s (tienda asignada %s) baja la copia de la tienda elegida B", async (role, loc) => {
    as(role, loc);
    const r = await getOfflineSnapshotAction("B");
    expect(r).toEqual({ ok: true, snapshot: snapshot(), snapshotToken: expect.any(String) });
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
    expect(Object.keys(r).sort()).toEqual(["ok", "snapshot", "snapshotToken"]);
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

  it("el token firma usuario, tienda y generatedAt de la copia", async () => {
    as("collaborator", "B");
    const r = await getOfflineSnapshotAction("B");
    if (!r.ok) throw new Error("se esperaba ok");
    expect(verifySnapshotToken(r.snapshotToken, { userId: "u1", locationId: "B" })).toEqual({
      generatedAt: snapshot().generatedAt,
    });
    expect(verifySnapshotToken(r.snapshotToken, { userId: "u1", locationId: "A" })).toBeNull();
    expect(r.snapshotToken).not.toContain(TEST_SECRET);
  });

  it("sin NEXTAUTH_SECRET → unavailable (nunca una copia sin firma)", async () => {
    vi.stubEnv("NEXTAUTH_SECRET", "");
    await expect(getOfflineSnapshotAction("B")).resolves.toEqual({ ok: false, reason: "unavailable" });
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
  const MISMATCH = {
    ok: false,
    code: "USER_MISMATCH",
    message: "Esta venta la cobró otro usuario. Se enviará cuando esa persona inicie sesión.",
  };

  it.each([
    ["de otro usuario", { sellerUserId: "u2" }],
    ["ausente", { sellerUserId: undefined }],
    ["que no es texto", { sellerUserId: 42 }],
    ["vacío", { sellerUserId: "" }],
  ])("sellerUserId %s → USER_MISMATCH sin crear la venta", async (_n, over) => {
    const r = await submitOfflineSaleAction(input(over));
    expect(r).toEqual(MISMATCH);
    expect(sales.createSale).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("USER_MISMATCH también con una venta inválida: no revela nada más", async () => {
    const r = await submitOfflineSaleAction(input({ sellerUserId: "u2", lines: [] }));
    expect(r).toEqual(MISMATCH);
  });

  it("sellerUserId igual al de la sesión: se registra con el usuario de la sesión", async () => {
    const r = await submitOfflineSaleAction(input({ sellerUserId: "u1" }));
    expect(r.ok).toBe(true);
    const [sent, userId] = sales.createSale.mock.calls[0];
    expect(userId).toBe("u1");
    expect(sent).not.toHaveProperty("sellerUserId");
  });

  it("de punta a punta: USER_MISMATCH no descuenta stock ni crea venta", async () => {
    const ds = new FixtureSalesDataSource();
    salesImpl = ds;
    const create = vi.spyOn(ds, "createSale");
    const r = await submitOfflineSaleAction(input({ locationId: "loc-2", sellerUserId: "u2" }));
    expect(r).toMatchObject({ ok: false, code: "USER_MISMATCH" });
    expect(create).not.toHaveBeenCalled();
  });

  it("sin sesión → FORBIDDEN session_expired", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    await expect(submitOfflineSaleAction(input())).resolves.toEqual(SESSION);
    expect(sales.createSale).not.toHaveBeenCalled();
  });

  it("otro error al leer el usuario se propaga", async () => {
    getCurrentUser.mockRejectedValue(new Error("db caída"));
    await expect(submitOfflineSaleAction(input())).rejects.toThrow("db caída");
  });

  it("colaborador con tienda A vende en B con copia firmada para (usuario, B) → se registra", async () => {
    as("collaborator", "A");
    const r = await submitOfflineSaleAction(input({ snapshotToken: token("u1", "B") }));
    expect(r.ok).toBe(true);
    expect(sales.createSale).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: "B" }),
      "u1",
      { offline: { soldAt: SOLD_AT, snapshotAt: SNAP_AT }, checkPrice: true, snapshotUnverified: false },
    );
  });

  it("copia firmada para (usuario, A) y venta en B → el token no vale para B (copia sin verificar)", async () => {
    as("collaborator", "A");
    const r = await submitOfflineSaleAction(input({ snapshotToken: token("u1", "A") }));
    expect(r.ok).toBe(true);
    const [, , opts] = sales.createSale.mock.calls[0];
    expect(opts.snapshotUnverified).toBe(true);
    expect(opts.offline.snapshotAt).not.toBe(SNAP_AT);
  });

  it("manager con tienda A vende en B → no devuelve FORBIDDEN", async () => {
    as("manager", "A");
    const r = await submitOfflineSaleAction(input());
    expect(r).not.toMatchObject({ code: "FORBIDDEN" });
    expect(sales.createSale).toHaveBeenCalled();
  });

  it("colaborador sin tienda asignada → se registra", async () => {
    as("collaborator", null);
    const r = await submitOfflineSaleAction(input());
    expect(r.ok).toBe(true);
  });

  it("soldAt inválido → INVALID", async () => {
    const r = await submitOfflineSaleAction(input({ soldAt: "ayer" }));
    expect(r).toEqual({ ok: false, code: "INVALID", message: "La hora de la venta no es válida." });
    expect(sales.createSale).not.toHaveBeenCalled();
  });

  it.each([[null], ["texto"], [42]])("entrada que no es objeto (%s) → INVALID", async (v) => {
    const r = await submitOfflineSaleAction(v);
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(sales.createSale).not.toHaveBeenCalled();
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
      { offline: { soldAt: SOLD_AT, snapshotAt: SNAP_AT }, checkPrice, snapshotUnverified: false },
    );
  });

  it("token válido: usa su generatedAt e ignora el snapshotAt del cliente", async () => {
    as("collaborator", "B");
    const r = await submitOfflineSaleAction(input({ snapshotAt: "2026-11-06T00:00:00.000Z" }));
    expect(r.ok).toBe(true);
    expect(sales.createSale.mock.calls[0][2]).toEqual({
      offline: { soldAt: SOLD_AT, snapshotAt: SNAP_AT },
      checkPrice: true,
      snapshotUnverified: false,
    });
  });

  it("token válido sin snapshotAt del cliente: se acepta igual", async () => {
    const r = await submitOfflineSaleAction(input({ snapshotAt: undefined }));
    expect(r.ok).toBe(true);
    expect(sales.createSale.mock.calls[0][2].offline.snapshotAt).toBe(SNAP_AT);
  });

  const forged = () => {
    const t = token();
    const [, mac] = t.split(".");
    const payload = Buffer.from(
      JSON.stringify({ userId: "u1", locationId: "B", generatedAt: "2026-11-06T10:00:00.000Z" }),
    ).toString("base64url");
    return `${payload}.${mac}`;
  };
  it.each([
    ["alterado", () => forged()],
    ["de otro usuario", () => token("u2")],
    ["de otra tienda", () => token("u1", "A")],
    ["firmado con otro secreto", () => {
      vi.stubEnv("NEXTAUTH_SECRET", "otro-secreto-de-prueba");
      const t = token();
      vi.stubEnv("NEXTAUTH_SECRET", TEST_SECRET);
      return t;
    }],
    ["ausente", () => undefined],
    ["que no es texto", () => 42],
  ])("token %s: se acepta, copia no verificada y snapshotAt = ahora", async (_n, make) => {
    as("collaborator", "B");
    const before = Date.now();
    const r = await submitOfflineSaleAction(input({ snapshotToken: make(), snapshotAt: "2026-11-06T00:00:00.000Z" }));
    expect(r.ok).toBe(true);
    const opts = sales.createSale.mock.calls[0][2];
    expect(opts.snapshotUnverified).toBe(true);
    expect(opts.checkPrice).toBe(true);
    expect(opts.offline.soldAt).toBe(SOLD_AT);
    const snapMs = new Date(opts.offline.snapshotAt).getTime();
    expect(snapMs).toBeGreaterThanOrEqual(before);
    expect(snapMs).toBeLessThanOrEqual(Date.now());
  });

  describe("de punta a punta con el doble en memoria", () => {
    const HOUR = 60 * 60 * 1000;
    // Mediodía de México: "hace 1 h" es el mismo día de negocio.
    pinMexicoNoon();

    const e2e = (over: Record<string, unknown>) => {
      const ds = new FixtureSalesDataSource();
      salesImpl = ds;
      return { ds, run: () => submitOfflineSaleAction(input({ locationId: "loc-2", ...over })) };
    };
    const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
    const linesOld = [{ variantId: "var-1", quantity: 1, unitPrice: 400 }];

    it("token válido y precio viejo dentro de la copia: sin revisión", async () => {
      as("collaborator", "loc-2");
      const { ds, run } = e2e({ lines: linesOld, soldAt: iso(HOUR), snapshotToken: token("u1", "loc-2", iso(3 * HOUR)) });
      ds.recordPriceChange("var-1", 400, 450, new Date(Date.now() - 2 * HOUR));
      const r = await run();
      expect(r).toMatchObject({ ok: true, review: false, sale: { reviewReasons: [] } });
    });

    it.each([
      ["alterado", () => forged()],
      ["de otro usuario", () => token("u2", "loc-2", iso(3 * HOUR))],
      ["de otra tienda", () => token("u1", "loc-1", iso(3 * HOUR))],
      ["ausente", () => undefined],
    ])("token %s: aceptada con price_unverified y el precio viejo no lo limpia", async (_n, make) => {
      as("collaborator", "loc-2");
      const { ds, run } = e2e({ lines: linesOld, soldAt: iso(HOUR), snapshotAt: iso(3 * HOUR), snapshotToken: make() });
      ds.recordPriceChange("var-1", 400, 450, new Date(Date.now() - 2 * HOUR));
      const r = await run();
      expect(r).toMatchObject({ ok: true, review: true, sale: { reviewStatus: "pending", reviewReasons: ["price_unverified"] } });
    });

    it.each([
      ["alterado", () => forged()],
      ["ausente", () => undefined],
    ])("token %s con precio vigente (colaborador): aceptada sin revisión", async (_n, make) => {
      as("collaborator", "loc-2");
      const { run } = e2e({ soldAt: iso(HOUR), snapshotToken: make(), lines: [{ variantId: "var-1", quantity: 1, unitPrice: 450 }] });
      const r = await run();
      expect(r).toMatchObject({ ok: true, review: false, sale: { reviewReasons: [] } });
    });

    it.each([
      ["owner", null],
      ["manager", null],
      ["manager", "loc-2"],
    ])("%s (tienda %s) sin token y con precio viejo: nunca price_unverified", async (role, loc) => {
      as(role, loc);
      const { ds, run } = e2e({ lines: linesOld, soldAt: iso(HOUR), snapshotToken: undefined });
      ds.recordPriceChange("var-1", 400, 450, new Date(Date.now() - 2 * HOUR));
      const r = await run();
      expect(r).toMatchObject({ ok: true, review: false, sale: { reviewReasons: [] } });
    });

    it("soldAt de ayer → revisión (clock_skew)", async () => {
      as("collaborator", "loc-2");
      const { run } = e2e({
        soldAt: iso(24 * HOUR),
        snapshotToken: token("u1", "loc-2", iso(25 * HOUR)),
        lines: [{ variantId: "var-1", quantity: 1, unitPrice: 450 }],
      });
      const r = await run();
      expect(r).toMatchObject({ ok: true, review: true, sale: { reviewReasons: ["clock_skew"] } });
    });
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

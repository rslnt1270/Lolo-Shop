import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const source = { createSale: vi.fn(), confirmPayment: vi.fn(), cancelSale: vi.fn() };
const variantFindMany = vi.fn();
const saleFindUnique = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/data/get-sales-source", () => ({ getSalesSource: () => source }));
vi.mock("@/lib/prisma", () => ({
  default: {
    variant: { findMany: (a: unknown) => variantFindMany(a) },
    sale: { findUnique: (a: unknown) => saleFindUnique(a) },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createSaleAction, confirmSalePaymentAction, cancelSaleAction } from "../actions";
import { InsufficientStockError, SaleRequestConflictError, SalesRuleError } from "@/lib/data/errors";
import { UnauthenticatedError } from "@/lib/auth/errors";
import { revalidatePath } from "next/cache";

const RID = "123e4567-e89b-42d3-a456-426614174000";
const input = (over: Record<string, unknown> = {}) => ({
  clientRequestId: RID,
  locationId: "B",
  channel: "store",
  paymentMethod: "cash",
  lines: [{ variantId: "v1", quantity: 1, unitPrice: 100 }],
  ...over,
});
const sale = (over: Record<string, unknown> = {}) => ({ id: "s1", locationId: "B", ...over });
const as = (role: string, locationId: string | null = null) =>
  getCurrentUser.mockResolvedValue({ id: "u1", role, locationId });

beforeEach(() => {
  vi.clearAllMocks();
  variantFindMany.mockResolvedValue([{ id: "v1", price: "100.00" }]);
  source.createSale.mockResolvedValue(sale());
  source.confirmPayment.mockResolvedValue(sale());
  source.cancelSale.mockResolvedValue(sale());
  saleFindUnique.mockResolvedValue({ locationId: "B" });
});

/** Error con la forma de PrismaClientKnownRequestError. */
const prismaError = (code: string) => Object.assign(new Error(`prisma ${code}`), { code });
const SESSION = {
  ok: false,
  code: "FORBIDDEN",
  message: "Tu sesión terminó. Vuelve a iniciar sesión.",
  reason: "session_expired",
};

describe("sesión", () => {
  it.each([
    ["createSaleAction", () => createSaleAction(input())],
    ["confirmSalePaymentAction", () => confirmSalePaymentAction("s1")],
    ["cancelSaleAction", () => cancelSaleAction("s1", "motivo", true)],
  ])("%s sin sesión o con sesión vencida: FORBIDDEN sin lanzar", async (_name, call) => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    await expect(call()).resolves.toEqual(SESSION);
    expect(source.createSale).not.toHaveBeenCalled();
    expect(source.confirmPayment).not.toHaveBeenCalled();
    expect(source.cancelSale).not.toHaveBeenCalled();
  });
  it("otro error al leer el usuario se propaga", async () => {
    getCurrentUser.mockRejectedValue(new Error("db caída"));
    await expect(createSaleAction(input())).rejects.toThrow("db caída");
  });
});

describe("createSaleAction", () => {
  it("collaborator en otra tienda: FORBIDDEN", async () => {
    as("collaborator", "A");
    const r = await createSaleAction(input());
    expect(r).toEqual({ ok: false, code: "FORBIDDEN", message: "Solo puedes vender en tu tienda." });
    expect(source.createSale).not.toHaveBeenCalled();
  });
  it("owner vende en B: ok y revalida", async () => {
    as("owner");
    const r = await createSaleAction(input());
    expect(r.ok).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/ventas");
  });
  it("entrada inválida: INVALID sin tocar la fuente", async () => {
    as("owner");
    const r = await createSaleAction({ nope: 1 });
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(source.createSale).not.toHaveBeenCalled();
  });
  it("InsufficientStockError: NO_STOCK con mensaje y la prenda", async () => {
    as("owner");
    source.createSale.mockRejectedValue(new InsufficientStockError("v1", 2, 5));
    const r = await createSaleAction(input());
    expect(r).toEqual({
      ok: false,
      code: "NO_STOCK",
      message: "Solo hay 2 de esta prenda en la tienda (pediste 5).",
      variantId: "v1",
    });
  });
  it("P2003 (tienda o prenda borrada): INVALID", async () => {
    as("owner");
    source.createSale.mockRejectedValue(prismaError("P2003"));
    expect(await createSaleAction(input())).toEqual({
      ok: false,
      code: "INVALID",
      message: "La tienda o la prenda ya no existe.",
    });
  });
  it("P2028 (transacción vencida): UNAVAILABLE con mensaje para reintentar", async () => {
    as("owner");
    source.createSale.mockRejectedValue(prismaError("P2028"));
    expect(await createSaleAction(input())).toEqual({
      ok: false,
      code: "UNAVAILABLE",
      message: "El servidor tardó en responder. Intenta cobrar de nuevo.",
    });
  });
  it("P2028 al confirmar y al anular usa el verbo de la acción", async () => {
    as("owner");
    source.confirmPayment.mockRejectedValue(prismaError("P2028"));
    source.cancelSale.mockRejectedValue(prismaError("P2028"));
    expect(await confirmSalePaymentAction("s1")).toMatchObject({
      code: "UNAVAILABLE",
      message: "El servidor tardó en responder. Intenta confirmar de nuevo.",
    });
    expect(await cancelSaleAction("s1", "motivo", true)).toMatchObject({
      code: "UNAVAILABLE",
      message: "El servidor tardó en responder. Intenta anular de nuevo.",
    });
  });
  it("otro error de Prisma se propaga", async () => {
    as("owner");
    source.createSale.mockRejectedValue(prismaError("P1001"));
    await expect(createSaleAction(input())).rejects.toThrow("prisma P1001");
  });
  it("collaborator con precio distinto: INVALID", async () => {
    as("collaborator", "B");
    const r = await createSaleAction(input({ lines: [{ variantId: "v1", quantity: 1, unitPrice: 90 }] }));
    expect(r).toEqual({
      ok: false,
      code: "INVALID",
      message: "Solo el dueño o el encargado pueden cambiar el precio.",
    });
    expect(source.createSale).not.toHaveBeenCalled();
  });
  it("collaborator con precio vigente: ok", async () => {
    as("collaborator", "B");
    expect((await createSaleAction(input())).ok).toBe(true);
  });
  it.each(["owner", "manager"])("%s puede cambiar el precio", async (role) => {
    as(role, "B");
    const r = await createSaleAction(input({ lines: [{ variantId: "v1", quantity: 1, unitPrice: 0 }] }));
    expect(r.ok).toBe(true);
  });
  it("reintento con el mismo id y otro carrito: INVALID con el folio y reason request_conflict", async () => {
    as("owner");
    source.createSale.mockRejectedValue(new SaleRequestConflictError(41));
    const r = await createSaleAction(input());
    expect(r).toEqual({
      ok: false,
      code: "INVALID",
      message: "La venta #41 ya se registró con otros datos. Revisa el carrito y vuelve a cobrar.",
      reason: "request_conflict",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("confirmSalePaymentAction", () => {
  it("collaborator: FORBIDDEN", async () => {
    as("collaborator", "A");
    expect(await confirmSalePaymentAction("s1")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(source.confirmPayment).not.toHaveBeenCalled();
  });
  it("manager: ok", async () => {
    as("manager");
    expect((await confirmSalePaymentAction("s1", "ref")).ok).toBe(true);
    expect(source.confirmPayment).toHaveBeenCalledWith("s1", "u1", "ref");
  });
  it("manager con tienda confirma una venta de su tienda", async () => {
    as("manager", "B");
    expect((await confirmSalePaymentAction("s1")).ok).toBe(true);
    expect(saleFindUnique).toHaveBeenCalledWith({ where: { id: "s1" }, select: { locationId: true } });
  });
  it("manager con tienda no confirma ventas de otra tienda: FORBIDDEN", async () => {
    as("manager", "A");
    expect(await confirmSalePaymentAction("s1")).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "Solo puedes confirmar pagos de tu tienda.",
    });
    expect(source.confirmPayment).not.toHaveBeenCalled();
  });
  it("manager con tienda y venta inexistente: NOT_FOUND", async () => {
    as("manager", "A");
    saleFindUnique.mockResolvedValue(null);
    expect(await confirmSalePaymentAction("nope")).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(source.confirmPayment).not.toHaveBeenCalled();
  });
  it.each([
    ["manager sin tienda", "manager", null],
    ["owner", "owner", null],
  ])("%s confirma ventas de cualquier tienda sin consultar la tienda", async (_l, role, loc) => {
    as(role, loc);
    expect((await confirmSalePaymentAction("s1")).ok).toBe(true);
    expect(saleFindUnique).not.toHaveBeenCalled();
  });
  it("venta inexistente: NOT_FOUND", async () => {
    as("owner");
    source.confirmPayment.mockRejectedValue(new SalesRuleError("La venta no existe."));
    expect(await confirmSalePaymentAction("x")).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
  it("estado inválido: INVALID", async () => {
    as("owner");
    source.confirmPayment.mockRejectedValue(new SalesRuleError("Solo se confirma el pago de una venta pendiente."));
    expect(await confirmSalePaymentAction("x")).toMatchObject({ ok: false, code: "INVALID" });
  });
});

describe("cancelSaleAction", () => {
  it("manager: FORBIDDEN", async () => {
    as("manager");
    expect(await cancelSaleAction("s1", "motivo", true)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
  it("owner con motivo vacío: INVALID", async () => {
    as("owner");
    expect(await cancelSaleAction("s1", "  ", true)).toMatchObject({ ok: false, code: "INVALID" });
    expect(source.cancelSale).not.toHaveBeenCalled();
  });
  it("motivo que no es texto: INVALID", async () => {
    as("owner");
    expect(await cancelSaleAction("s1", 42 as unknown as string, true)).toMatchObject({ ok: false, code: "INVALID" });
    expect(source.cancelSale).not.toHaveBeenCalled();
  });
  it("motivo de más de 200 caracteres (ya recortado): INVALID", async () => {
    as("owner");
    expect(await cancelSaleAction("s1", "x".repeat(201), true)).toEqual({
      ok: false,
      code: "INVALID",
      message: "El motivo no puede pasar de 200 caracteres.",
    });
    expect((await cancelSaleAction("s1", `  ${"x".repeat(200)}  `, true)).ok).toBe(true);
    expect(source.cancelSale).toHaveBeenCalledTimes(1);
    expect(source.cancelSale).toHaveBeenCalledWith("s1", "u1", "x".repeat(200), true);
  });
  it.each([undefined, null, "true", 1])("itemsReturned no booleano (%s): INVALID", async (value) => {
    as("owner");
    expect(await cancelSaleAction("s1", "motivo", value as unknown as boolean)).toEqual({
      ok: false,
      code: "INVALID",
      message: "Indica si la prenda regresó a la tienda.",
    });
    expect(source.cancelSale).not.toHaveBeenCalled();
  });
  it("owner con motivo: ok", async () => {
    as("owner");
    expect((await cancelSaleAction("s1", "  error  ", false)).ok).toBe(true);
    expect(source.cancelSale).toHaveBeenCalledWith("s1", "u1", "error", false);
  });
  it("token owner pero la base dice collaborator: FORBIDDEN", async () => {
    // getCurrentUser relee la base; aquí la base devuelve collaborator.
    as("collaborator", "A");
    expect(await cancelSaleAction("s1", "motivo", true)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});

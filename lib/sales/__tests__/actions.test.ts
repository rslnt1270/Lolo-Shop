import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const source = { createSale: vi.fn(), confirmPayment: vi.fn(), cancelSale: vi.fn() };
const variantFindMany = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/data/get-sales-source", () => ({ getSalesSource: () => source }));
vi.mock("@/lib/prisma", () => ({ default: { variant: { findMany: (a: unknown) => variantFindMany(a) } } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createSaleAction, confirmSalePaymentAction, cancelSaleAction } from "../actions";
import { InsufficientStockError, SalesRuleError } from "@/lib/data/errors";
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
  it("InsufficientStockError: NO_STOCK con mensaje", async () => {
    as("owner");
    source.createSale.mockRejectedValue(new InsufficientStockError("v1", 2, 5));
    const r = await createSaleAction(input());
    expect(r).toEqual({
      ok: false,
      code: "NO_STOCK",
      message: "Solo hay 2 de esta prenda en la tienda (pediste 5).",
    });
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
  it("reintento que devuelve venta de otra tienda: INVALID", async () => {
    as("owner");
    source.createSale.mockResolvedValue(sale({ locationId: "C" }));
    const r = await createSaleAction(input());
    expect(r).toEqual({
      ok: false,
      code: "INVALID",
      message: "Esta venta ya se registró con otros datos. Recarga la pantalla.",
    });
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
  it("owner con motivo: ok", async () => {
    as("owner");
    expect((await cancelSaleAction("s1", "error", false)).ok).toBe(true);
    expect(source.cancelSale).toHaveBeenCalledWith("s1", "u1", "error", false);
  });
  it("token owner pero la base dice collaborator: FORBIDDEN", async () => {
    // getCurrentUser relee la base; aquí la base devuelve collaborator.
    as("collaborator", "A");
    expect(await cancelSaleAction("s1", "motivo", true)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});

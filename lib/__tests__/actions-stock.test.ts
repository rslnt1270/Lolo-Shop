import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const revalidatePath = vi.fn();
let source: import("@/lib/data/fixture-source").FixtureDataSource;

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("@/lib/auth/password", () => ({ changePassword: vi.fn() }));
vi.mock("@/lib/data/get-source", () => ({ getDataSource: () => source }));

import { recordStockMovementAction } from "../actions";
import { FixtureDataSource } from "../data/fixture-source";
import { InsufficientStockError } from "../data/errors";
import { UnauthenticatedError } from "../auth/errors";

const user = (role: string, locationId: string | null) => ({ id: "u1", role, locationId });
const rid = () => crypto.randomUUID();

async function levelOf(variantId: string, locationId: string) {
  const m = await source.getProductByVariantId(variantId);
  return m?.variant.inventory.find((l) => l.locationId === locationId)?.available;
}

let variantId: string;
let locA: string;
let locB: string;

beforeEach(async () => {
  source = new FixtureDataSource();
  revalidatePath.mockReset();
  getCurrentUser.mockReset().mockResolvedValue(user("owner", null));
  const products = await source.getProducts();
  variantId = products[0].variants[0].id;
  const locs = await source.getLocations();
  locA = locs[0].id;
  locB = locs[1].id;
});

describe("recordStockMovementAction", () => {
  it("colaborador con damage o adjustment -> FORBIDDEN", async () => {
    getCurrentUser.mockResolvedValue(user("collaborator", locA));
    const d = await recordStockMovementAction({ variantId, locationId: locA, kind: "damage", quantity: 1, reason: "Manchada", requestId: rid() });
    const a = await recordStockMovementAction({ variantId, locationId: locA, kind: "adjustment", direction: "in", quantity: 1, reason: "Conteo", requestId: rid() });
    expect(d).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(a).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("restock del colaborador de L en otra tienda -> FORBIDDEN", async () => {
    getCurrentUser.mockResolvedValue(user("collaborator", locA));
    const r = await recordStockMovementAction({ variantId, locationId: locB, kind: "restock", quantity: 1, requestId: rid() });
    expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("manager con tienda operando en otra -> FORBIDDEN", async () => {
    getCurrentUser.mockResolvedValue(user("manager", locA));
    const r = await recordStockMovementAction({ variantId, locationId: locB, kind: "damage", quantity: 1, reason: "Manchada", requestId: rid() });
    expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("sesión vencida -> SESSION", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    const r = await recordStockMovementAction({ variantId, locationId: locA, kind: "restock", quantity: 1, requestId: rid() });
    expect(r).toMatchObject({ ok: false, code: "SESSION", message: "Tu sesión terminó. Vuelve a iniciar sesión." });
  });

  it.each([0, 201, 1.5, 2 ** 31])("cantidad %s -> INVALID", async (quantity) => {
    const r = await recordStockMovementAction({ variantId, locationId: locA, kind: "restock", quantity, requestId: rid() });
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("motivo con un teléfono -> INVALID", async () => {
    const r = await recordStockMovementAction({ variantId, locationId: locA, kind: "damage", quantity: 1, reason: `llamó ${"0".repeat(10)}`, requestId: rid() });
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("variante inexistente -> NOT_FOUND", async () => {
    const r = await recordStockMovementAction({ variantId: "nope", locationId: locA, kind: "restock", quantity: 1, requestId: rid() });
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("mismo requestId dos veces: la segunda replayed y sin duplicar", async () => {
    const before = (await levelOf(variantId, locA)) ?? 0;
    const input = { variantId, locationId: locA, kind: "restock" as const, quantity: 2, requestId: rid() };
    const first = await recordStockMovementAction(input);
    const second = await recordStockMovementAction(input);
    expect(first).toEqual({ ok: true, available: before + 2, replayed: false });
    expect(second).toEqual({ ok: true, available: before + 2, replayed: true });
    expect(await levelOf(variantId, locA)).toBe(before + 2);
  });

  it("InsufficientStockError -> INSUFFICIENT con available y mensaje", async () => {
    vi.spyOn(source, "recordStockMovement").mockRejectedValue(new InsufficientStockError(variantId, 1, 2));
    const r = await recordStockMovementAction({ variantId, locationId: locA, kind: "damage", quantity: 2, reason: "Manchada", requestId: rid() });
    expect(r).toEqual({ ok: false, code: "INSUFFICIENT", available: 1, message: "Solo hay 1 en esta tienda." });
  });

  it("merma sobre stock insuficiente en el Fixture -> INSUFFICIENT y sin cambio", async () => {
    const before = (await levelOf(variantId, locA)) ?? 0;
    const r = await recordStockMovementAction({ variantId, locationId: locA, kind: "damage", quantity: 200, reason: "Manchada", requestId: rid() });
    expect(r).toMatchObject({ ok: false, code: "INSUFFICIENT", available: before });
    expect(await levelOf(variantId, locA)).toBe(before);
  });

  it("revalida /catalogo y /productos al éxito y registra el Movement con userId y tipo", async () => {
    await recordStockMovementAction({ variantId, locationId: locA, kind: "damage", quantity: 1, reason: "Manchada", requestId: rid() });
    expect(revalidatePath).toHaveBeenCalledWith("/catalogo");
    expect(revalidatePath).toHaveBeenCalledWith("/productos");
    expect(source.movements.at(-1)).toMatchObject({ type: "DAMAGE", delta: -1, notes: "Manchada", userId: "u1", variantId, locationId: locA });
  });
});

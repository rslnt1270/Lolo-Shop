import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const revalidatePath = vi.fn();
let source: import("@/lib/data/fixture-source").FixtureDataSource;

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("@/lib/auth/password", () => ({ changePassword: vi.fn() }));
vi.mock("@/lib/data/get-source", () => ({ getDataSource: () => source }));

import { transferStockAction } from "../actions";
import { FixtureDataSource } from "../data/fixture-source";
import { DB_TIMEOUT_TEXT, InsufficientStockError, isDeadlock } from "../data/errors";
import { UnauthenticatedError } from "../auth/errors";

const user = (role: string, locationId: string | null) => ({ id: "u1", role, locationId });
const rid = () => crypto.randomUUID();

let variantId: string;
let alva: string;
let lomas: string;

async function levelOf(locationId: string) {
  const m = await source.getProductByVariantId(variantId);
  return m?.variant.inventory.find((l) => l.locationId === locationId)?.available ?? 0;
}

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  source = new FixtureDataSource();
  revalidatePath.mockReset();
  alva = (await source.createLocation({ name: "Club Alva" })).id;
  lomas = (await source.createLocation({ name: "Lomas" })).id;
  getCurrentUser.mockReset().mockResolvedValue(user("collaborator", alva));
  variantId = (await source.getProducts())[0].variants[0].id;
  // 3 en Club Alva, 0 en Lomas.
  await source.recordStockMovement({ variantId, locationId: alva, type: "RESTOCK", delta: 3, notes: null, requestId: rid(), userId: "u0" });
});

const base = () => ({ variantId, fromLocationId: alva, toLocationId: lomas, quantity: 2, requestId: rid() });

describe("transferStockAction", () => {
  it("sin sesión -> SESSION", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    const r = await transferStockAction(base());
    expect(r).toEqual({ ok: false, code: "SESSION", message: "Tu sesión terminó. Vuelve a iniciar sesión." });
  });

  it("colaborador traspasa de A a B -> ok con el texto exacto, mueve piezas y revalida", async () => {
    const r = await transferStockAction({ ...base(), reason: "Pedido de clienta" });
    expect(r).toEqual({
      ok: true,
      replayed: false,
      fromAvailable: 1,
      toAvailable: 2,
      message: "Traspasadas 2 piezas de Club Alva a Lomas. Ahora: Club Alva 1 · Lomas 2.",
    });
    expect(await levelOf(alva)).toBe(1);
    expect(await levelOf(lomas)).toBe(2);
    expect(source.movements.slice(-2)).toMatchObject([
      { locationId: alva, delta: -2, notes: "A Lomas: Pedido de clienta", userId: "u1", type: "TRANSFER" },
      { locationId: lomas, delta: 2, notes: "De Club Alva: Pedido de clienta", userId: "u1", type: "TRANSFER" },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/catalogo");
    expect(revalidatePath).toHaveBeenCalledWith("/productos");
  });

  it("colaborador asignado a otra tienda también puede traspasar (desde B hacia A)", async () => {
    getCurrentUser.mockResolvedValue(user("collaborator", lomas));
    const r = await transferStockAction({ ...base(), quantity: 1 });
    expect(r).toMatchObject({ ok: true, fromAvailable: 2, toAvailable: 1 });
  });

  it("singular: 'Traspasada 1 pieza de …'", async () => {
    const r = await transferStockAction({ ...base(), quantity: 1 });
    expect(r).toMatchObject({ ok: true, message: "Traspasada 1 pieza de Club Alva a Lomas. Ahora: Club Alva 2 · Lomas 1." });
  });

  it("mismo requestId dos veces: la segunda replayed, mismo formato con existencias actuales y sin mover de nuevo", async () => {
    const input = base();
    const first = await transferStockAction(input);
    const second = await transferStockAction(input);
    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(second).toEqual({
      ok: true,
      replayed: true,
      fromAvailable: 1,
      toAvailable: 2,
      message: "Traspasadas 2 piezas de Club Alva a Lomas. Ahora: Club Alva 1 · Lomas 2.",
    });
    expect(await levelOf(alva)).toBe(1);
  });

  it("mismo requestId con otras piezas -> INVALID 'Esta operación ya se registró con otros datos…' sin mover de nuevo", async () => {
    const requestId = rid();
    expect((await transferStockAction({ ...base(), requestId })).ok).toBe(true);
    const r = await transferStockAction({ ...base(), quantity: 1, requestId });
    expect(r).toEqual({
      ok: false,
      code: "INVALID",
      message: "Esta operación ya se registró con otros datos. Vuelve a intentarlo.",
    });
    expect(await levelOf(alva)).toBe(1);
    expect(await levelOf(lomas)).toBe(2);
  });

  it("origen igual a destino -> INVALID 'Elige otra tienda de destino.' y no escribe", async () => {
    const spy = vi.spyOn(source, "transferStock");
    const r = await transferStockAction({ ...base(), toLocationId: alva });
    expect(r).toEqual({ ok: false, code: "INVALID", message: "Elige otra tienda de destino." });
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([0, 201, 1.5])("cantidad %s -> INVALID", async (quantity) => {
    const r = await transferStockAction({ ...base(), quantity });
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("origen vacío -> INVALID sin tocar la base", async () => {
    const spy = vi.spyOn(source, "transferStock");
    const r = await transferStockAction({ ...base(), fromLocationId: "" });
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("faltante -> INSUFFICIENT 'Solo hay {n} en {origen}.' y no mueve nada", async () => {
    const r = await transferStockAction({ ...base(), quantity: 5 });
    expect(r).toEqual({ ok: false, code: "INSUFFICIENT", available: 3, message: "Solo hay 3 en Club Alva." });
    expect(await levelOf(alva)).toBe(3);
    expect(await levelOf(lomas)).toBe(0);
  });

  it("faltante y la consulta de tiendas falla -> texto genérico de origen, sin lanzar", async () => {
    vi.spyOn(source, "transferStock").mockRejectedValue(new InsufficientStockError(variantId, 0, 2));
    vi.spyOn(source, "getLocations").mockRejectedValue(new Error("db down"));
    const r = await transferStockAction(base());
    expect(r).toEqual({ ok: false, code: "INSUFFICIENT", available: 0, message: "Solo hay 0 en la tienda de origen." });
  });

  it("tienda inexistente -> NOT_FOUND", async () => {
    const r = await transferStockAction({ ...base(), toLocationId: "loc-nope" });
    expect(r).toEqual({ ok: false, code: "NOT_FOUND", message: "No encontramos la prenda o la tienda." });
  });

  it("prenda inexistente -> NOT_FOUND", async () => {
    const r = await transferStockAction({ ...base(), variantId: "nope" });
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("transacción vencida (P2028) -> ERROR con DB_TIMEOUT_TEXT", async () => {
    vi.spyOn(source, "transferStock").mockRejectedValue(Object.assign(new Error("timeout"), { code: "P2028" }));
    expect(await transferStockAction(base())).toEqual({ ok: false, code: "ERROR", message: DB_TIMEOUT_TEXT });
  });

  it("interbloqueo (P2034) -> ERROR con DB_TIMEOUT_TEXT para reintentar", async () => {
    vi.spyOn(source, "transferStock").mockRejectedValue(
      Object.assign(new Error("Transaction failed due to a write conflict or a deadlock. Please retry your transaction"), { code: "P2034" }),
    );
    expect(await transferStockAction(base())).toEqual({ ok: false, code: "ERROR", message: DB_TIMEOUT_TEXT });
  });

  it("interbloqueo reportado como SQLSTATE 40P01 -> ERROR con DB_TIMEOUT_TEXT", async () => {
    vi.spyOn(source, "transferStock").mockRejectedValue(
      Object.assign(new Error("Raw query failed. Code: `40P01`. Message: `deadlock detected`"), { code: "P2010", meta: { code: "40P01" } }),
    );
    expect(await transferStockAction(base())).toEqual({ ok: false, code: "ERROR", message: DB_TIMEOUT_TEXT });
  });

  it("error inesperado -> ERROR sin lanzar", async () => {
    vi.spyOn(source, "transferStock").mockRejectedValue(new Error("boom"));
    expect(await transferStockAction(base())).toEqual({ ok: false, code: "ERROR", message: "No se pudo registrar. Intenta de nuevo." });
  });

  it("entrada que no es objeto -> INVALID sin lanzar", async () => {
    const r = await transferStockAction(null as never);
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
  });
});

describe("isDeadlock", () => {
  it("reconoce P2034 y SQLSTATE 40P01 (en meta o en el mensaje); nada más", () => {
    expect(isDeadlock({ code: "P2034" })).toBe(true);
    expect(isDeadlock({ code: "P2010", meta: { code: "40P01" } })).toBe(true);
    expect(isDeadlock(new Error("db error: ERROR: deadlock detected (SQLSTATE 40P01)"))).toBe(true);
    expect(isDeadlock({ code: "P2028" })).toBe(false);
    expect(isDeadlock(new Error("boom"))).toBe(false);
    expect(isDeadlock(undefined)).toBe(false);
  });
});

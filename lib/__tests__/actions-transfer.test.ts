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
import { UnauthenticatedError } from "../auth/errors";

const user = (role: string, locationId: string | null) => ({ id: "u1", role, locationId });
const rid = () => crypto.randomUUID();

let variantId: string;
let lomas: string;
let club: string;
let almacen: string;

async function level(locationId: string) {
  const m = await source.getProductByVariantId(variantId);
  return m?.variant.inventory.find((l) => l.locationId === locationId)?.available;
}

beforeEach(async () => {
  source = new FixtureDataSource();
  revalidatePath.mockReset();
  getCurrentUser.mockReset().mockResolvedValue(user("owner", null));
  variantId = (await source.getProducts())[0].variants[0].id;
  lomas = (await source.getLocations())[0].id;
  club = (await source.createLocation({ name: "ClubAlva" })).id;
  almacen = (await source.createLocation({ name: "Almacén", type: "warehouse" })).id;
});

const input = (from: string, to: string, over: Record<string, unknown> = {}) => ({
  variantId,
  fromLocationId: from,
  toLocationId: to,
  quantity: 2,
  requestId: rid(),
  ...over,
});

describe("transferStockAction", () => {
  it("owner traspasa y devuelve el mensaje con nombres de tienda", async () => {
    const r = await transferStockAction(input(lomas, club));
    expect(r).toEqual({ ok: true, available: 1, replayed: false, message: "Se movieron 2 de Tienda 1 a ClubAlva." });
    expect(await level(club)).toBe(2);
  });

  it("origen = destino -> INVALID", async () => {
    expect(await transferStockAction(input(lomas, lomas))).toMatchObject({ ok: false, code: "INVALID" });
  });

  it.each([0, 201, 1.5])("cantidad %s -> INVALID", async (quantity) => {
    expect(await transferStockAction(input(lomas, club, { quantity }))).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("nota con 7 dígitos -> INVALID", async () => {
    expect(await transferStockAction(input(lomas, club, { note: "llamar 5512345678" }))).toMatchObject({
      ok: false,
      code: "INVALID",
    });
  });

  it("manager de Lomas traspasando de ClubAlva al almacén -> FORBIDDEN", async () => {
    getCurrentUser.mockResolvedValue(user("manager", lomas));
    expect(await transferStockAction(input(club, almacen))).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await level(almacen)).toBeUndefined();
  });

  it("manager de Lomas desde o hacia su tienda -> ok", async () => {
    getCurrentUser.mockResolvedValue(user("manager", lomas));
    expect(await transferStockAction(input(lomas, club, { quantity: 1 }))).toMatchObject({ ok: true });
    expect(await transferStockAction(input(club, lomas, { quantity: 1 }))).toMatchObject({ ok: true });
  });

  it("colaborador -> FORBIDDEN", async () => {
    getCurrentUser.mockResolvedValue(user("collaborator", lomas));
    expect(await transferStockAction(input(lomas, club))).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("sesión vencida -> SESSION", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    expect(await transferStockAction(input(lomas, club))).toMatchObject({ ok: false, code: "SESSION" });
  });

  it("sin piezas suficientes -> INSUFFICIENT con el stock del origen", async () => {
    expect(await transferStockAction(input(lomas, club, { quantity: 9 }))).toMatchObject({
      ok: false,
      code: "INSUFFICIENT",
      available: 3,
      message: "Solo hay 3 en esta tienda.",
    });
  });

  it("mismo requestId -> replayed", async () => {
    const same = input(lomas, club);
    await transferStockAction(same);
    expect(await transferStockAction(same)).toMatchObject({ ok: true, replayed: true });
    expect(await level(club)).toBe(2);
  });
});

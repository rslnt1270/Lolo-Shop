import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDB } from "idb";
import { OFFLINE_DB_NAME, type QueuedSale } from "../db";
import type { OfflineSaleResult } from "@/lib/sales/offline-actions";
import type { SaleRecord } from "@/lib/data/sales-source";

// Permite simular que una marca de estado no se guarda (cuota, almacenamiento roto).
const marks = vi.hoisted(() => ({ fail: null as null | ((id: string, state: unknown) => boolean) }));
vi.mock("../queue-store", async (importOriginal) => {
  const real = await importOriginal<typeof import("../queue-store")>();
  return {
    ...real,
    updateQueued: async (id: string, patch: Parameters<typeof real.updateQueued>[1]) =>
      marks.fail?.(id, patch.state) ? false : real.updateQueued(id, patch),
  };
});

import { enqueueSale, listQueue, updateQueued } from "../queue-store";
import { SYNC_LOCK_NAME, localFolio, nextDelayMs, runSync } from "../sync";

const ID = (n: number) => `${String(n).repeat(8)}-0000-4000-8000-000000000000`;
const NOW = new Date("2026-11-12T18:00:00.000Z");

const sale = (n: number, over: Partial<QueuedSale> = {}) => ({
  clientRequestId: ID(n),
  userId: "u1",
  locationId: "loc-1",
  channel: "store",
  paymentMethod: "cash",
  lines: [{ variantId: "v1", quantity: 2, unitPrice: 450, sku: "S1", productTitle: "Playera", variantTitle: "M" }],
  total: 900,
  soldAt: `2026-11-12T1${n}:00:00.000Z`,
  snapshotAt: "2026-11-12T09:00:00.000Z",
  snapshotToken: "tok.sig",
  ...over,
});

const okResult = (number: number, review = false): OfflineSaleResult => ({
  ok: true, review, sale: { number } as SaleRecord,
});
const failResult = (code: string, message: string, reason?: string): OfflineSaleResult =>
  ({ ok: false, code, message, ...(reason ? { reason } : {}) }) as OfflineSaleResult;

const ids = (calls: unknown[][]) => calls.map(([input]) => (input as { clientRequestId: string }).clientRequestId);
const byId = async () => Object.fromEntries((await listQueue()).map((s) => [s.clientRequestId, s]));
const deps = (submit: (input: unknown) => Promise<OfflineSaleResult>, userId = "u1") =>
  ({ userId, submit, now: () => NOW });

beforeEach(async () => {
  await deleteDB(OFFLINE_DB_NAME);
  marks.fail = null;
  Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
});

afterEach(() => {
  Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
});

describe("runSync", () => {
  it("envía en orden de soldAt, una a la vez", async () => {
    await enqueueSale(sale(3));
    await enqueueSale(sale(1));
    await enqueueSale(sale(2));
    let inFlight = 0;
    let maxInFlight = 0;
    let n = 100;
    const submit = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return okResult(n++);
    });
    const summary = await runSync(deps(submit));
    expect(ids(submit.mock.calls)).toEqual([ID(1), ID(2), ID(3)]);
    expect(maxInFlight).toBe(1);
    expect(summary.sent.map((s) => s.number)).toEqual([100, 101, 102]);
    expect(summary.stoppedBy).toBeNull();
  });

  it("cada envío lleva el clientRequestId, tienda, canal, método y líneas del registro, más soldAt y snapshotAt", async () => {
    await enqueueSale(sale(1, { customerAlias: "Ana", channel: "whatsapp", paymentMethod: "card" }));
    await enqueueSale(sale(2));
    const submit = vi.fn(async (_input: unknown) => okResult(1));
    await runSync(deps(submit));
    expect(submit.mock.calls[0][0]).toEqual({
      clientRequestId: ID(1),
      locationId: "loc-1",
      channel: "whatsapp",
      paymentMethod: "card",
      customerAlias: "Ana",
      lines: [{ variantId: "v1", quantity: 2, unitPrice: 450 }],
      soldAt: "2026-11-12T11:00:00.000Z",
      snapshotAt: "2026-11-12T09:00:00.000Z",
      snapshotToken: "tok.sig",
    });
    expect("customerAlias" in (submit.mock.calls[1][0] as object)).toBe(false);
  });

  it("sending huérfano se reenvía con el mismo clientRequestId", async () => {
    await enqueueSale(sale(1));
    await updateQueued(ID(1), { state: "sending" }); // el teléfono se cerró a medio envío
    const submit = vi.fn(async () => okResult(120)); // el servidor responde replay
    const summary = await runSync(deps(submit));
    expect(ids(submit.mock.calls)).toEqual([ID(1)]);
    expect((await byId())[ID(1)]).toMatchObject({ state: "synced", saleNumber: 120, clientRequestId: ID(1) });
    expect(summary.sent).toEqual([{ folio: localFolio(ID(1)), number: 120, review: false }]);
  });

  it("marca sending antes de llamar al servidor", async () => {
    await enqueueSale(sale(1));
    let seen: string | undefined;
    await runSync(deps(async () => {
      seen = (await byId())[ID(1)].state;
      return okResult(1);
    }));
    expect(seen).toBe("sending");
  });

  it("excepción de red detiene la cola, deja pending y attempts+1", async () => {
    await enqueueSale(sale(1));
    await enqueueSale(sale(2));
    const submit = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    const summary = await runSync(deps(submit));
    expect(submit).toHaveBeenCalledTimes(1);
    const q = await byId();
    expect(q[ID(1)]).toMatchObject({ state: "pending", attempts: 1 });
    expect(q[ID(2)]).toMatchObject({ state: "pending", attempts: 0 });
    expect(summary).toEqual({ sent: [], failed: [], stoppedBy: "network" });
  });

  it("UNAVAILABLE detiene la cola, deja pending y attempts+1", async () => {
    await enqueueSale(sale(1));
    await enqueueSale(sale(2));
    const submit = vi.fn(async () => failResult("UNAVAILABLE", "El servidor tardó en responder."));
    const summary = await runSync(deps(submit));
    expect(submit).toHaveBeenCalledTimes(1);
    expect((await byId())[ID(1)]).toMatchObject({ state: "pending", attempts: 1 });
    expect(summary.stoppedBy).toBe("network");
  });

  it("respuesta sin forma se trata como falla de red y no se pierde", async () => {
    await enqueueSale(sale(1));
    const summary = await runSync(deps(async () => undefined as never));
    expect((await byId())[ID(1)]).toMatchObject({ state: "pending", attempts: 1 });
    expect(summary.stoppedBy).toBe("network");
  });

  it("ok sin número de venta no se marca synced y queda para reenviar", async () => {
    await enqueueSale(sale(1));
    const summary = await runSync(deps(async () => ({ ok: true, review: false }) as never));
    expect((await byId())[ID(1)]).toMatchObject({ state: "pending", attempts: 1 });
    expect(summary).toEqual({ sent: [], failed: [], stoppedBy: "network" });
  });

  it("session_expired detiene la cola y deja pending", async () => {
    await enqueueSale(sale(1));
    await enqueueSale(sale(2));
    const submit = vi.fn(async () =>
      failResult("FORBIDDEN", "Tu sesión terminó. Vuelve a iniciar sesión.", "session_expired"));
    const summary = await runSync(deps(submit));
    expect(submit).toHaveBeenCalledTimes(1);
    const q = await byId();
    expect(q[ID(1)].state).toBe("pending");
    expect(q[ID(1)].lastError).toBeUndefined();
    expect(q[ID(2)].state).toBe("pending");
    expect(summary).toEqual({ sent: [], failed: [], stoppedBy: "session_expired" });
  });

  it("INVALID deja needs_attention y sigue con la siguiente", async () => {
    await enqueueSale(sale(1));
    await enqueueSale(sale(2));
    const submit = vi.fn()
      .mockResolvedValueOnce(failResult("INVALID", "Elige un canal válido."))
      .mockResolvedValueOnce(okResult(121));
    const summary = await runSync(deps(submit));
    expect(submit).toHaveBeenCalledTimes(2);
    const q = await byId();
    expect(q[ID(1)]).toMatchObject({ state: "needs_attention", lastError: "Elige un canal válido.", attempts: 1 });
    expect(q[ID(2)]).toMatchObject({ state: "synced", saleNumber: 121 });
    expect(summary.failed).toEqual([{ folio: localFolio(ID(1)), message: "Elige un canal válido." }]);
    expect(summary.sent.map((s) => s.number)).toEqual([121]);
    expect(summary.stoppedBy).toBeNull();
  });

  it.each([
    ["FORBIDDEN", "Solo puedes vender en tu tienda.", undefined],
    ["NOT_FOUND", "La prenda no existe.", undefined],
    ["INVALID", "La venta #9 ya se registró con otros datos.", "request_conflict"],
  ])("%s (%s) deja needs_attention con el mensaje del servidor y nunca la borra", async (code, message, reason) => {
    await enqueueSale(sale(1));
    await runSync(deps(async () => failResult(code, message, reason)));
    expect((await byId())[ID(1)]).toMatchObject({ state: "needs_attention", lastError: message });
  });

  it("needs_attention y synced no se vuelven a enviar", async () => {
    await enqueueSale(sale(1));
    await enqueueSale(sale(2));
    await updateQueued(ID(1), { state: "needs_attention", lastError: "x" });
    await updateQueued(ID(2), { state: "synced", saleNumber: 5 });
    const submit = vi.fn(async () => okResult(1));
    await runSync(deps(submit));
    expect(submit).not.toHaveBeenCalled();
  });

  it("ok guarda saleNumber y review", async () => {
    await enqueueSale(sale(1));
    await updateQueued(ID(1), { lastError: "antes" });
    const summary = await runSync(deps(async () => okResult(130, true)));
    expect((await byId())[ID(1)]).toMatchObject({
      state: "synced", saleNumber: 130, review: true, syncedAt: NOW.toISOString(),
    });
    expect((await byId())[ID(1)].lastError).toBeUndefined();
    expect(summary.sent).toEqual([{ folio: localFolio(ID(1)), number: 130, review: true }]);
  });

  it("registros de otro userId no se envían", async () => {
    await enqueueSale(sale(1, { userId: "u2" }));
    await enqueueSale(sale(2));
    const submit = vi.fn(async () => okResult(1));
    await runSync(deps(submit));
    expect(ids(submit.mock.calls)).toEqual([ID(2)]);
    expect((await byId())[ID(1)]).toMatchObject({ state: "pending", attempts: 0 });
  });

  it("una venta encolada durante el envío sale en la misma vuelta", async () => {
    await enqueueSale(sale(1));
    const submit = vi.fn(async (input: unknown) => {
      if ((input as { clientRequestId: string }).clientRequestId === ID(1)) await enqueueSale(sale(2));
      return okResult(1);
    });
    await runSync(deps(submit));
    expect(ids(submit.mock.calls)).toEqual([ID(1), ID(2)]);
  });

  it("si no se puede marcar sending no llama al servidor y la venta sigue pending", async () => {
    await enqueueSale(sale(1));
    marks.fail = (_id, state) => state === "sending";
    const submit = vi.fn(async () => okResult(1));
    const summary = await runSync(deps(submit));
    expect(submit).not.toHaveBeenCalled();
    expect((await byId())[ID(1)].state).toBe("pending");
    expect(summary.stoppedBy).toBe("network");
  });

  it("si no se puede marcar synced no la cuenta como enviada y la reenvía después con el mismo id", async () => {
    await enqueueSale(sale(1));
    await enqueueSale(sale(2));
    marks.fail = (_id, state) => state === "synced";
    const submit = vi.fn(async () => okResult(120));
    const first = await runSync(deps(submit));
    expect(first.sent).toEqual([]);
    expect(first.stoppedBy).toBe("network");
    expect(ids(submit.mock.calls)).toEqual([ID(1)]);
    expect(["pending", "sending"]).toContain((await byId())[ID(1)].state);
    marks.fail = null;
    const second = await runSync(deps(submit));
    expect(ids(submit.mock.calls)).toEqual([ID(1), ID(1), ID(2)]);
    expect(second.sent.map((s) => s.folio)).toEqual([localFolio(ID(1)), localFolio(ID(2))]);
  });

  it("si no se puede marcar needs_attention la venta no se pierde y se detiene", async () => {
    await enqueueSale(sale(1));
    marks.fail = (_id, state) => state === "needs_attention";
    const summary = await runSync(deps(async () => failResult("INVALID", "x")));
    expect(summary.failed).toEqual([]);
    expect(summary.stoppedBy).toBe("network");
    expect(await listQueue()).toHaveLength(1);
  });

  describe("exclusión", () => {
    const slowOk = () => {
      let n = 1;
      return vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 5));
        return okResult(n++);
      });
    };

    it("dos runSync simultáneos no envían el mismo registro dos veces (sin navigator.locks)", async () => {
      await enqueueSale(sale(1));
      await enqueueSale(sale(2));
      const submit = slowOk();
      await Promise.all([runSync(deps(submit)), runSync(deps(submit))]);
      expect(ids(submit.mock.calls)).toEqual([ID(1), ID(2)]);
    });

    it("dos runSync simultáneos no envían el mismo registro dos veces (con navigator.locks simulado)", async () => {
      let held = false;
      const request = vi.fn(async (_name: string, _opts: unknown, cb: (lock: unknown) => Promise<unknown>) => {
        if (held) return cb(null);
        held = true;
        try { return await cb({ name: _name }); } finally { held = false; }
      });
      Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
      await enqueueSale(sale(1));
      await enqueueSale(sale(2));
      const submit = slowOk();
      await Promise.all([runSync(deps(submit)), runSync(deps(submit))]);
      expect(ids(submit.mock.calls)).toEqual([ID(1), ID(2)]);
      expect(request).toHaveBeenCalledWith(SYNC_LOCK_NAME, { ifAvailable: true }, expect.any(Function));
      expect(SYNC_LOCK_NAME).toBe("loloshop-offline-sync");
    });

    it("si otra pestaña tiene el candado no envía nada", async () => {
      const request = vi.fn(async (_n: string, _o: unknown, cb: (lock: unknown) => Promise<unknown>) => cb(null));
      Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
      await enqueueSale(sale(1));
      const submit = vi.fn(async () => okResult(1));
      const summary = await runSync(deps(submit));
      expect(submit).not.toHaveBeenCalled();
      expect(summary).toEqual({ sent: [], failed: [], stoppedBy: null });
    });

    it("si navigator.locks.request falla antes de entrar, sincroniza con la bandera en memoria", async () => {
      const request = vi.fn(async () => { throw new DOMException("no", "SecurityError"); });
      Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
      await enqueueSale(sale(1));
      const submit = vi.fn(async () => okResult(1));
      await runSync(deps(submit));
      expect(ids(submit.mock.calls)).toEqual([ID(1)]);
    });

    it("al terminar libera la bandera: un segundo runSync posterior sí envía", async () => {
      await enqueueSale(sale(1));
      const submit = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
      await runSync(deps(submit));
      await runSync(deps(submit));
      expect(submit).toHaveBeenCalledTimes(2);
      expect((await byId())[ID(1)].attempts).toBe(2);
    });
  });
});

describe("nextDelayMs", () => {
  it("nextDelayMs(0..6): 15 s, 30 s, 60 s, 2 min, 4 min, tope 5 min", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(nextDelayMs)).toEqual([15_000, 30_000, 60_000, 120_000, 240_000, 300_000, 300_000]);
    expect(nextDelayMs(50)).toBe(300_000);
    expect(nextDelayMs(-1)).toBe(15_000);
  });
});

describe("localFolio", () => {
  it("es L- más los 8 primeros caracteres del id", () => {
    expect(localFolio("3f9a2c1b-0000-4000-8000-000000000000")).toBe("L-3f9a2c1b");
  });
});

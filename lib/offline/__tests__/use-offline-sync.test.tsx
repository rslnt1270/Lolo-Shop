import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { deleteDB } from "idb";
import { OFFLINE_DB_NAME, openOfflineDb, type QueuedSale } from "../db";
import type { SaleRecord } from "@/lib/data/sales-source";

const action = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@/lib/sales/offline-actions", () => ({ submitOfflineSaleAction: action.submit }));
// Usuario de la sesión real (lo que respondería /api/auth/session).
const session = vi.hoisted(() => ({ userId: "u1" as string | null }));
vi.mock("../session-user", () => ({ fetchSessionUserId: async () => session.userId }));

import { enqueueSale, listQueue } from "../queue-store";
import { useOfflineSync } from "../use-offline-sync";

const ID = (n: number) => `${String(n).repeat(8)}-0000-4000-8000-000000000000`;

const record = (n: number, over: Partial<QueuedSale> = {}): QueuedSale => ({
  clientRequestId: ID(n),
  userId: "u1",
  locationId: "loc-1",
  channel: "store",
  paymentMethod: "cash",
  lines: [{ variantId: "v1", quantity: 1, unitPrice: 450, sku: "S1", productTitle: "Playera", variantTitle: "M" }],
  total: 450,
  soldAt: `2026-11-12T1${n}:00:00.000Z`,
  snapshotAt: "2026-11-12T09:00:00.000Z",
  snapshotToken: "tok.sig",
  state: "pending",
  attempts: 0,
  ...over,
});

/** Escribe directo en IndexedDB, sin pasar por enqueueSale (no dispara el aviso de encolado). */
async function seed(...records: QueuedSale[]) {
  const db = await openOfflineDb();
  for (const r of records) await db.put("queue", r);
  db.close();
}

const ok = (number: number) => ({ ok: true, review: false, sale: { number } as SaleRecord });
const offline = () => { throw new TypeError("Failed to fetch"); };
const expired = () => ({
  ok: false, code: "FORBIDDEN", message: "Tu sesión terminó.", reason: "session_expired",
});
const sentIds = () => action.submit.mock.calls.map(([i]) => (i as { clientRequestId: string }).clientRequestId);

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(async () => {
  await deleteDB(OFFLINE_DB_NAME);
  action.submit.mockReset();
  session.userId = "u1";
  Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useOfflineSync", () => {
  it("al montar envía la cola del usuario y cuenta las de otros", async () => {
    await seed(record(1), record(2, { userId: "u2" }), record(3, { state: "needs_attention", lastError: "x" }));
    action.submit.mockImplementation(async () => ok(120));
    const { result } = renderHook(() => useOfflineSync("u1"));
    await waitFor(() => expect(result.current.lastSummary?.sent).toHaveLength(1));
    await waitFor(() => expect(result.current.syncing).toBe(false));
    expect(sentIds()).toEqual([ID(1)]);
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.otherUserCount).toBe(1);
    expect(result.current.needsAttention.map((s) => s.clientRequestId)).toEqual([ID(3)]);
  });

  it("sin usuario no envía nada", async () => {
    await seed(record(1));
    const { result } = renderHook(() => useOfflineSync(null));
    await waitFor(() => expect(result.current.otherUserCount).toBe(1));
    act(() => result.current.syncNow());
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(action.submit).not.toHaveBeenCalled();
    expect(result.current.pendingCount).toBe(0);
  });

  it("evento online dispara syncNow", async () => {
    action.submit.mockImplementation(async () => ok(1));
    const { result } = renderHook(() => useOfflineSync("u1"));
    await waitFor(() => expect(result.current.syncing).toBe(false));
    await seed(record(1));
    expect(action.submit).not.toHaveBeenCalled();
    act(() => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(sentIds()).toEqual([ID(1)]));
  });

  it("visibilitychange a visible dispara; a hidden no", async () => {
    action.submit.mockImplementation(async () => ok(1));
    const { result } = renderHook(() => useOfflineSync("u1"));
    await waitFor(() => expect(result.current.syncing).toBe(false));
    await seed(record(1));
    act(() => setVisibility("hidden"));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(action.submit).not.toHaveBeenCalled();
    act(() => setVisibility("visible"));
    await waitFor(() => expect(sentIds()).toEqual([ID(1)]));
  });

  it("encolar una venta dispara el envío", async () => {
    action.submit.mockImplementation(async () => ok(1));
    const { result } = renderHook(() => useOfflineSync("u1"));
    await waitFor(() => expect(result.current.syncing).toBe(false));
    const { state: _s, attempts: _a, ...fresh } = record(1);
    await act(async () => { await enqueueSale(fresh); });
    await waitFor(() => expect(sentIds()).toEqual([ID(1)]));
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
  });

  it("sin red deja pending y programa el reintento con nextDelayMs creciente", async () => {
    await seed(record(1));
    action.submit.mockImplementation(async () => offline());
    const spy = vi.spyOn(globalThis, "setTimeout");
    const { result } = renderHook(() => useOfflineSync("u1"));
    await waitFor(() => expect(result.current.lastSummary?.stoppedBy).toBe("network"));
    await waitFor(() => expect(result.current.pendingCount).toBe(1));
    const delays = () => spy.mock.calls.map(([, ms]) => ms).filter((ms) => (ms ?? 0) >= 15_000);
    await waitFor(() => expect(delays()).toEqual([15_000]));
    // Primera vuelta fallida → 15 s. Al vencer, otra falla → 30 s.
    const timer = spy.mock.calls.find(([, ms]) => ms === 15_000)![0] as () => void;
    act(() => timer());
    await waitFor(() => expect(action.submit).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(delays()).toEqual([15_000, 30_000]));
    expect((await listQueue())[0]).toMatchObject({ state: "pending", attempts: 2 });
  });

  it("con todo enviado no programa reintentos", async () => {
    await seed(record(1));
    action.submit.mockImplementation(async () => ok(1));
    const spy = vi.spyOn(globalThis, "setTimeout");
    const { result } = renderHook(() => useOfflineSync("u1"));
    await waitFor(() => expect(result.current.lastSummary?.sent).toHaveLength(1));
    await waitFor(() => expect(result.current.syncing).toBe(false));
    expect(spy.mock.calls.filter(([, ms]) => (ms ?? 0) >= 15_000)).toEqual([]);
  });

  it("session_expired pausa: online no reenvía, syncNow sí", async () => {
    await seed(record(1));
    action.submit.mockImplementation(async () => expired());
    const spy = vi.spyOn(globalThis, "setTimeout");
    const { result } = renderHook(() => useOfflineSync("u1"));
    await waitFor(() => expect(result.current.lastSummary?.stoppedBy).toBe("session_expired"));
    await waitFor(() => expect(result.current.syncing).toBe(false));
    expect(result.current.pendingCount).toBe(1);
    expect(spy.mock.calls.filter(([, ms]) => (ms ?? 0) >= 15_000)).toEqual([]);
    act(() => { window.dispatchEvent(new Event("online")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(action.submit).toHaveBeenCalledTimes(1);
    action.submit.mockImplementation(async () => ok(7));
    act(() => result.current.syncNow());
    await waitFor(() => expect(action.submit).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.lastSummary?.sent).toHaveLength(1));
  });

  it("session_expired se reanuda al iniciar sesión (cambia el usuario)", async () => {
    await seed(record(1));
    action.submit.mockImplementation(async () => expired());
    const { result, rerender } = renderHook(({ uid }) => useOfflineSync(uid), {
      initialProps: { uid: "u1" as string | null },
    });
    await waitFor(() => expect(result.current.lastSummary?.stoppedBy).toBe("session_expired"));
    rerender({ uid: null });
    action.submit.mockImplementation(async () => ok(9));
    rerender({ uid: "u1" });
    await waitFor(() => expect(sentIds()).toEqual([ID(1), ID(1)]));
    await waitFor(() => expect((result.current.lastSummary?.sent ?? []).map((x) => x.number)).toEqual([9]));
  });

  it("syncNow durante un envío no corre dos vueltas en paralelo y vuelve a pasar al terminar", async () => {
    await seed(record(1));
    let release!: () => void;
    let inFlight = 0;
    let maxInFlight = 0;
    action.submit.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (action.submit.mock.calls.length === 1) await new Promise<void>((r) => { release = r; });
      inFlight--;
      return ok(1);
    });
    const { result } = renderHook(() => useOfflineSync("u1"));
    await waitFor(() => expect(action.submit).toHaveBeenCalledTimes(1));
    await seed(record(2));
    act(() => { result.current.syncNow(); result.current.syncNow(); });
    release();
    await waitFor(() => expect(sentIds()).toEqual([ID(1), ID(2)]));
    await waitFor(() => expect(result.current.syncing).toBe(false));
    expect(maxInFlight).toBe(1);
  });

  it("en pausa, volver visible con la sesión de otro usuario no envía nada", async () => {
    await seed(record(1));
    action.submit.mockImplementation(async () => expired());
    const { result } = renderHook(() => useOfflineSync("u1"));
    await waitFor(() => expect(result.current.lastSummary?.stoppedBy).toBe("session_expired"));
    await waitFor(() => expect(result.current.syncing).toBe(false));
    // Otra persona inició sesión en otra pestaña; esta pestaña aún cree que es u1.
    session.userId = "u2";
    action.submit.mockImplementation(async () => ok(1));
    act(() => setVisibility("hidden"));
    act(() => setVisibility("visible"));
    await waitFor(() => expect(result.current.syncing).toBe(false));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(action.submit).toHaveBeenCalledTimes(1);
    expect((await listQueue())[0]).toMatchObject({ state: "pending", attempts: 0 });
    // Vuelve a entrar u1: ahora sí se envía.
    session.userId = "u1";
    act(() => result.current.syncNow());
    await waitFor(() => expect(action.submit).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.lastSummary?.sent).toHaveLength(1));
  });

  it("USER_MISMATCH del servidor deja pending, pausa y nunca pasa a needs_attention", async () => {
    await seed(record(1));
    action.submit.mockImplementation(async () => ({ ok: false, code: "USER_MISMATCH", message: "Otro usuario." }));
    const spy = vi.spyOn(globalThis, "setTimeout");
    const { result } = renderHook(() => useOfflineSync("u1"));
    await waitFor(() => expect(result.current.lastSummary?.stoppedBy).toBe("user_mismatch"));
    await waitFor(() => expect(result.current.syncing).toBe(false));
    expect(spy.mock.calls.filter(([, ms]) => (ms ?? 0) >= 15_000)).toEqual([]);
    act(() => { window.dispatchEvent(new Event("online")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(action.submit).toHaveBeenCalledTimes(1);
    expect(result.current.needsAttention).toEqual([]);
    expect(result.current.pendingCount).toBe(1);
    expect((await listQueue())[0]).toMatchObject({ state: "pending", attempts: 0 });
  });

  it("cola ilegible programa un reintento aunque no se vean pendientes", async () => {
    const real = globalThis.indexedDB;
    Object.defineProperty(globalThis, "indexedDB", { value: undefined, configurable: true });
    const spy = vi.spyOn(globalThis, "setTimeout");
    try {
      const { result } = renderHook(() => useOfflineSync("u1"));
      await waitFor(() => expect(result.current.lastSummary?.stoppedBy).toBe("storage"));
      await waitFor(() => expect(spy.mock.calls.some(([, ms]) => ms === 15_000)).toBe(true));
    } finally {
      Object.defineProperty(globalThis, "indexedDB", { value: real, configurable: true });
    }
  });

  it("syncNow durante una vuelta que termina en session_expired fuerza otra vuelta", async () => {
    await seed(record(1));
    let release!: () => void;
    action.submit.mockImplementationOnce(async () => {
      await new Promise<void>((r) => { release = r; });
      return expired();
    });
    action.submit.mockImplementation(async () => ok(5));
    const { result } = renderHook(() => useOfflineSync("u1"));
    await waitFor(() => expect(action.submit).toHaveBeenCalledTimes(1));
    act(() => result.current.syncNow()); // el cajero volvió a entrar y pulsa "Enviar ahora"
    release();
    await waitFor(() => expect(sentIds()).toEqual([ID(1), ID(1)]));
    await waitFor(() => expect(result.current.syncing).toBe(false));
    expect((await listQueue())[0]).toMatchObject({ state: "synced", saleNumber: 5 });
  });

  it("al desmontar deja de escuchar", async () => {
    action.submit.mockImplementation(async () => ok(1));
    const { result, unmount } = renderHook(() => useOfflineSync("u1"));
    await waitFor(() => expect(result.current.syncing).toBe(false));
    unmount();
    await seed(record(1));
    window.dispatchEvent(new Event("online"));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(action.submit).not.toHaveBeenCalled();
  });
});

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDB } from "idb";
import { OFFLINE_DB_NAME, OfflineStorageError, onOfflineStorageError, openOfflineDb, type QueuedSale } from "../db";
import {
  discardQueued, enqueueSale, listQueue, onQueueEnqueued, purgeSynced, resetStoragePersistRequest, updateQueued,
} from "../queue-store";
import { deleteSnapshot, getLatestSnapshot, getSnapshot, localAvailable, saveSnapshot } from "../snapshot-store";
import { clearOnSignOut, getIdentity, saveIdentity } from "../identity-store";

const sale = (id: string, over: Partial<Omit<QueuedSale, "state" | "attempts">> = {}): Omit<QueuedSale, "state" | "attempts"> => ({
  clientRequestId: id,
  userId: "u1",
  locationId: "loc-1",
  channel: "in_store",
  paymentMethod: "cash",
  lines: [{ variantId: "v1", quantity: 2, unitPrice: 450, sku: "S1", productTitle: "Playera", variantTitle: "M" }],
  total: 900,
  soldAt: "2026-11-10T10:00:00.000Z",
  snapshotAt: "2026-11-10T09:00:00.000Z",
  snapshotToken: "tok.sig",
  ...over,
});

const snap = (available = 5) => ({
  locationId: "loc-1",
  generatedAt: "2026-11-10T09:00:00.000Z",
  snapshotToken: "tok.sig",
  userId: "u1",
  variants: [{
    variantId: "v1", productId: "p1", barcode: null, sku: "S1", productTitle: "Playera",
    variantTitle: "M", size: "M", price: 450, available,
  }],
});

beforeEach(async () => {
  await deleteDB(OFFLINE_DB_NAME);
  resetStoragePersistRequest();
  Object.defineProperty(navigator, "storage", { value: undefined, configurable: true });
  vi.restoreAllMocks();
});

describe("cola", () => {
  it("encolar dos veces el mismo id falla", async () => {
    await enqueueSale(sale("a"));
    await expect(enqueueSale(sale("a"))).rejects.toMatchObject({ code: "duplicate" });
    expect(await listQueue()).toHaveLength(1);
  });

  it("encola como pending con 0 intentos y conserva snapshotToken", async () => {
    await enqueueSale(sale("a"));
    const [q] = await listQueue();
    expect(q).toMatchObject({ state: "pending", attempts: 0, snapshotToken: "tok.sig" });
  });

  it("pide almacenamiento persistente sin esperar y no vuelve a pedirlo si se concedió", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "storage", { value: { persist }, configurable: true });
    await enqueueSale(sale("a"));
    await Promise.resolve();
    await enqueueSale(sale("b"));
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("si no se concedió el almacenamiento persistente lo vuelve a pedir en la siguiente", async () => {
    const persist = vi.fn().mockResolvedValue(false);
    Object.defineProperty(navigator, "storage", { value: { persist }, configurable: true });
    await enqueueSale(sale("a"));
    await new Promise((r) => setTimeout(r, 0));
    await enqueueSale(sale("b"));
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("persist() que nunca responde no detiene el encolado", async () => {
    const persist = vi.fn(() => new Promise<boolean>(() => {}));
    Object.defineProperty(navigator, "storage", { value: { persist }, configurable: true });
    await expect(enqueueSale(sale("a"))).resolves.toBeUndefined();
    expect(await listQueue()).toHaveLength(1);
  });

  it("persist() que lanza no detiene el encolado", async () => {
    const persist = vi.fn(() => { throw new Error("no"); });
    Object.defineProperty(navigator, "storage", { value: { persist }, configurable: true });
    await expect(enqueueSale(sale("a"))).resolves.toBeUndefined();
    expect(await listQueue()).toHaveLength(1);
  });

  it("dos encolados simultáneos del mismo id: uno se guarda y el otro falla como duplicate", async () => {
    const results = await Promise.allSettled([enqueueSale(sale("a")), enqueueSale(sale("a"))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "duplicate" });
    expect(await listQueue()).toHaveLength(1);
  });

  it("si add falla, enqueueSale rechaza como unavailable y no guarda nada", async () => {
    vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(() => {
      throw new DOMException("Sin espacio", "QuotaExceededError");
    });
    await expect(enqueueSale(sale("a"))).rejects.toMatchObject({ code: "unavailable" });
    vi.restoreAllMocks();
    expect(await listQueue()).toEqual([]);
  });

  it("solo copia las llaves conocidas del registro y de sus renglones", async () => {
    await enqueueSale({
      ...sale("a", { customerAlias: "Ana" }),
      lines: [{ ...sale("a").lines[0], extra: "x" } as never],
      jwt: "x", state: "synced", attempts: 9, saleNumber: 7,
    } as never);
    const [q] = await listQueue();
    expect(Object.keys(q).sort()).toEqual([
      "attempts", "channel", "clientRequestId", "customerAlias", "lines", "locationId", "paymentMethod",
      "snapshotAt", "snapshotToken", "soldAt", "state", "total", "userId",
    ]);
    expect(q).toMatchObject({ state: "pending", attempts: 0, snapshotToken: "tok.sig", customerAlias: "Ana" });
    expect(Object.keys(q.lines[0]).sort()).toEqual(["productTitle", "quantity", "sku", "unitPrice", "variantId", "variantTitle"]);
  });

  it("sin alias no guarda la llave customerAlias", async () => {
    await enqueueSale(sale("a"));
    const [q] = await listQueue();
    expect("customerAlias" in q).toBe(false);
  });

  it("avisa a los oyentes después de encolar, no si falla", async () => {
    const seen: string[] = [];
    const off = onQueueEnqueued((id) => seen.push(id));
    await enqueueSale(sale("a"));
    await enqueueSale(sale("a")).catch(() => {});
    off();
    await enqueueSale(sale("b"));
    expect(seen).toEqual(["a"]);
  });

  it("el duplicado no se reporta como falla del almacenamiento", async () => {
    const seen: OfflineStorageError[] = [];
    const off = onOfflineStorageError((e) => seen.push(e));
    await enqueueSale(sale("a"));
    await enqueueSale(sale("a")).catch(() => {});
    off();
    expect(seen).toEqual([]);
  });

  it("updateQueued no cambia lines, total ni clientRequestId", async () => {
    await enqueueSale(sale("a"));
    const evil = { state: "sending", attempts: 1, lines: [], total: 1, clientRequestId: "zzz", snapshotToken: "x" };
    expect(await updateQueued("a", evil as never)).toBe(true);
    const [q] = await listQueue();
    expect(q.state).toBe("sending");
    expect(q.attempts).toBe(1);
    expect(q.clientRequestId).toBe("a");
    expect(q.total).toBe(900);
    expect(q.lines).toHaveLength(1);
    expect(q.snapshotToken).toBe("tok.sig");
  });

  it("updateQueued de un id inexistente no crea registros", async () => {
    expect(await updateQueued("nada", { state: "synced" })).toBe(false);
    expect(await listQueue()).toEqual([]);
  });

  it("listQueue ordena por soldAt", async () => {
    await enqueueSale(sale("c", { soldAt: "2026-11-10T12:00:00.000Z" }));
    await enqueueSale(sale("a", { soldAt: "2026-11-10T08:00:00.000Z" }));
    await enqueueSale(sale("b", { soldAt: "2026-11-10T10:00:00.000Z" }));
    expect((await listQueue()).map((s) => s.clientRequestId)).toEqual(["a", "b", "c"]);
  });

  it("discardQueued borra needs_attention y synced", async () => {
    await enqueueSale(sale("a"));
    await enqueueSale(sale("b"));
    await updateQueued("a", { state: "needs_attention", lastError: "x" });
    await updateQueued("b", { state: "synced", syncedAt: "2026-11-10T00:00:00.000Z" });
    expect(await discardQueued("a")).toBe(true);
    expect(await discardQueued("b")).toBe(true);
    expect(await listQueue()).toEqual([]);
  });

  it("discardQueued rechaza pending y sending, y un id inexistente", async () => {
    await enqueueSale(sale("a"));
    await enqueueSale(sale("b"));
    await updateQueued("b", { state: "sending" });
    expect(await discardQueued("a")).toBe(false);
    expect(await discardQueued("b")).toBe(false);
    expect(await discardQueued("nada")).toBe(false);
    expect((await listQueue()).map((s) => s.clientRequestId)).toEqual(["a", "b"]);
  });

  it("owner o manager descartan pending de OTRO usuario; nunca el propio, ni sending, ni un colaborador", async () => {
    await enqueueSale(sale("a", { userId: "u2" }));
    await enqueueSale(sale("b", { userId: "u1" }));
    await enqueueSale(sale("c", { userId: "u2" }));
    await updateQueued("c", { state: "sending" });
    await enqueueSale(sale("d", { userId: "u2" }));
    // Sin quién descarta: pending nunca.
    expect(await discardQueued("a")).toBe(false);
    // Colaborador: no.
    expect(await discardQueued("a", { currentUserId: "u1", role: "collaborator" })).toBe(false);
    // Propia: no.
    expect(await discardQueued("b", { currentUserId: "u1", role: "owner" })).toBe(false);
    // sending: no, aunque sea de otro.
    expect(await discardQueued("c", { currentUserId: "u1", role: "owner" })).toBe(false);
    expect(await discardQueued("a", { currentUserId: "u1", role: "owner" })).toBe(true);
    expect(await discardQueued("d", { currentUserId: "u1", role: "manager" })).toBe(true);
    expect((await listQueue()).map((s) => s.clientRequestId)).toEqual(["b", "c"]);
  });

  it("sin almacenamiento updateQueued y discardQueued devuelven false", async () => {
    await enqueueSale(sale("a"));
    await updateQueued("a", { state: "needs_attention" });
    const real = globalThis.indexedDB;
    Object.defineProperty(globalThis, "indexedDB", { value: undefined, configurable: true });
    try {
      expect(await updateQueued("a", { state: "synced" })).toBe(false);
      expect(await discardQueued("a")).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "indexedDB", { value: real, configurable: true });
    }
  });

  it("purgeSynced borra synced de más de 7 días y nunca pending ni needs_attention", async () => {
    const now = new Date("2026-11-20T00:00:00.000Z");
    for (const id of ["old", "new", "pend", "attn"]) await enqueueSale(sale(id));
    await updateQueued("old", { state: "synced", syncedAt: "2026-11-10T00:00:00.000Z" });
    await updateQueued("new", { state: "synced", syncedAt: "2026-11-18T00:00:00.000Z" });
    await updateQueued("attn", { state: "needs_attention", syncedAt: "2026-01-01T00:00:00.000Z" });
    expect(await purgeSynced(now)).toBe(1);
    expect((await listQueue()).map((s) => s.clientRequestId).sort()).toEqual(["attn", "new", "pend"]);
  });
});

describe("copia", () => {
  it("guarda y lee la copia con su snapshotToken", async () => {
    await saveSnapshot(snap());
    expect(await getSnapshot("loc-1")).toEqual(snap());
    expect(await getSnapshot("otra")).toBeNull();
  });

  it("getLatestSnapshot devuelve la copia más reciente de ese usuario", async () => {
    expect(await getLatestSnapshot("u1")).toBeNull();
    await saveSnapshot({ ...snap(), locationId: "loc-2", generatedAt: "2026-11-10T11:00:00.000Z" });
    await saveSnapshot({ ...snap(), locationId: "loc-3", generatedAt: "2026-11-10T12:00:00.000Z", userId: "u2" });
    await saveSnapshot(snap());
    expect(await getLatestSnapshot("u1")).toMatchObject({ locationId: "loc-2" });
    expect(await getLatestSnapshot("u2")).toMatchObject({ locationId: "loc-3" });
    expect(await getLatestSnapshot("u3")).toBeNull();
  });

  it("guarda quién bajó la copia y deleteSnapshot borra solo esa tienda", async () => {
    await saveSnapshot(snap());
    await saveSnapshot({ ...snap(), locationId: "loc-2" });
    expect(await getSnapshot("loc-1")).toMatchObject({ userId: "u1" });
    await deleteSnapshot("loc-1");
    expect(await getSnapshot("loc-1")).toBeNull();
    expect(await getSnapshot("loc-2")).not.toBeNull();
  });

  it("localAvailable resta pending y sending, no synced ni otras tiendas", async () => {
    const s = snap(5);
    const mk = (id: string, state: QueuedSale["state"], locationId = "loc-1"): QueuedSale =>
      ({ ...sale(id, { locationId }), state, attempts: 0 });
    const q = [mk("1", "pending"), mk("2", "sending"), mk("3", "synced"), mk("4", "needs_attention"), mk("5", "pending", "loc-2")];
    expect(localAvailable(s, q, "v1")).toBe(1);
    expect(localAvailable(s, [], "v1")).toBe(5);
    expect(localAvailable(snap(1), q, "v1")).toBe(0);
    expect(localAvailable(s, q, "desconocida")).toBe(0);
  });
});

describe("identidad y cierre de sesión", () => {
  it("guarda y lee la identidad", async () => {
    const id = { userId: "u1", role: "manager", locationId: "loc-1", confirmedAt: "2026-11-10T09:00:00.000Z" };
    await saveIdentity(id);
    expect(await getIdentity()).toEqual(id);
  });

  it("clearOnSignOut conserva la cola", async () => {
    await saveIdentity({ userId: "u1", role: "owner", locationId: null, confirmedAt: "2026-11-10T09:00:00.000Z" });
    await saveSnapshot(snap());
    await enqueueSale(sale("a"));
    await clearOnSignOut();
    expect(await getIdentity()).toBeNull();
    expect(await getSnapshot("loc-1")).toBeNull();
    expect((await listQueue()).map((s) => s.clientRequestId)).toEqual(["a"]);
  });
});

describe("seguridad", () => {
  it("ningún almacén contiene llaves token, password, secret, cookie (salvo snapshotToken)", async () => {
    await saveIdentity({ userId: "u1", role: "owner", locationId: null, confirmedAt: "2026-11-10T09:00:00.000Z" });
    await saveSnapshot({ ...snap(), jwt: "x", password: "x", cookie: "x" } as never);
    await enqueueSale(sale("a"));
    const db = await openOfflineDb();
    const records = [
      ...(await db.getAll("identity")),
      ...(await db.getAll("snapshots")),
      ...(await db.getAll("queue")),
    ];
    db.close();
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); }
    };
    records.forEach(walk);
    const bad = [...keys].filter((k) => k !== "snapshotToken" && /token|password|secret|cookie|jwt|authorization/i.test(k));
    expect(bad).toEqual([]);
    expect(keys.has("snapshotToken")).toBe(true);
  });
});

describe("degradación", () => {
  it("sin IndexedDB lecturas devuelven vacío, reportan y enqueueSale lanza unavailable", async () => {
    const real = globalThis.indexedDB;
    Object.defineProperty(globalThis, "indexedDB", { value: undefined, configurable: true });
    const seen: OfflineStorageError[] = [];
    const off = onOfflineStorageError((e) => seen.push(e));
    try {
      expect(await listQueue()).toEqual([]);
      expect(await getSnapshot("loc-1")).toBeNull();
      expect(await getIdentity()).toBeNull();
      expect(await purgeSynced(new Date())).toBe(0);
      await expect(saveSnapshot(snap())).resolves.toBeUndefined();
      await expect(clearOnSignOut()).resolves.toBeUndefined();
      await expect(enqueueSale(sale("a"))).rejects.toMatchObject({ code: "unavailable" });
      expect(seen.length).toBeGreaterThan(0);
    } finally {
      off();
      Object.defineProperty(globalThis, "indexedDB", { value: real, configurable: true });
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { OfflineSnapshotVariant } from "@/lib/data/source";
import type { QueuedSale, StoredIdentity, StoredSnapshot } from "@/lib/offline/db";

const H = 60 * 60 * 1000;

const m = vi.hoisted(() => ({
  session: { current: { data: null as unknown, status: "unauthenticated" as string } },
  lookupCodeAction: vi.fn(),
  fetchLocationsAction: vi.fn(),
  createSaleAction: vi.fn(),
  getOfflineSnapshotAction: vi.fn(),
  fetchSessionUser: vi.fn(),
  getIdentity: vi.fn(),
  saveIdentity: vi.fn(),
  getSnapshot: vi.fn(),
  getLatestSnapshot: vi.fn(),
  saveSnapshot: vi.fn(),
  deleteSnapshot: vi.fn(),
  listQueue: vi.fn(),
  enqueueSale: vi.fn(),
  discardQueued: vi.fn(),
  sync: {
    current: {} as {
      pendingCount: number; otherUserCount: number; needsAttention: QueuedSale[]; items: QueuedSale[];
      lastSummary: unknown; syncing: boolean; syncNow: () => void; refresh: () => Promise<void>;
    },
  },
  onScan: { current: null as null | ((c: string) => void) },
}));

vi.mock("next-auth/react", () => ({ useSession: () => m.session.current }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/lib/actions", () => ({
  lookupCodeAction: m.lookupCodeAction,
  fetchLocationsAction: m.fetchLocationsAction,
}));
vi.mock("@/lib/sales/actions", () => ({ createSaleAction: m.createSaleAction }));
vi.mock("@/lib/sales/offline-actions", () => ({ getOfflineSnapshotAction: m.getOfflineSnapshotAction }));
vi.mock("@/lib/offline/identity-store", () => ({
  getIdentity: m.getIdentity,
  saveIdentity: m.saveIdentity,
  clearOnSignOut: vi.fn(),
}));
vi.mock("@/lib/offline/snapshot-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/offline/snapshot-store")>()),
  getSnapshot: m.getSnapshot,
  getLatestSnapshot: m.getLatestSnapshot,
  saveSnapshot: m.saveSnapshot,
  deleteSnapshot: m.deleteSnapshot,
}));
vi.mock("@/lib/offline/session-user", async (orig) => ({
  ...(await orig<typeof import("@/lib/offline/session-user")>()),
  fetchSessionUser: m.fetchSessionUser,
}));
vi.mock("@/lib/offline/queue-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/offline/queue-store")>()),
  listQueue: m.listQueue,
  enqueueSale: m.enqueueSale,
  discardQueued: m.discardQueued,
}));
vi.mock("@/lib/offline/use-offline-sync", () => ({ useOfflineSync: () => m.sync.current }));
vi.mock("@/components/inventory/Scanner", () => ({
  Scanner: ({ onScan }: { onScan: (c: string) => void }) => {
    m.onScan.current = onScan;
    return <div data-testid="scanner" />;
  },
}));

import POSPage from "@/app/pos/page";

let online = true;
Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });

const goOffline = () => act(() => {
  online = false;
  window.dispatchEvent(new Event("offline"));
});

const variant = (over: Partial<OfflineSnapshotVariant> = {}): OfflineSnapshotVariant => ({
  variantId: "v1",
  productId: "p1",
  barcode: "7501234567890",
  sku: "LS-AAAAAA-1",
  productTitle: "Playera Guess negro",
  variantTitle: "M",
  size: "M",
  price: 450,
  available: 3,
  ...over,
});

const stored = (locationId = "l1", ageMs = H, variants = [variant()], userId = "u2"): StoredSnapshot => ({
  locationId,
  generatedAt: new Date(Date.now() - ageMs).toISOString(),
  variants,
  snapshotToken: "tok.sig",
  userId,
});

const goOnline = () => act(() => {
  online = true;
  window.dispatchEvent(new Event("online"));
});

const identity = (ageMs: number, over: Partial<StoredIdentity> = {}): StoredIdentity => ({
  userId: "u2",
  role: "collaborator",
  locationId: "l1",
  confirmedAt: new Date(Date.now() - ageMs).toISOString(),
  ...over,
});

const queued = (variantId: string, quantity: number): QueuedSale => ({
  clientRequestId: `q-${variantId}-${quantity}`,
  userId: "u2",
  locationId: "l1",
  channel: "store",
  paymentMethod: "cash",
  lines: [{ variantId, quantity, unitPrice: 450, sku: "S", productTitle: "Playera", variantTitle: "M" }],
  total: 450 * quantity,
  soldAt: new Date().toISOString(),
  snapshotAt: new Date().toISOString(),
  snapshotToken: "tok.sig",
  state: "pending",
  attempts: 0,
});

const ownerSession = () => {
  m.session.current = {
    data: { user: { id: "u1", name: "Lolo", role: "owner", locationId: null } },
    status: "authenticated",
  };
};

const scan = (code: string) => act(() => m.onScan.current!(code));

/** Espera a que la página lea la copia guardada de la tienda. */
async function snapshotRead(locationId = "l1") {
  await waitFor(() => expect(m.getSnapshot).toHaveBeenCalledWith(locationId));
  await act(async () => {});
}

/** Sin red y sin sesión de next-auth (no la puede leer sin conexión). */
function offlineCold(id: StoredIdentity | null, snap: StoredSnapshot | null) {
  online = false;
  m.session.current = { data: null, status: "unauthenticated" };
  m.getIdentity.mockResolvedValue(id);
  m.getSnapshot.mockImplementation(async (loc: string) => (snap && snap.locationId === loc ? snap : null));
  m.getLatestSnapshot.mockResolvedValue(snap);
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  online = true;
  m.session.current = { data: null, status: "unauthenticated" };
  m.fetchLocationsAction.mockResolvedValue([{ id: "l1", name: "Centro" }, { id: "l2", name: "Norte" }]);
  m.getOfflineSnapshotAction.mockImplementation(async (loc: string) => {
    const { locationId, generatedAt, variants, snapshotToken } = stored(loc, 0);
    return { ok: true, snapshot: { locationId, generatedAt, variants }, snapshotToken };
  });
  m.getIdentity.mockResolvedValue(null);
  m.saveIdentity.mockResolvedValue(undefined);
  m.getSnapshot.mockResolvedValue(null);
  m.getLatestSnapshot.mockResolvedValue(null);
  m.saveSnapshot.mockResolvedValue(undefined);
  m.deleteSnapshot.mockResolvedValue(undefined);
  m.fetchSessionUser.mockResolvedValue(null);
  m.listQueue.mockResolvedValue([]);
  m.enqueueSale.mockResolvedValue(undefined);
  m.discardQueued.mockResolvedValue(true);
  m.sync.current = {
    pendingCount: 0, otherUserCount: 0, needsAttention: [], items: [], lastSummary: null, syncing: false,
    syncNow: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined),
  };
});

afterEach(() => {
  vi.useRealTimers();
  online = true;
});

describe("/pos sin internet: identidad local", () => {
  it("sin red con sesión en caché de 11 h usa la identidad local", async () => {
    offlineCold(identity(11 * H), stored("l1"));
    render(<POSPage />);
    expect(await screen.findByTestId("scanner")).toBeInTheDocument();
    expect(screen.queryByText("Conéctate e inicia sesión para seguir vendiendo")).toBeNull();
    // Colaborador: sin selector de tienda; vende en la suya.
    expect(screen.queryByRole("combobox", { name: "Tienda" })).toBeNull();
    expect(m.getOfflineSnapshotAction).not.toHaveBeenCalled();
  });

  it('con 13 h muestra "Conéctate e inicia sesión para seguir vendiendo"', async () => {
    offlineCold(identity(13 * H), stored("l1"));
    render(<POSPage />);
    expect(await screen.findByText("Conéctate e inicia sesión para seguir vendiendo")).toBeInTheDocument();
    expect(screen.queryByTestId("scanner")).toBeNull();
  });

  it("sin identidad guardada también pide conectarse e iniciar sesión", async () => {
    offlineCold(null, null);
    render(<POSPage />);
    expect(await screen.findByText("Conéctate e inicia sesión para seguir vendiendo")).toBeInTheDocument();
  });

  it("con sesión guarda la identidad sin token ni datos extra", async () => {
    ownerSession();
    render(<POSPage />);
    await screen.findByDisplayValue("Centro");
    await waitFor(() => expect(m.saveIdentity).toHaveBeenCalled());
    const saved = m.saveIdentity.mock.calls[0][0];
    expect(Object.keys(saved).sort()).toEqual(["confirmedAt", "locationId", "role", "userId"]);
    expect(saved).toMatchObject({ userId: "u1", role: "owner", locationId: null });
  });
});

describe("/pos sin internet: copia local", () => {
  it('copia de 25 h bloquea con "Conéctate para actualizar precios y existencias"', async () => {
    offlineCold(identity(H), stored("l1", 25 * H));
    render(<POSPage />);
    expect(await screen.findByText("Conéctate para actualizar precios y existencias")).toBeInTheDocument();
    scan("7501234567890");
    await waitFor(() => expect(screen.getAllByText("Conéctate para actualizar precios y existencias").length).toBeGreaterThan(0));
    expect(screen.queryByText(/Agregado:/)).toBeNull();
    expect(m.lookupCodeAction).not.toHaveBeenCalled();
  });

  it("sin copia de la tienda también bloquea las lecturas", async () => {
    offlineCold(identity(H), null);
    render(<POSPage />);
    expect(await screen.findByText("Conéctate para actualizar precios y existencias")).toBeInTheDocument();
  });

  it("lectura sin red agrega desde la copia", async () => {
    offlineCold(identity(H), stored("l1"));
    // Una pieza ya vendida en este teléfono y sin enviar: quedan 2.
    m.listQueue.mockResolvedValue([queued("v1", 1)]);
    render(<POSPage />);
    await screen.findByTestId("scanner");
    await snapshotRead();
    scan("7501234567890");
    expect(await screen.findByText("Agregado: Playera Guess negro (M) · ×1")).toBeInTheDocument();
    scan("ls-aaaaaa-1");
    expect(await screen.findByText("Agregado: Playera Guess negro (M) · ×2")).toBeInTheDocument();
    scan("7501234567890");
    expect(await screen.findByText("Sin existencias de la talla M en esta tienda")).toBeInTheDocument();
    expect(m.lookupCodeAction).not.toHaveBeenCalled();
  });

  it('código ausente muestra "No está en la copia de esta tienda. Si es nueva, se vende cuando vuelva la conexión."', async () => {
    offlineCold(identity(H), stored("l1"));
    render(<POSPage />);
    await screen.findByTestId("scanner");
    await snapshotRead();
    scan("9999999");
    const text = "No está en la copia de esta tienda. Si es nueva, se vende cuando vuelva la conexión.";
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(m.lookupCodeAction).not.toHaveBeenCalled();
  });

  it("con red, si la búsqueda falla por red usa la copia", async () => {
    ownerSession();
    m.getSnapshot.mockImplementation(async (loc: string) => stored(loc, H, [variant()], "u1"));
    m.lookupCodeAction.mockRejectedValue(new Error("Failed to fetch"));
    render(<POSPage />);
    await screen.findByDisplayValue("Centro");
    await waitFor(() => expect(m.getOfflineSnapshotAction).toHaveBeenCalledWith("l1"));
    scan("7501234567890");
    expect(await screen.findByText("Agregado: Playera Guess negro (M) · ×1")).toBeInTheDocument();
    expect(m.lookupCodeAction).toHaveBeenCalledTimes(1);
  });

  it("con red refresca la copia al abrir y cada 10 min", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    ownerSession();
    render(<POSPage />);
    await screen.findByDisplayValue("Centro");
    await waitFor(() => expect(m.getOfflineSnapshotAction).toHaveBeenCalledTimes(1));
    expect(m.getOfflineSnapshotAction).toHaveBeenLastCalledWith("l1");
    await waitFor(() => expect(m.saveSnapshot).toHaveBeenCalledTimes(1));
    expect(m.saveSnapshot.mock.calls[0][0]).toMatchObject({ locationId: "l1", snapshotToken: "tok.sig", userId: "u1" });

    act(() => { vi.advanceTimersByTime(9 * 60 * 1000); });
    expect(m.getOfflineSnapshotAction).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(60 * 1000); });
    await waitFor(() => expect(m.getOfflineSnapshotAction).toHaveBeenCalledTimes(2));
    act(() => { vi.advanceTimersByTime(10 * 60 * 1000); });
    await waitFor(() => expect(m.getOfflineSnapshotAction).toHaveBeenCalledTimes(3));
  });

  it("sin red no pide la copia al servidor y la vuelve a pedir al volver la conexión", async () => {
    ownerSession();
    render(<POSPage />);
    await screen.findByDisplayValue("Centro");
    await waitFor(() => expect(m.getOfflineSnapshotAction).toHaveBeenCalledTimes(1));
    goOffline();
    act(() => {
      online = true;
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(m.getOfflineSnapshotAction).toHaveBeenCalledTimes(2));
  });
});

describe("/pos sin internet: tienda", () => {
  it("owner sin red no puede cambiar de tienda", async () => {
    ownerSession();
    m.getSnapshot.mockImplementation(async (loc: string) => stored(loc, H, [variant()], "u1"));
    render(<POSPage />);
    const select = await screen.findByDisplayValue("Centro");
    expect(select).not.toBeDisabled();
    goOffline();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Tienda" })).toBeDisabled());
    expect(screen.getByRole("combobox", { name: "Tienda" })).toHaveValue("l1");
  });

  it("owner que abre sin red queda fijo en la tienda de la copia", async () => {
    offlineCold(identity(H, { userId: "u1", role: "owner", locationId: null }), stored("l2", H, [variant()], "u1"));
    render(<POSPage />);
    const select = await screen.findByRole("combobox", { name: "Tienda" });
    await waitFor(() => expect(select).toHaveValue("l2"));
    expect(select).toBeDisabled();
    await snapshotRead("l2");
    scan("7501234567890");
    expect(await screen.findByText("Agregado: Playera Guess negro (M) · ×1")).toBeInTheDocument();
    expect(m.fetchLocationsAction).not.toHaveBeenCalled();
  });
});

describe("/pos al volver la conexión sin sesión de next-auth", () => {
  it("abrió sin red: al volver la red revalida la sesión y sigue vendiendo", async () => {
    offlineCold(identity(H), stored("l1"));
    let resolve!: (u: unknown) => void;
    m.fetchSessionUser.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<POSPage />);
    await screen.findByTestId("scanner");
    goOnline();
    await waitFor(() => expect(m.fetchSessionUser).toHaveBeenCalledTimes(1));
    // Mientras se confirma, sigue con la identidad local.
    expect(screen.getByTestId("scanner")).toBeInTheDocument();
    expect(screen.queryByText(/inicia sesión/i)).toBeNull();
    await act(async () => resolve({ id: "u2", role: "collaborator", locationId: "l1" }));
    expect(screen.getByTestId("scanner")).toBeInTheDocument();
    // La sesión confirmada reanuda la copia y la identidad.
    await waitFor(() => expect(m.getOfflineSnapshotAction).toHaveBeenCalledWith("l1"));
    await waitFor(() => expect(m.saveIdentity).toHaveBeenCalledWith(expect.objectContaining({ userId: "u2" })));
  });

  it("si el servidor confirma que no hay sesión, pide iniciar sesión", async () => {
    offlineCold(identity(H), stored("l1"));
    m.fetchSessionUser.mockResolvedValue(null);
    render(<POSPage />);
    await screen.findByTestId("scanner");
    goOnline();
    expect(await screen.findByRole("link", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.queryByTestId("scanner")).toBeNull();
  });

  it("si la revalidación falla por red, sigue con la identidad local y reintenta al volver la red", async () => {
    offlineCold(identity(H), stored("l1"));
    m.fetchSessionUser.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    m.fetchSessionUser.mockResolvedValueOnce({ id: "u2", role: "collaborator", locationId: "l1" });
    render(<POSPage />);
    await screen.findByTestId("scanner");
    goOnline();
    await waitFor(() => expect(m.fetchSessionUser).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.getByTestId("scanner")).toBeInTheDocument();
    goOffline();
    goOnline();
    await waitFor(() => expect(m.fetchSessionUser).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(m.getOfflineSnapshotAction).toHaveBeenCalledWith("l1"));
  });
});

describe("/pos copia demasiado grande", () => {
  it("too_large descarta la copia anterior de esa tienda y deshabilita la venta sin internet", async () => {
    ownerSession();
    m.getSnapshot.mockImplementation(async (loc: string) => stored(loc, H, [variant()], "u1"));
    m.getOfflineSnapshotAction.mockResolvedValue({ ok: false, reason: "too_large" });
    render(<POSPage />);
    await screen.findByDisplayValue("Centro");
    await waitFor(() => expect(m.deleteSnapshot).toHaveBeenCalledWith("l1"));
    goOffline();
    const text = "Esta tienda tiene demasiadas prendas para vender sin internet. Avisa al dueño.";
    expect(await screen.findByText(text)).toBeInTheDocument();
    scan("7501234567890");
    await waitFor(() => expect(screen.getAllByText(text).length).toBeGreaterThan(1));
    expect(screen.queryByText(/Agregado:/)).toBeNull();
  });

  it("una falla de red al pedir la copia conserva la anterior", async () => {
    ownerSession();
    m.getSnapshot.mockImplementation(async (loc: string) => stored(loc, H, [variant()], "u1"));
    m.getOfflineSnapshotAction.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<POSPage />);
    await screen.findByDisplayValue("Centro");
    await waitFor(() => expect(m.getOfflineSnapshotAction).toHaveBeenCalled());
    await snapshotRead();
    goOffline();
    scan("7501234567890");
    expect(await screen.findByText("Agregado: Playera Guess negro (M) · ×1")).toBeInTheDocument();
    expect(m.deleteSnapshot).not.toHaveBeenCalled();
  });
});

describe("/pos copia de otro usuario", () => {
  it("sin red no usa la copia que bajó otro usuario en este teléfono", async () => {
    offlineCold(identity(H), stored("l1", H, [variant()], "u-otro"));
    render(<POSPage />);
    await screen.findByTestId("scanner");
    await snapshotRead();
    expect(await screen.findByText("Conéctate para actualizar precios y existencias")).toBeInTheDocument();
    scan("7501234567890");
    await waitFor(() => expect(screen.getAllByText("Conéctate para actualizar precios y existencias").length).toBeGreaterThan(1));
    expect(screen.queryByText(/Agregado:/)).toBeNull();
  });

  it("owner que abre sin red solo toma la tienda de una copia suya", async () => {
    offlineCold(identity(H, { userId: "u1", role: "owner", locationId: null }), stored("l2", H, [variant()], "u1"));
    render(<POSPage />);
    await screen.findByRole("combobox", { name: "Tienda" });
    await waitFor(() => expect(m.getLatestSnapshot).toHaveBeenCalledWith("u1"));
  });
});

// ── Task 10: cobro sin internet, bloqueo incierto y avisos ──────────────────

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const savedText = (id: string) => `Venta guardada sin internet (L-${id.slice(0, 8)}). Se enviará sola.`;
const cobrar = () => fireEvent.click(screen.getByRole("button", { name: /^cobrar/i }));
const enqueued = () => m.enqueueSale.mock.calls.map((c) => c[0] as QueuedSale);

/** Respuesta en línea de lookupCodeAction para la variante de la copia. */
const foundOnline = () => ({
  found: true as const,
  variantId: "v1",
  stock: { available: 3, sold: false },
  product: {
    id: "p1", title: "Playera Guess negro", category: "Ropa", brand: "Guess", imageUrl: null,
    variants: [{ id: "v1", sku: "LS-AAAAAA-1", title: "M", size: "M", color: "", price: 450, barcode: "7501234567890", inventory: [] }],
  },
});

/** Colaborador sin red, con copia vigente, y una prenda ya en el carrito. */
async function offlineWithLine(snap = stored("l1")) {
  offlineCold(identity(H), snap);
  render(<POSPage />);
  await screen.findByTestId("scanner");
  await snapshotRead();
  scan("7501234567890");
  await screen.findByText("Agregado: Playera Guess negro (M) · ×1");
}

/** Owner en línea con copia suya y una prenda en el carrito (consulta al servidor). */
async function onlineWithLine() {
  ownerSession();
  m.getSnapshot.mockImplementation(async (loc: string) => stored(loc, H, [variant()], "u1"));
  m.lookupCodeAction.mockResolvedValue(foundOnline());
  const view = render(<POSPage />);
  await screen.findByDisplayValue("Centro");
  await snapshotRead();
  await waitFor(() => expect(m.saveSnapshot).toHaveBeenCalled());
  scan("7501234567890");
  await screen.findByText("Agregado: Playera Guess negro (M) · ×1");
  return view;
}

describe("/pos cobro sin internet", () => {
  it('sin red, Cobrar encola con el id del borrador, limpia el carrito y avisa "Venta guardada sin internet (L-xxxxxxxx). Se enviará sola."', async () => {
    const snap = stored("l1");
    await offlineWithLine(snap);
    cobrar();
    await waitFor(() => expect(m.enqueueSale).toHaveBeenCalledTimes(1));
    const sale = enqueued()[0];
    expect(sale.clientRequestId).toMatch(UUID_V4);
    expect(sale).toMatchObject({
      userId: "u2",
      locationId: "l1",
      channel: "store",
      paymentMethod: "cash",
      lines: [{ variantId: "v1", quantity: 1, unitPrice: 450, sku: "LS-AAAAAA-1", productTitle: "Playera Guess negro", variantTitle: "M" }],
      total: 450,
      snapshotAt: snap.generatedAt,
      snapshotToken: "tok.sig",
    });
    expect(Number.isNaN(Date.parse(sale.soldAt))).toBe(false);
    // Nada secreto en la venta guardada.
    expect(Object.keys(sale).sort()).toEqual([
      "channel", "clientRequestId", "lines", "locationId", "paymentMethod", "snapshotAt", "snapshotToken", "soldAt", "total", "userId",
    ]);
    expect(await screen.findByText(savedText(sale.clientRequestId))).toBeInTheDocument();
    expect(screen.getByText("Agrega al menos una prenda para cobrar.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar cobro" })).toBeNull();
    expect(m.createSaleAction).not.toHaveBeenCalled();
  });

  it("si no se pudo guardar en el teléfono, la venta NO se da por hecha y el carrito se queda", async () => {
    const { OfflineStorageError } = await import("@/lib/offline/db");
    m.enqueueSale.mockRejectedValue(new OfflineStorageError("unavailable", "Almacenamiento local no disponible"));
    await offlineWithLine();
    cobrar();
    expect(
      await screen.findByText("No se pudo guardar la venta en este teléfono. No quedó registrada: intenta de nuevo."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Venta guardada sin internet/)).toBeNull();
    expect(screen.getByRole("button", { name: /^cobrar \$450/i })).toBeInTheDocument();
  });

  it("el carrito sin internet no deja pasar del stock local", async () => {
    await offlineWithLine(stored("l1", H, [variant({ available: 1 })]));
    scan("7501234567890");
    expect(await screen.findByText("Sin existencias de la talla M en esta tienda")).toBeInTheDocument();
    // Otra pestaña vendió la última pieza mientras tanto: al cobrar se vuelve a revisar con la cola.
    m.listQueue.mockResolvedValue([queued("v1", 1)]);
    cobrar();
    expect(
      await screen.findByText("No alcanzan las piezas de Playera Guess negro (M) en la copia de esta tienda. Revisa las cantidades."),
    ).toBeInTheDocument();
    expect(m.enqueueSale).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^cobrar \$450/i })).toBeInTheDocument();
  });

  it("lecturas en espera entran al carrito nuevo tras encolar", async () => {
    let finish!: () => void;
    m.enqueueSale.mockReturnValue(new Promise<void>((r) => (finish = r)));
    await offlineWithLine();
    cobrar();
    await waitFor(() => expect(m.enqueueSale).toHaveBeenCalled());
    scan("7501234567890");
    // Lectura, revisión de stock al encolar y la segunda lectura (que espera al cobro).
    await waitFor(() => expect(m.listQueue).toHaveBeenCalledTimes(3));
    await act(async () => {});
    await act(async () => finish());
    const id = enqueued()[0].clientRequestId;
    expect(
      await screen.findByText(`${savedText(id)} Agregado: Playera Guess negro (M) · ×1`),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cobrar \$450/i })).toBeInTheDocument();
  });

  it("cobro que lanza por red con navigator.onLine false se encola con el mismo id y no bloquea", async () => {
    await onlineWithLine();
    m.createSaleAction.mockImplementation(async () => {
      online = false;
      throw new TypeError("Failed to fetch");
    });
    cobrar();
    await waitFor(() => expect(m.enqueueSale).toHaveBeenCalledTimes(1));
    const sentId = m.createSaleAction.mock.calls[0][0].clientRequestId;
    expect(enqueued()[0]).toMatchObject({ clientRequestId: sentId, userId: "u1", locationId: "l1", snapshotToken: "tok.sig" });
    expect(await screen.findByText(savedText(sentId))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar cobro" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar sin internet" })).toBeNull();
  });

  it("lie-fi: bloqueo incierto ofrece Guardar sin internet con el mismo id", async () => {
    await onlineWithLine();
    m.createSaleAction.mockRejectedValue(new TypeError("Failed to fetch"));
    cobrar();
    expect(await screen.findByRole("button", { name: "Reintentar cobro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ya revisé en Ventas: empezar otra venta" })).toBeInTheDocument();
    expect(m.enqueueSale).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar sin internet" }));
    await waitFor(() => expect(m.enqueueSale).toHaveBeenCalledTimes(1));
    const sentId = m.createSaleAction.mock.calls[0][0].clientRequestId;
    expect(enqueued()[0]).toMatchObject({ clientRequestId: sentId, userId: "u1" });
    expect(await screen.findByText(savedText(sentId))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar cobro" })).toBeNull();
    expect(screen.getByText("Agrega al menos una prenda para cobrar.")).toBeInTheDocument();
  });

  it("Guardar sin internet guarda el usuario que hizo el cobro en línea", async () => {
    const view = await onlineWithLine();
    m.createSaleAction.mockRejectedValue(new TypeError("Failed to fetch"));
    cobrar();
    await screen.findByRole("button", { name: "Guardar sin internet" });
    // La sesión cambia de usuario con el carrito bloqueado.
    m.session.current = {
      data: { user: { id: "u9", name: "Otro", role: "owner", locationId: null } },
      status: "authenticated",
    };
    m.getSnapshot.mockImplementation(async (loc: string) => stored(loc, H, [variant()], "u9"));
    m.getOfflineSnapshotAction.mockImplementation(async (loc: string) => {
      const { locationId, generatedAt, variants } = stored(loc, 0);
      return { ok: true, snapshot: { locationId, generatedAt, variants }, snapshotToken: "tok.u9" };
    });
    view.rerender(<POSPage />);
    // La copia que se usa es la del cajero actual.
    await waitFor(() => expect(m.saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({ userId: "u9" })));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Guardar sin internet" }));
    await waitFor(() => expect(m.enqueueSale).toHaveBeenCalledTimes(1));
    expect(enqueued()[0].userId).toBe("u1");
    expect(enqueued()[0].snapshotToken).toBe("tok.u9");
  });

  it("con lock conflict no aparece Guardar sin internet", async () => {
    await onlineWithLine();
    m.createSaleAction.mockResolvedValue({
      ok: false, code: "INVALID", reason: "request_conflict",
      message: "Este cobro ya se registró con otros datos. Revisa el carrito y vuelve a cobrar.",
    });
    cobrar();
    expect(await screen.findByText("Esta venta quedó bloqueada: verifica en Ventas antes de empezar otra.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar sin internet" })).toBeNull();
  });

  it("UNAVAILABLE mantiene el bloqueo actual", async () => {
    await onlineWithLine();
    m.createSaleAction.mockImplementation(async () => {
      online = false; // aunque se caiga la red, el servidor sí respondió
      return { ok: false, code: "UNAVAILABLE", message: "El servidor tardó en responder. Intenta cobrar de nuevo." };
    });
    cobrar();
    expect(await screen.findByRole("button", { name: "Reintentar cobro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar sin internet" })).toBeInTheDocument();
    expect(m.enqueueSale).not.toHaveBeenCalled();
  });

  it("tras un cobro en línea con éxito pide enviar la cola", async () => {
    await onlineWithLine();
    m.createSaleAction.mockResolvedValue({ ok: true, sale: { number: 77, status: "completed" } });
    cobrar();
    await screen.findByText("Venta #77 registrada");
    expect(m.sync.current.syncNow).toHaveBeenCalled();
  });

  it('"Sin código" sin internet busca en la copia local', async () => {
    offlineCold(identity(H), stored("l1"));
    render(<POSPage />);
    await screen.findByTestId("scanner");
    await snapshotRead();
    fireEvent.click(screen.getByRole("button", { name: "Sin código" }));
    fireEvent.change(screen.getByLabelText(/buscar producto registrado/i), { target: { value: "guess" } });
    fireEvent.click(await screen.findByRole("button", { name: /M\s+3 disponibles/ }));
    expect(await screen.findByText("Agregado: Playera Guess negro (M) · ×1")).toBeInTheDocument();
    expect(m.lookupCodeAction).not.toHaveBeenCalled();
  });
});

describe("/pos avisos de la cola", () => {
  const BANNER = "Sin internet. Las ventas se guardan en este teléfono y se envían solas al volver la conexión.";

  it("banda sin internet y edad de la copia", async () => {
    offlineCold(identity(H), stored("l1", 2 * H));
    render(<POSPage />);
    expect(await screen.findByText(BANNER)).toBeInTheDocument();
    expect(await screen.findByText("Precios y existencias de hace 2 h")).toBeInTheDocument();
  });

  it("con red no hay banda", async () => {
    ownerSession();
    render(<POSPage />);
    await screen.findByDisplayValue("Centro");
    expect(screen.queryByText(BANNER)).toBeNull();
  });

  it('"N por enviar" abre la hoja con las ventas', async () => {
    const pending = { ...queued("v1", 1), clientRequestId: "abcdef12-0000-4000-8000-000000000000" };
    m.sync.current = { ...m.sync.current, pendingCount: 1, items: [pending] };
    ownerSession();
    render(<POSPage />);
    await screen.findByDisplayValue("Centro");
    fireEvent.click(screen.getByRole("button", { name: "1 por enviar" }));
    const sheet = await screen.findByRole("dialog", { name: "Ventas guardadas en este teléfono" });
    expect(within(sheet).getByText("L-abcdef12")).toBeInTheDocument();
    expect(within(sheet).getByText("Por enviar")).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole("button", { name: "Enviar ahora" }));
    expect(m.sync.current.syncNow).toHaveBeenCalled();
  });

  it("owner descarta una venta que necesita atención", async () => {
    const bad = {
      ...queued("v1", 1), clientRequestId: "badbad12-0000-4000-8000-000000000000",
      state: "needs_attention" as const, lastError: "La tienda no corresponde.",
    };
    m.sync.current = { ...m.sync.current, needsAttention: [bad], items: [bad] };
    ownerSession();
    render(<POSPage />);
    await screen.findByDisplayValue("Centro");
    fireEvent.click(screen.getByRole("button", { name: "1 necesita atención" }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Descartar L-badbad12" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Sí, descartar" }));
    await waitFor(() => expect(m.discardQueued).toHaveBeenCalledWith(bad.clientRequestId));
    await waitFor(() => expect(m.sync.current.refresh).toHaveBeenCalled());
  });

  it("colaborador no puede descartar", async () => {
    const bad = { ...queued("v1", 1), state: "needs_attention" as const, lastError: "x" };
    m.sync.current = { ...m.sync.current, needsAttention: [bad], items: [bad] };
    offlineCold(identity(H), stored("l1"));
    render(<POSPage />);
    await screen.findByTestId("scanner");
    fireEvent.click(screen.getByRole("button", { name: "1 necesita atención" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).queryByRole("button", { name: /Descartar/ })).toBeNull();
  });

  it('resumen "3 ventas enviadas (#120, #121, #122). 1 quedó por aprobar del dueño."', async () => {
    m.sync.current = {
      ...m.sync.current,
      lastSummary: {
        sent: [
          { folio: "L-1", number: 120, review: false },
          { folio: "L-2", number: 121, review: true },
          { folio: "L-3", number: 122, review: false },
        ],
        failed: [],
        stoppedBy: null,
      },
    };
    ownerSession();
    render(<POSPage />);
    expect(
      await screen.findByText("3 ventas enviadas (#120, #121, #122). 1 quedó por aprobar del dueño."),
    ).toBeInTheDocument();
  });

  it('si alguna falla, aviso en rojo con "Avisa al dueño"', async () => {
    m.sync.current = {
      ...m.sync.current,
      lastSummary: { sent: [{ folio: "L-1", number: 120, review: false }], failed: [{ folio: "L-abc", message: "x" }], stoppedBy: null },
    };
    ownerSession();
    render(<POSPage />);
    const alert = await screen.findByText(/1 venta necesita atención\. Avisa al dueño\./);
    expect(alert).toHaveTextContent("1 venta enviada (#120). 1 venta necesita atención. Avisa al dueño.");
    expect(alert.closest("[role=alert]")).not.toBeNull();
  });

  it("sesión vencida al enviar: pide iniciar sesión", async () => {
    m.sync.current = {
      ...m.sync.current, pendingCount: 2,
      lastSummary: { sent: [], failed: [], stoppedBy: "session_expired" },
    };
    ownerSession();
    render(<POSPage />);
    const msg = await screen.findByText(/Inicia sesión para enviar 2 ventas/);
    expect(within(msg).getByRole("link", { name: "Iniciar sesión" })).toBeInTheDocument();
  });

  it("ventas de otro usuario: esperan a esa persona", async () => {
    m.sync.current = {
      ...m.sync.current, pendingCount: 1,
      lastSummary: { sent: [], failed: [], stoppedBy: "user_mismatch" },
    };
    ownerSession();
    render(<POSPage />);
    expect(
      await screen.findByText("Hay ventas de otro usuario en este teléfono. Se enviarán cuando esa persona inicie sesión."),
    ).toBeInTheDocument();
  });

  it("con red pero sin salida: avisa que se reintenta solo", async () => {
    m.sync.current = {
      ...m.sync.current, pendingCount: 1,
      lastSummary: { sent: [], failed: [], stoppedBy: "network" },
    };
    ownerSession();
    render(<POSPage />);
    expect(
      await screen.findByText("No se pudieron enviar las ventas guardadas. Se reintentará sola."),
    ).toBeInTheDocument();
  });

  it("falla del almacenamiento al enviar: avisa", async () => {
    m.sync.current = {
      ...m.sync.current, pendingCount: 1,
      lastSummary: { sent: [], failed: [], stoppedBy: "storage" },
    };
    ownerSession();
    render(<POSPage />);
    expect(
      await screen.findByText("No se pudo leer o guardar la cola de este teléfono. Se reintentará sola."),
    ).toBeInTheDocument();
  });

  it("sin red, una falla del almacenamiento local se avisa", async () => {
    const { OfflineStorageError, reportStorageError } = await import("@/lib/offline/db");
    offlineCold(identity(H), stored("l1"));
    render(<POSPage />);
    await screen.findByTestId("scanner");
    act(() => reportStorageError(new OfflineStorageError("unavailable", "x")));
    expect(
      await screen.findByText(
        "Este teléfono no pudo guardar datos sin internet (modo privado o sin espacio). Las ventas sin internet podrían no guardarse.",
      ),
    ).toBeInTheDocument();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
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
}));
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

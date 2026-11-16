import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_TIMEOUT_MS, fetchSessionUser, fetchSessionUserId } from "../session-user";

const respond = (body: unknown, status = 200) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("fetchSessionUserId", () => {
  it("devuelve el id del usuario de la sesión, sin caché", async () => {
    const f = respond({ user: { id: "u1", role: "owner" }, expires: "x" });
    await expect(fetchSessionUserId()).resolves.toBe("u1");
    expect(f).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({ cache: "no-store", credentials: "same-origin" }));
  });

  it.each([[{}], [null], [{ user: {} }], [{ user: { id: 7 } }], [{ user: { id: "" } }]])(
    "sin sesión (%j) → null", async (body) => {
      respond(body);
      await expect(fetchSessionUserId()).resolves.toBeNull();
    },
  );

  it("falla de red lanza (no es lo mismo que sin sesión)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchSessionUserId()).rejects.toThrow();
  });

  it("respuesta de error del servidor lanza", async () => {
    respond({}, 503);
    await expect(fetchSessionUserId()).rejects.toThrow();
  });

  it("por omisión espera 8 s", () => {
    expect(SESSION_TIMEOUT_MS).toBe(8_000);
  });

  it("si el servidor no responde, aborta la petición y lanza al vencer el plazo", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let signal: AbortSignal | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation((_u, init) => {
      signal = (init as RequestInit).signal ?? undefined;
      return new Promise<Response>(() => {}); // lie-fi: nunca responde ni respeta el abort
    });
    const p = fetchSessionUserId(1_000);
    const settled = vi.fn();
    p.then(settled, settled);
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).rejects.toThrow();
    expect(signal?.aborted).toBe(true);
  });

  it("con respuesta a tiempo no deja el temporizador pendiente", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    respond({ user: { id: "u1" } });
    await expect(fetchSessionUserId(1_000)).resolves.toBe("u1");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("fetchSessionUser", () => {
  it("devuelve id, rol y tienda de la sesión", async () => {
    respond({ user: { id: "u1", name: "Lolo", role: "manager", locationId: "l1" }, expires: "x" });
    await expect(fetchSessionUser()).resolves.toEqual({ id: "u1", role: "manager", locationId: "l1" });
  });

  it("sin tienda devuelve locationId null", async () => {
    respond({ user: { id: "u1", role: "owner" } });
    await expect(fetchSessionUser()).resolves.toEqual({ id: "u1", role: "owner", locationId: null });
  });

  it.each([[{}], [null], [{ user: { id: "u1" } }], [{ user: { id: "u1", role: "admin" } }], [{ user: { role: "owner" } }]])(
    "sin sesión válida (%j) → null", async (body) => {
      respond(body);
      await expect(fetchSessionUser()).resolves.toBeNull();
    },
  );

  it("falla de red lanza", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchSessionUser()).rejects.toThrow();
  });
});

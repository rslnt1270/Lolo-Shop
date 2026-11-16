import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSessionUserId } from "../session-user";

const respond = (body: unknown, status = 200) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));

afterEach(() => { vi.restoreAllMocks(); });

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
});

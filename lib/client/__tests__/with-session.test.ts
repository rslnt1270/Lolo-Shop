import { describe, it, expect } from "vitest";
import { isSessionResult, withSession } from "@/lib/client/with-session";
import { SESSION_EXPIRED_TEXT } from "@/lib/session-text";

describe("withSession", () => {
  it("undefined o null (redirección del middleware) → resultado SESSION con el texto único", () => {
    expect(withSession(undefined)).toEqual({ ok: false, code: "SESSION", message: SESSION_EXPIRED_TEXT });
    expect(withSession(null)).toEqual({ ok: false, code: "SESSION", message: SESSION_EXPIRED_TEXT });
  });
  it("una respuesta real pasa sin cambios", () => {
    const res = { ok: true as const, price: 10 };
    expect(withSession(res)).toBe(res);
  });
  it("isSessionResult reconoce el SESSION del helper y del servidor, y nada más", () => {
    expect(isSessionResult(withSession(undefined))).toBe(true);
    expect(isSessionResult({ ok: false, code: "SESSION", message: "x" })).toBe(true);
    expect(isSessionResult({ ok: false, code: "FORBIDDEN", message: "x" })).toBe(false);
    expect(isSessionResult({ ok: true })).toBe(false);
    expect(isSessionResult(undefined)).toBe(false);
  });
});

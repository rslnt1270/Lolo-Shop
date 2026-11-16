import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { signSnapshotToken, verifySnapshotToken } from "../snapshot-token";

// Secreto solo de prueba (no es el de ningún ambiente).
const TEST_SECRET = "test-only-snapshot-secret";
const claims = { userId: "u1", locationId: "B", generatedAt: "2026-11-12T10:00:00.000Z" };

beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", TEST_SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === "A" ? "B" : "A") + s.slice(i + 1);

describe("snapshot token", () => {
  it("token válido devuelve su generatedAt", () => {
    const t = signSnapshotToken(claims);
    expect(verifySnapshotToken(t, { userId: "u1", locationId: "B" })).toEqual({ generatedAt: claims.generatedAt });
  });

  it("no contiene el secreto", () => {
    const t = signSnapshotToken(claims);
    expect(t).not.toContain(TEST_SECRET);
    expect(Buffer.from(t.split(".")[0], "base64url").toString()).not.toContain(TEST_SECRET);
  });

  it("token de otro usuario o de otra tienda → null", () => {
    const t = signSnapshotToken(claims);
    expect(verifySnapshotToken(t, { userId: "u2", locationId: "B" })).toBeNull();
    expect(verifySnapshotToken(t, { userId: "u1", locationId: "A" })).toBeNull();
  });

  it("carga alterada (generatedAt más viejo) → null", () => {
    const t = signSnapshotToken(claims);
    const [, mac] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, generatedAt: "2026-11-06T10:00:00.000Z" })).toString("base64url");
    expect(verifySnapshotToken(`${forged}.${mac}`, { userId: "u1", locationId: "B" })).toBeNull();
  });

  it("firma alterada → null", () => {
    const t = signSnapshotToken(claims);
    expect(verifySnapshotToken(flip(t, t.length - 3), { userId: "u1", locationId: "B" })).toBeNull();
  });

  it("firmado con otro secreto → null", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "otro-secreto-de-prueba");
    const t = signSnapshotToken(claims);
    vi.stubEnv("NEXTAUTH_SECRET", TEST_SECRET);
    expect(verifySnapshotToken(t, { userId: "u1", locationId: "B" })).toBeNull();
  });

  it.each([[undefined], [null], [""], [42], ["sin-punto"], ["a.b.c"], ["x".repeat(5000)]])(
    "basura (%s) → null",
    (t) => {
      expect(verifySnapshotToken(t as unknown, { userId: "u1", locationId: "B" })).toBeNull();
    },
  );

  it("firma válida con generatedAt no ISO → null", () => {
    const t = signSnapshotToken({ ...claims, generatedAt: "ayer" });
    expect(verifySnapshotToken(t, { userId: "u1", locationId: "B" })).toBeNull();
  });

  it("sin NEXTAUTH_SECRET: firmar lanza sin revelar nada y verificar devuelve null", () => {
    const t = signSnapshotToken(claims);
    vi.stubEnv("NEXTAUTH_SECRET", "");
    expect(() => signSnapshotToken(claims)).toThrow("NEXTAUTH_SECRET");
    expect(verifySnapshotToken(t, { userId: "u1", locationId: "B" })).toBeNull();
  });
});

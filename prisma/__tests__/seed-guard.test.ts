// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const { upsert, create } = vi.hoisted(() => ({ upsert: vi.fn(), create: vi.fn() }));
vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => ({
    location: { upsert },
    user: { upsert },
    department: { upsert },
    product: { create },
    inventoryLevel: { create },
    variant: { findUnique: vi.fn() },
    $disconnect: vi.fn(),
  })),
}));

import { assertSeedAllowed } from "../seed";
import { isLocalDatabaseUrl } from "../local-db";

const passwords = {
  SEED_PASSWORD_LOLO: "a",
  SEED_PASSWORD_ENCARGADO: "b",
  SEED_PASSWORD_COLAB1: "c",
  SEED_PASSWORD_COLAB2: "d",
};
const asEnv = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
const localUrl = "postgresql://u:p@localhost:5432/x";

describe("assertSeedAllowed", () => {
  it("aborta en producción aunque la base sea local", () => {
    expect(() =>
      assertSeedAllowed(asEnv({ NODE_ENV: "production", DATABASE_URL: localUrl, ...passwords }), []),
    ).toThrow(/producción/);
  });

  it("aborta si la base no es local y no toca el cliente", () => {
    expect(() =>
      assertSeedAllowed(asEnv({ DATABASE_URL: "postgresql://u:p@db.ejemplo.invalid:5432/x", ...passwords }), []),
    ).toThrow(/no es local/);
    expect(upsert).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("permite base local con las cuatro contraseñas; --demo activa el producto demo", () => {
    const env = asEnv({ DATABASE_URL: localUrl, ...passwords });
    expect(assertSeedAllowed(env, [])).toEqual({ demo: false });
    expect(assertSeedAllowed(env, ["--demo"])).toEqual({ demo: true });
  });

  it("exige cada SEED_PASSWORD_* antes de escribir", () => {
    const { SEED_PASSWORD_COLAB2: _omit, ...rest } = passwords;
    expect(() => assertSeedAllowed(asEnv({ DATABASE_URL: localUrl, ...rest }), [])).toThrow(/SEED_PASSWORD_COLAB2/);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("isLocalDatabaseUrl", () => {
  it("reconoce ::1 entre corchetes", () => {
    expect(isLocalDatabaseUrl("postgresql://u:p@[::1]:5432/x")).toBe(true);
  });
  it("rechaza hosts remotos y URLs inválidas", () => {
    expect(isLocalDatabaseUrl("postgresql://u:p@db.ejemplo.invalid/x")).toBe(false);
    expect(isLocalDatabaseUrl("no es url")).toBe(false);
  });
});

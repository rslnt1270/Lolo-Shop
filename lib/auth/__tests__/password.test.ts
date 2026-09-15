import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: { user: { findUnique: mocks.findUnique, update: mocks.update } },
}));

import { changePassword, validateNewPassword } from "../password";

const HASH_ACTUAL = bcrypt.hashSync("Clave-Actual-01", 4);

describe("validateNewPassword", () => {
  it("rechaza contraseñas cortas", () => {
    expect(validateNewPassword("corta1")).toMatch(/10 caracteres/);
  });

  it("rechaza contraseñas sin letras y números", () => {
    expect(validateNewPassword("solamenteletras")).toMatch(/letras y números/);
    expect(validateNewPassword("1234567890123")).toMatch(/letras y números/);
  });

  it("acepta una frase-contraseña válida", () => {
    expect(validateNewPassword("Bosque-Limon-Tigre-42")).toBeNull();
  });
});

describe("changePassword", () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
    mocks.update.mockReset();
    mocks.findUnique.mockResolvedValue({ id: "u1", username: "lolo", password: HASH_ACTUAL });
  });

  it("guarda un hash bcrypt nuevo cuando la actual es correcta", async () => {
    const res = await changePassword("u1", "Clave-Actual-01", "Nueva-Clave-Fuerte-77");
    expect(res).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const { where, data } = mocks.update.mock.calls[0][0];
    expect(where).toEqual({ id: "u1" });
    expect(data.password).not.toBe("Nueva-Clave-Fuerte-77");
    expect(bcrypt.compareSync("Nueva-Clave-Fuerte-77", data.password)).toBe(true);
  });

  it("rechaza si la contraseña actual no coincide y no escribe nada", async () => {
    const res = await changePassword("u1", "equivocada", "Nueva-Clave-Fuerte-77");
    expect(res.ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rechaza una nueva contraseña débil sin escribir nada", async () => {
    const res = await changePassword("u1", "Clave-Actual-01", "debil");
    expect(res.ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rechaza reutilizar la misma contraseña", async () => {
    const res = await changePassword("u1", "Clave-Actual-01", "Clave-Actual-01");
    expect(res.ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("falla de forma segura si el usuario no existe", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const res = await changePassword("nadie", "x", "Nueva-Clave-Fuerte-77");
    expect(res.ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

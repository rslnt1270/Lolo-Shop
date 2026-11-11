import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const addColor = vi.fn();
const listColors = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("../colors", () => ({
  addColor: (...a: unknown[]) => addColor(...a),
  listColors: (...a: unknown[]) => listColors(...a),
}));

import { UnauthenticatedError } from "@/lib/auth/errors";
import { createColorAction, listColorsAction } from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "u1", role: "collaborator", locationId: "loc-1" });
  addColor.mockImplementation(async (raw: string) => ({ label: raw }));
  listColors.mockResolvedValue(["Negro", "Rosa"]);
});

describe("listColorsAction", () => {
  it("devuelve la lista con sesión y null sin ella", async () => {
    expect(await listColorsAction()).toEqual(["Negro", "Rosa"]);
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    expect(await listColorsAction()).toBeNull();
  });
});

describe("createColorAction", () => {
  it("cualquier rol crea un color y recibe la etiqueta", async () => {
    addColor.mockResolvedValue({ label: "Turquesa" });
    expect(await createColorAction("turquesas")).toEqual({ ok: true, label: "Turquesa" });
    expect(addColor).toHaveBeenCalledWith("Turquesas", "u1");
  });
  it("sin sesión responde con el texto de sesión y no escribe", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    expect(await createColorAction("Rosa")).toEqual({ ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión." });
    expect(addColor).not.toHaveBeenCalled();
  });
  it("review: vacío, emoji o solo espacios se rechaza sin escribir", async () => {
    for (const raw of ["", "   ", "🔥", "<>"]) {
      expect(await createColorAction(raw)).toEqual({ ok: false, message: "Escribe un color." });
    }
    expect(await createColorAction(undefined as unknown as string)).toEqual({ ok: false, message: "Escribe un color." });
    expect(addColor).not.toHaveBeenCalled();
  });
  it("color largo se rechaza con mensaje claro", async () => {
    expect(await createColorAction("a".repeat(201))).toEqual({ ok: false, message: "El color es demasiado largo." });
    expect(await createColorAction("a".repeat(41))).toEqual({ ok: false, message: "El color puede tener máximo 40 caracteres." });
    expect(addColor).not.toHaveBeenCalled();
  });
});

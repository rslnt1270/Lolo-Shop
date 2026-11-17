import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const source = { listSalesForReview: vi.fn(), approveReview: vi.fn(), rejectReview: vi.fn() };
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/data/get-sales-source", () => ({ getSalesSource: () => source }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { approveReviewAction, listReviewAction, rejectReviewAction } from "../review-actions";
import { UnauthenticatedError } from "@/lib/auth/errors";
import { SalesRuleError } from "@/lib/data/errors";
import { revalidatePath } from "next/cache";

const asRole = (role: string) => getCurrentUser.mockResolvedValue({ id: "u1", role, locationId: null });
const FORBIDDEN = { ok: false, code: "FORBIDDEN", message: "Solo el dueño aprueba ventas sin internet." };

beforeEach(() => {
  vi.clearAllMocks();
  asRole("owner");
});

describe("review-actions: solo dueño", () => {
  it.each(["manager", "collaborator"])("%s recibe FORBIDDEN", async (role) => {
    asRole(role);
    await expect(approveReviewAction("s1")).resolves.toEqual(FORBIDDEN);
    await expect(rejectReviewAction("s1", "x", true)).resolves.toEqual(FORBIDDEN);
    await expect(listReviewAction()).resolves.toEqual([]);
    expect(source.approveReview).not.toHaveBeenCalled();
    expect(source.rejectReview).not.toHaveBeenCalled();
    expect(source.listSalesForReview).not.toHaveBeenCalled();
  });

  it("rol releído de la BD (JWT dice owner, BD dice manager → FORBIDDEN)", async () => {
    // getCurrentUser ya devuelve el rol de la BD; la acción no mira el JWT.
    asRole("manager");
    await expect(approveReviewAction("s1")).resolves.toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(getCurrentUser).toHaveBeenCalled();
  });

  it("sesión vencida: session_expired sin tocar la BD", async () => {
    getCurrentUser.mockRejectedValue(new UnauthenticatedError());
    await expect(approveReviewAction("s1")).resolves.toMatchObject({ ok: false, reason: "session_expired" });
    await expect(rejectReviewAction("s1", "x", true)).resolves.toMatchObject({ ok: false, reason: "session_expired" });
    await expect(listReviewAction()).resolves.toBeNull();
    expect(source.approveReview).not.toHaveBeenCalled();
  });

  it("otro error al leer el usuario se propaga", async () => {
    getCurrentUser.mockRejectedValue(new Error("db caída"));
    await expect(listReviewAction()).rejects.toThrow("db caída");
  });
});

describe("listReviewAction", () => {
  it("el dueño recibe la lista", async () => {
    source.listSalesForReview.mockResolvedValue([{ saleId: "s1" }]);
    await expect(listReviewAction()).resolves.toEqual([{ saleId: "s1" }]);
  });
});

describe("approveReviewAction", () => {
  it("aprueba con el usuario y la nota recortada", async () => {
    source.approveReview.mockResolvedValue({ id: "s1" });
    const res = await approveReviewAction("s1", "  ok  ");
    expect(res).toEqual({ ok: true, sale: { id: "s1" } });
    expect(source.approveReview).toHaveBeenCalledWith("s1", "u1", "ok");
    expect(revalidatePath).toHaveBeenCalledWith("/ventas");
    expect(revalidatePath).toHaveBeenCalledWith("/ventas/revision");
  });
  it("nota vacía se manda como undefined", async () => {
    source.approveReview.mockResolvedValue({ id: "s1" });
    await approveReviewAction("s1", "   ");
    expect(source.approveReview).toHaveBeenCalledWith("s1", "u1", undefined);
  });
  it("id no válido o nota de más de 200 → INVALID", async () => {
    await expect(approveReviewAction("")).resolves.toMatchObject({ ok: false, code: "INVALID" });
    await expect(approveReviewAction("s1", "x".repeat(201))).resolves.toMatchObject({ ok: false, code: "INVALID" });
    expect(source.approveReview).not.toHaveBeenCalled();
  });
  it("venta que ya no está pendiente → INVALID con el mensaje de la regla", async () => {
    source.approveReview.mockRejectedValue(new SalesRuleError("Esta venta ya no está por aprobar."));
    await expect(approveReviewAction("s1")).resolves.toEqual({
      ok: false,
      code: "INVALID",
      message: "Esta venta ya no está por aprobar.",
    });
  });
});

describe("rejectReviewAction", () => {
  it("rechazo sin motivo → INVALID", async () => {
    await expect(rejectReviewAction("s1", "  ", true)).resolves.toMatchObject({ ok: false, code: "INVALID" });
    expect(source.rejectReview).not.toHaveBeenCalled();
  });
  it("motivo de más de 200 → INVALID", async () => {
    await expect(rejectReviewAction("s1", "x".repeat(201), true)).resolves.toMatchObject({ ok: false, code: "INVALID" });
  });
  it("itemsReturned no booleano → INVALID", async () => {
    await expect(rejectReviewAction("s1", "motivo", "yes" as unknown as boolean)).resolves.toMatchObject({
      ok: false,
      code: "INVALID",
    });
    expect(source.rejectReview).not.toHaveBeenCalled();
  });
  it("rechaza con motivo recortado y devolución", async () => {
    source.rejectReview.mockResolvedValue({ id: "s1" });
    const res = await rejectReviewAction("s1", " no la vendimos ", false);
    expect(res).toEqual({ ok: true, sale: { id: "s1" } });
    expect(source.rejectReview).toHaveBeenCalledWith("s1", "u1", "no la vendimos", false);
  });
});

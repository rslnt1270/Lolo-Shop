import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const session = vi.hoisted(() => ({ value: { data: { user: { role: "owner" } }, status: "authenticated" } as { data: unknown; status: string } }));
vi.mock("next-auth/react", () => ({ useSession: () => session.value }));
const actions = vi.hoisted(() => ({ listReviewAction: vi.fn(), approveReviewAction: vi.fn(), rejectReviewAction: vi.fn() }));
vi.mock("@/lib/sales/review-actions", () => actions);

import RevisionPage from "@/app/ventas/revision/page";

beforeEach(() => {
  vi.clearAllMocks();
  session.value = { data: { user: { role: "owner" } }, status: "authenticated" };
  actions.listReviewAction.mockResolvedValue([]);
});

describe("/ventas/revision", () => {
  it("el dueño ve la lista", async () => {
    render(<RevisionPage />);
    expect(await screen.findByText("No hay ventas sin internet por aprobar.")).toBeInTheDocument();
  });
  it("otro rol ve el aviso y no consulta la lista", async () => {
    session.value = { data: { user: { role: "manager" } }, status: "authenticated" };
    render(<RevisionPage />);
    expect(await screen.findByText("Solo el dueño aprueba ventas sin internet.")).toBeInTheDocument();
    expect(actions.listReviewAction).not.toHaveBeenCalled();
  });
  it("sesión vencida (null)", async () => {
    actions.listReviewAction.mockResolvedValue(null);
    render(<RevisionPage />);
    expect(await screen.findByText(/Tu sesión terminó/)).toBeInTheDocument();
  });
});

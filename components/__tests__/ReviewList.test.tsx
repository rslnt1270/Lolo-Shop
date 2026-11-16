import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const actions = vi.hoisted(() => ({ approveReviewAction: vi.fn(), rejectReviewAction: vi.fn() }));
vi.mock("@/lib/sales/review-actions", () => actions);

import { ReviewList } from "@/components/sales/ReviewList";
import { REVIEW_REASON_TEXT } from "@/lib/domain/offline-sale";
import type { ReviewItem } from "@/lib/data/sales-source";

const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({
  saleId: "s1",
  number: 41,
  locationId: "l1",
  locationName: "Centro",
  cashierName: "Ana",
  soldAt: "2026-11-12T18:00:00.000Z",
  createdAt: "2026-11-12T19:00:00.000Z",
  total: 700,
  paymentMethod: "cash",
  reasons: ["insufficient_stock", "price_unverified", "inactive_product", "clock_skew"],
  lines: [
    { variantId: "v1", productTitle: "Playera", size: "M", quantity: 3, shortfall: 1, unitPrice: 200 },
    { variantId: "v2", productTitle: "Short", size: "G", quantity: 1, shortfall: 0, unitPrice: 100 },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  actions.approveReviewAction.mockResolvedValue({ ok: true, sale: {} });
  actions.rejectReviewAction.mockResolvedValue({ ok: true, sale: {} });
});

describe("ReviewList", () => {
  it("muestra razones con REVIEW_REASON_TEXT y el faltante por renglón", () => {
    render(<ReviewList items={[item()]} onChanged={() => {}} />);
    expect(screen.getByText("Faltó stock: 1 pieza de Playera M")).toBeInTheDocument();
    for (const r of ["price_unverified", "inactive_product", "clock_skew"] as const) {
      expect(screen.getByText(REVIEW_REASON_TEXT[r])).toBeInTheDocument();
    }
    expect(screen.getByText(/se envió otro día o la copia de precios era vieja/)).toBeInTheDocument();
    expect(screen.getByText(/Folio 41|#41/)).toBeInTheDocument();
    expect(screen.getByText(/Centro/)).toBeInTheDocument();
    expect(screen.getByText(/Ana/)).toBeInTheDocument();
  });

  it("pluraliza las piezas", () => {
    const it2 = item({
      reasons: ["insufficient_stock"],
      lines: [{ variantId: "v1", productTitle: "Playera", size: "M", quantity: 3, shortfall: 2, unitPrice: 200 }],
    });
    render(<ReviewList items={[it2]} onChanged={() => {}} />);
    expect(screen.getByText("Faltó stock: 2 piezas de Playera M")).toBeInTheDocument();
  });

  it("sin renglón con faltante, insufficient_stock cae al texto general", () => {
    const it2 = item({
      reasons: ["insufficient_stock"],
      lines: [{ variantId: "v1", productTitle: "Playera", size: "M", quantity: 1, shortfall: 0, unitPrice: 200 }],
    });
    render(<ReviewList items={[it2]} onChanged={() => {}} />);
    expect(screen.getByText(REVIEW_REASON_TEXT.insufficient_stock)).toBeInTheDocument();
  });

  it("lista vacía", () => {
    render(<ReviewList items={[]} onChanged={() => {}} />);
    expect(screen.getByText("No hay ventas sin internet por aprobar.")).toBeInTheDocument();
  });

  it("Aprobar llama a la acción con la nota y recarga", async () => {
    const onChanged = vi.fn();
    render(<ReviewList items={[item()]} onChanged={onChanged} />);
    fireEvent.change(screen.getByLabelText("Nota (opcional)"), { target: { value: "ya revisé" } });
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    await waitFor(() => expect(actions.approveReviewAction).toHaveBeenCalledWith("s1", "ya revisé"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("Rechazar pide motivo y '¿La prenda regresó a la tienda?' sin llamar todavía", () => {
    render(<ReviewList items={[item()]} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(screen.getByLabelText("Motivo del rechazo")).toBeInTheDocument();
    expect(screen.getByText("¿La prenda regresó a la tienda?")).toBeInTheDocument();
    expect(actions.rejectReviewAction).not.toHaveBeenCalled();
  });

  it("no confirma el rechazo sin motivo ni sin respuesta", async () => {
    render(<ReviewList items={[item()]} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
    expect(await screen.findByText("Escribe el motivo del rechazo.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Motivo del rechazo"), { target: { value: "no existe" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
    expect(await screen.findByText("Indica si la prenda regresó a la tienda.")).toBeInTheDocument();
    expect(actions.rejectReviewAction).not.toHaveBeenCalled();
  });

  it("confirma el rechazo con motivo y devolución", async () => {
    const onChanged = vi.fn();
    render(<ReviewList items={[item()]} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    fireEvent.change(screen.getByLabelText("Motivo del rechazo"), { target: { value: " no existe " } });
    fireEvent.click(screen.getByLabelText("Sí"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
    await waitFor(() => expect(actions.rejectReviewAction).toHaveBeenCalledWith("s1", "no existe", true));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("muestra el error de la acción y la sesión vencida con enlace", async () => {
    actions.approveReviewAction.mockResolvedValueOnce({ ok: false, code: "INVALID", message: "Esta venta ya no está por aprobar." });
    render(<ReviewList items={[item()]} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esta venta ya no está por aprobar.");
    actions.approveReviewAction.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    await waitFor(() =>
      expect(within(screen.getByRole("alert")).getByRole("link", { name: /iniciar sesión/i })).toHaveAttribute("href", "/login"),
    );
  });
});

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { QueuedSale } from "@/lib/offline/db";
import { OfflineQueueSheet } from "@/components/sales/OfflineQueueSheet";

const ID = (c: string) => `${c.repeat(8)}-0000-4000-8000-000000000000`;

const sale = (c: string, over: Partial<QueuedSale> = {}): QueuedSale => ({
  clientRequestId: ID(c),
  userId: "u1",
  locationId: "l1",
  channel: "store",
  paymentMethod: "cash",
  lines: [{ variantId: "v1", quantity: 2, unitPrice: 450, sku: "S", productTitle: "Playera", variantTitle: "M" }],
  total: 900,
  soldAt: "2026-11-12T18:05:00.000Z",
  snapshotAt: "2026-11-12T17:00:00.000Z",
  snapshotToken: "tok.sig",
  state: "pending",
  attempts: 0,
  ...over,
});

const items = [
  sale("a"),
  sale("b", { state: "sending" }),
  sale("c", { state: "synced", saleNumber: 123, review: false }),
  sale("d", { state: "synced", saleNumber: 124, review: true }),
  sale("e", { state: "needs_attention", lastError: "La tienda no corresponde." }),
];

const row = (c: string) => screen.getByText(`L-${c.repeat(8)}`).closest("li")!;

describe("OfflineQueueSheet", () => {
  it("cada venta con folio local, total y estado", () => {
    render(<OfflineQueueSheet items={items} canDiscard={false} onDiscard={vi.fn()} onSyncNow={vi.fn()} />);
    expect(within(row("a")).getByText("Por enviar")).toBeInTheDocument();
    expect(within(row("a")).getByText("$900")).toBeInTheDocument();
    expect(within(row("b")).getByText("Enviando")).toBeInTheDocument();
    expect(within(row("c")).getByText("Enviada #123")).toBeInTheDocument();
    expect(within(row("d")).getByText("Enviada, por aprobar")).toBeInTheDocument();
    expect(within(row("e")).getByText("Necesita atención: La tienda no corresponde.")).toBeInTheDocument();
  });

  it("Enviar ahora llama onSyncNow", () => {
    const onSyncNow = vi.fn();
    render(<OfflineQueueSheet items={items} canDiscard={false} onDiscard={vi.fn()} onSyncNow={onSyncNow} />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar ahora" }));
    expect(onSyncNow).toHaveBeenCalled();
  });

  it("colaborador no ve Descartar", () => {
    render(<OfflineQueueSheet items={items} canDiscard={false} onDiscard={vi.fn()} onSyncNow={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Descartar/ })).toBeNull();
  });

  it("owner o manager: Descartar solo en las que necesitan atención y con confirmación", async () => {
    const onDiscard = vi.fn().mockResolvedValue(true);
    render(<OfflineQueueSheet items={items} canDiscard onDiscard={onDiscard} onSyncNow={vi.fn()} />);
    expect(within(row("a")).queryByRole("button", { name: /Descartar/ })).toBeNull();
    expect(within(row("c")).queryByRole("button", { name: /Descartar/ })).toBeNull();
    fireEvent.click(within(row("e")).getByRole("button", { name: "Descartar L-eeeeeeee" }));
    expect(onDiscard).not.toHaveBeenCalled();
    expect(within(row("e")).getByText(/no se enviará/i)).toBeInTheDocument();
    fireEvent.click(within(row("e")).getByRole("button", { name: "Cancelar" }));
    expect(onDiscard).not.toHaveBeenCalled();
    fireEvent.click(within(row("e")).getByRole("button", { name: "Descartar L-eeeeeeee" }));
    fireEvent.click(within(row("e")).getByRole("button", { name: "Sí, descartar" }));
    await waitFor(() => expect(onDiscard).toHaveBeenCalledWith(ID("e")));
  });

  it("si no se pudo descartar lo avisa", async () => {
    const onDiscard = vi.fn().mockResolvedValue(false);
    render(<OfflineQueueSheet items={items} canDiscard onDiscard={onDiscard} onSyncNow={vi.fn()} />);
    fireEvent.click(within(row("e")).getByRole("button", { name: "Descartar L-eeeeeeee" }));
    fireEvent.click(within(row("e")).getByRole("button", { name: "Sí, descartar" }));
    expect(await within(row("e")).findByText("No se pudo descartar. Intenta de nuevo.")).toBeInTheDocument();
  });

  it("sin ventas lo dice", () => {
    render(<OfflineQueueSheet items={[]} canDiscard onDiscard={vi.fn()} onSyncNow={vi.fn()} />);
    expect(screen.getByText("No hay ventas guardadas en este teléfono.")).toBeInTheDocument();
  });
});

describe("OfflineQueueSheet: ventas de otro usuario", () => {
  const mine = sale("a", { userId: "u1" });
  const other = sale("f", { userId: "u2" });
  const otherSending = sale("g", { userId: "u2", state: "sending" });

  it("owner o manager descartan pending de otro usuario con confirmación; la propia y sending no", async () => {
    const onDiscard = vi.fn().mockResolvedValue(true);
    render(
      <OfflineQueueSheet items={[mine, other, otherSending]} canDiscard currentUserId="u1" onDiscard={onDiscard} onSyncNow={vi.fn()} />,
    );
    expect(within(row("a")).queryByRole("button", { name: /Descartar/ })).toBeNull();
    expect(within(row("g")).queryByRole("button", { name: /Descartar/ })).toBeNull();
    fireEvent.click(within(row("f")).getByRole("button", { name: "Descartar L-ffffffff" }));
    expect(within(row("f")).getByText(/otro usuario/i)).toBeInTheDocument();
    expect(onDiscard).not.toHaveBeenCalled();
    fireEvent.click(within(row("f")).getByRole("button", { name: "Sí, descartar" }));
    await waitFor(() => expect(onDiscard).toHaveBeenCalledWith(ID("f")));
  });

  it("colaborador no descarta pending de otro usuario", () => {
    render(
      <OfflineQueueSheet items={[mine, other]} canDiscard={false} currentUserId="u1" onDiscard={vi.fn()} onSyncNow={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /Descartar/ })).toBeNull();
  });

  it("sin usuario actual conocido no ofrece descartar pending", () => {
    render(<OfflineQueueSheet items={[other]} canDiscard onDiscard={vi.fn()} onSyncNow={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Descartar/ })).toBeNull();
  });
});

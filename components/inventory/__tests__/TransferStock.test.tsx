import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const transfer = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions", () => ({ transferStockAction: transfer }));

import { TransferStock } from "@/components/inventory/TransferStock";

const locations = [
  { id: "l1", name: "Lomas" },
  { id: "l2", name: "Club Alva" },
  { id: "l3", name: "Almacén" },
];

function setup(over: Partial<React.ComponentProps<typeof TransferStock>> = {}) {
  const onDone = vi.fn();
  render(
    <TransferStock
      variantId="v1"
      title="Playera lisa"
      size="M"
      inventory={[{ locationId: "l1", available: 3 }, { locationId: "l2", available: 1 }, { locationId: "l3", available: 0 }]}
      locations={locations}
      defaultFrom="l1"
      online
      onDone={onDone}
      {...over}
    />,
  );
  return { onDone };
}
const options = (label: string) =>
  within(screen.getByLabelText(label)).getAllByRole("option").map((o) => o.textContent);

beforeEach(() => transfer.mockReset());
afterEach(cleanup);

describe("TransferStock", () => {
  it("el origen sin piezas no aparece y el destino excluye al origen", () => {
    setup();
    expect(options("De")).toEqual(["Lomas", "Club Alva"]);
    expect((screen.getByLabelText("De") as HTMLSelectElement).value).toBe("l1");
    expect(options("A")).toEqual(["Club Alva", "Almacén"]);
  });

  it("si defaultFrom no tiene piezas, usa la primera tienda con piezas", () => {
    setup({ defaultFrom: "l3" });
    expect((screen.getByLabelText("De") as HTMLSelectElement).value).toBe("l1");
  });

  it("el botón dice 'Traspasar 2 piezas' y '1 pieza'", () => {
    setup();
    expect(screen.getByRole("button", { name: "Traspasar 1 pieza" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Piezas"), { target: { value: "2" } });
    expect(screen.getByRole("button", { name: "Traspasar 2 piezas" })).toBeTruthy();
  });

  it("doble toque manda un solo requestId y los reintentos lo conservan", async () => {
    let release: (v: unknown) => void = () => {};
    transfer.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    setup();
    const btn = screen.getByRole("button", { name: "Traspasar 1 pieza" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(transfer).toHaveBeenCalledTimes(1);
    release({ ok: false, code: "ERROR", message: "Tiempo agotado." });
    await screen.findByText("Tiempo agotado.");
    transfer.mockResolvedValueOnce({ ok: false, code: "ERROR", message: "Otra vez." });
    fireEvent.click(screen.getByRole("button", { name: "Traspasar 1 pieza" }));
    await screen.findByText("Otra vez.");
    expect(transfer.mock.calls[1][0].requestId).toBe(transfer.mock.calls[0][0].requestId);
  });

  it("cambiar piezas renueva el requestId", async () => {
    transfer.mockResolvedValue({ ok: false, code: "ERROR", message: "Falló." });
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Traspasar 1 pieza" }));
    await screen.findByText("Falló.");
    fireEvent.change(screen.getByLabelText("Piezas"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Traspasar 2 piezas" }));
    await waitFor(() => expect(transfer).toHaveBeenCalledTimes(2));
    expect(transfer.mock.calls[1][0].requestId).not.toBe(transfer.mock.calls[0][0].requestId);
  });

  it("INSUFFICIENT muestra el mensaje tal cual", async () => {
    transfer.mockResolvedValue({ ok: false, code: "INSUFFICIENT", message: "Solo hay 1 en Club Alva.", available: 1 });
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Traspasar 1 pieza" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Solo hay 1 en Club Alva.");
  });

  it("sin red el botón está deshabilitado con el texto", () => {
    setup({ online: false });
    const btn = screen.getByRole("button", { name: "Conéctate para traspasar" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("éxito: manda los datos, muestra el mensaje y llama a onDone", async () => {
    transfer.mockResolvedValue({
      ok: true, replayed: false, fromAvailable: 1, toAvailable: 3,
      message: "Traspasadas 2 piezas de Lomas a Club Alva. Ahora: Lomas 1 · Club Alva 3.",
    });
    const { onDone } = setup();
    fireEvent.change(screen.getByLabelText("Piezas"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "Surtido" } });
    fireEvent.click(screen.getByRole("button", { name: "Traspasar 2 piezas" }));
    await screen.findByText("Traspasadas 2 piezas de Lomas a Club Alva. Ahora: Lomas 1 · Club Alva 3.");
    expect(transfer).toHaveBeenCalledWith(expect.objectContaining({
      variantId: "v1", fromLocationId: "l1", toLocationId: "l2", quantity: 2, reason: "Surtido",
    }));
    expect(onDone).toHaveBeenCalledWith({ fromAvailable: 1, toAvailable: 3 });
  });

  it("sin piezas en ninguna tienda no hay formulario", () => {
    setup({ inventory: [{ locationId: "l1", available: 0 }] });
    expect(screen.getByText("No hay piezas de esta talla para traspasar.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /traspasar/i })).toBeNull();
  });
});

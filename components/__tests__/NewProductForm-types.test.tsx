import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const createProductAction = vi.fn();
vi.mock("@/lib/actions", () => ({
  createProductAction: (...a: unknown[]) => createProductAction(...a),
  uploadProductImageAction: vi.fn(),
}));
vi.mock("@/lib/catalog/actions", () => ({
  listBrandsAction: vi.fn().mockResolvedValue([{ id: "b1", name: "Lolo", slug: "lolo" }]),
  createBrandAction: vi.fn(),
  listDepartmentsAction: vi.fn().mockResolvedValue([
    { id: "d1", slug: "dama", name: "Dama" },
    { id: "d4", slug: "calzado", name: "Calzado" },
  ]),
  listProductTypesAction: vi.fn().mockResolvedValue([
    { id: "t1", slug: "playera", name: "Playeras", departmentIds: ["d1"] },
    { id: "t2", slug: "tenis", name: "Tenis", departmentIds: ["d4"] },
  ]),
}));
vi.mock("../products/ProductPhotoCapture", () => ({ ProductPhotoCapture: () => <div /> }));

import { NewProductForm } from "../products/NewProductForm";

async function setup() {
  render(<NewProductForm scannedCode="750100" locationId="loc-1" onSuccess={vi.fn()} onCancel={vi.fn()} />);
  await screen.findByRole("option", { name: "Dama" });
}
async function fillBase() {
  fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Playera Básica" } });
  fireEvent.change(screen.getByRole("combobox", { name: /marca/i }), { target: { value: "Lolo" } });
  fireEvent.mouseDown(await screen.findByRole("option", { name: "Lolo" }));
  fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "299" } });
}
const dept = (v: string) => fireEvent.change(screen.getByLabelText("Departamento"), { target: { value: v } });

describe("NewProductForm: tipo, estilo y para", () => {
  beforeEach(() => {
    createProductAction.mockReset().mockResolvedValue({ ok: true, product: { imageUrl: null }, variantId: "v", sku: "S" });
  });

  it("Tipo está desactivado sin departamento", async () => {
    await setup();
    expect(screen.getByLabelText("Tipo")).toBeDisabled();
  });

  it("Tipo ofrece solo los tipos del departamento elegido", async () => {
    await setup();
    dept("d1");
    const sel = screen.getByLabelText("Tipo");
    expect(within(sel).getByRole("option", { name: "Playeras" })).toBeInTheDocument();
    expect(within(sel).queryByRole("option", { name: "Tenis" })).toBeNull();
  });

  it("Para aparece solo en Calzado y tiene 3 radios", async () => {
    await setup();
    dept("d1");
    expect(screen.queryByRole("radio", { name: "Dama" })).toBeNull();
    dept("d4");
    expect(screen.getAllByRole("radio").filter((r) => (r as HTMLInputElement).name.endsWith("-para"))).toHaveLength(3);
  });

  it("guardar en Calzado sin Para muestra 'En Calzado elige para quién es…' y no llama a createProductAction", async () => {
    await setup();
    await fillBase();
    dept("d4");
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "t2" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));
    expect(await screen.findByText(/En Calzado elige para quién es/)).toBeInTheDocument();
    expect(createProductAction).not.toHaveBeenCalled();
  });

  it("cambiar de Dama a Calzado borra el tipo y muestra 'El tipo se borró porque no aplica a Calzado.'", async () => {
    await setup();
    dept("d1");
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "t1" } });
    dept("d4");
    expect(screen.getByLabelText("Tipo")).toHaveValue("");
    expect(screen.getByText("El tipo se borró porque no aplica a Calzado.")).toBeInTheDocument();
  });

  it("el payload lleva productTypeId, style y audience y no lleva category", async () => {
    await setup();
    await fillBase();
    dept("d4");
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "t2" } });
    fireEvent.click(screen.getByRole("radio", { name: "Niño" }));
    fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));
    await waitFor(() => expect(createProductAction).toHaveBeenCalled());
    const payload = createProductAction.mock.calls[0][0];
    expect(payload).toMatchObject({ productTypeId: "t2", style: null, audience: "nino", departmentId: "d4" });
    expect("category" in payload).toBe(false);
  });
});

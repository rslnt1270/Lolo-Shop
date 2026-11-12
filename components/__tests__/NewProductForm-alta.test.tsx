import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const createProductAction = vi.fn();
const uploadProductImageAction = vi.fn();
vi.mock("@/lib/actions", () => ({
  createProductAction: (...a: unknown[]) => createProductAction(...a),
  uploadProductImageAction: (...a: unknown[]) => uploadProductImageAction(...a),
}));

const createColorAction = vi.fn();
vi.mock("@/lib/catalog/actions", () => ({
  listBrandsAction: vi.fn().mockResolvedValue([{ id: "b1", name: "ALO", slug: "alo" }]),
  createBrandAction: vi.fn(),
  listDepartmentsAction: vi.fn().mockResolvedValue([
    { id: "d1", slug: "dama", name: "Dama" },
    { id: "d2", slug: "accesorios", name: "Accesorios" },
    { id: "d4", slug: "calzado", name: "Calzado" },
  ]),
  listProductTypesAction: vi.fn().mockResolvedValue([
    { id: "t1", slug: "playera", name: "Playeras", departmentIds: ["d1"] },
    { id: "t3", slug: "perfume", name: "Perfume", departmentIds: ["d1"] },
    { id: "t4", slug: "gorra", name: "Gorra", departmentIds: ["d2"] },
    { id: "t2", slug: "tenis", name: "Tenis", departmentIds: ["d4"] },
  ]),
  listColorsAction: vi.fn().mockResolvedValue(["Negro", "Rosa"]),
  createColorAction: (...a: unknown[]) => createColorAction(...a),
}));

const photoSize = { bytes: 0 };
vi.mock("../products/ProductPhotoCapture", () => ({
  ProductPhotoCapture: ({ side, onCapture }: { side?: string; onCapture: (f: File) => void }) => (
    <button
      type="button"
      onClick={() => {
        const f = new File(["x"], `${side}.jpg`, { type: "image/jpeg" });
        if (photoSize.bytes) Object.defineProperty(f, "size", { value: photoSize.bytes });
        onCapture(f);
      }}
    >
      capturar {side}
    </button>
  ),
}));

import { NewProductForm } from "../products/NewProductForm";
import { ManualCodeEntry } from "../inventory/ManualCodeEntry";

const FRONT = "https://x.public.blob.vercel-storage.com/productos/f.jpg";
const BACK = "https://x.public.blob.vercel-storage.com/productos/b.jpg";
const OK = { ok: true, product: { imageUrl: null }, variantId: "v", sku: "S", catalogStatus: "Solo stock" };

const online = vi.spyOn(window.navigator, "onLine", "get");

const mount = (props = {}) => {
  const onSuccess = vi.fn();
  render(
    <NewProductForm scannedCode="4006381333931" locationId="loc-1" locationName="Centro" onSuccess={onSuccess} onCancel={vi.fn()} {...props} />,
  );
  return { onSuccess };
};
const dept = async (v: string) => {
  await screen.findByRole("option", { name: "Dama" });
  fireEvent.change(screen.getByLabelText("Departamento"), { target: { value: v } });
};
const pickBrand = async (name = "ALO") => {
  fireEvent.change(screen.getByRole("combobox", { name: /marca/i }), { target: { value: name } });
  fireEvent.mouseDown(await screen.findByRole("option", { name }));
};
async function fillAll({ withBrand = true, mode = "stock" as "stock" | "catalog" } = {}) {
  if (mode === "catalog") fireEvent.click(screen.getByRole("radio", { name: "Para catálogo" }));
  fireEvent.change(screen.getByLabelText(/descripción/i), { target: { value: "Algodón suave" } });
  await dept("d1");
  fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "t1" } });
  if (withBrand) await pickBrand();
  fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "299" } });
}
const save = () => fireEvent.click(screen.getByRole("button", { name: /guardar producto/i }));
const follows = (a: Element, b: Element) => expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

beforeEach(() => {
  createProductAction.mockReset().mockResolvedValue(OK);
  uploadProductImageAction.mockReset().mockResolvedValueOnce({ ok: true, url: FRONT }).mockResolvedValueOnce({ ok: true, url: BACK });
  createColorAction.mockReset();
  online.mockReturnValue(true);
});

describe("NewProductForm (alta): orden y referencia", () => {
  it('C5: "¿Va al catálogo?" aparece antes que departamento, tipo y marca', () => {
    mount();
    const decision = screen.getByRole("group", { name: /va al catálogo/i });
    follows(decision, screen.getByLabelText("Departamento"));
    follows(decision, screen.getByLabelText("Tipo"));
    follows(decision, screen.getByRole("combobox", { name: /marca/i }));
  });

  it("review: el orden es decisión, fotos, descripción, departamento, tipo, marca, color, título y tallas", () => {
    mount({ initialMode: "catalog" });
    const chain = [
      screen.getByRole("group", { name: /va al catálogo/i }),
      screen.getByRole("region", { name: /fotos del producto/i }),
      screen.getByLabelText(/descripción/i),
      screen.getByLabelText("Departamento"),
      screen.getByLabelText("Tipo"),
      screen.getByRole("combobox", { name: /marca/i }),
      screen.getByLabelText(/^color/i),
      screen.getByLabelText(/título/i),
      screen.getByRole("heading", { name: "Tallas" }),
    ];
    for (let i = 1; i < chain.length; i++) follows(chain[i - 1], chain[i]);
  });

  it("C9: sin marca no se envía", async () => {
    mount();
    await fillAll({ withBrand: false });
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Playera" } });
    save();
    expect(await screen.findByText("Elige la marca.")).toBeInTheDocument();
    expect(createProductAction).not.toHaveBeenCalled();
  });

  it("C10: el color se oculta en Accesorios y con tipo Perfume", async () => {
    mount();
    await dept("d2");
    expect(screen.queryByLabelText(/^color/i)).toBeNull();
    await dept("d1");
    expect(screen.getByLabelText(/^color/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "t3" } });
    expect(screen.queryByLabelText(/^color/i)).toBeNull();
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "t1" } });
    expect(screen.getByLabelText(/^color/i)).toBeInTheDocument();
  });

  it("C12: el título sugerido se actualiza y se puede editar sin que vuelva a sugerirse", async () => {
    mount();
    await dept("d1");
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "t1" } });
    await pickBrand();
    fireEvent.change(screen.getByLabelText(/^color/i), { target: { value: "rosa" } });
    expect(screen.getByLabelText(/título/i)).toHaveValue("Playeras ALO rosa");
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Mi playera" } });
    fireEvent.change(screen.getByLabelText(/^color/i), { target: { value: "negro" } });
    expect(screen.getByLabelText(/título/i)).toHaveValue("Mi playera");
  });

  it("C4: un código escrito a mano se acepta", () => {
    const onSubmit = vi.fn();
    render(<ManualCodeEntry onSubmit={onSubmit} onNoBarcode={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/código del producto/i), { target: { value: "4006381333931" } });
    fireEvent.click(screen.getByRole("button", { name: "Usar este código" }));
    expect(onSubmit).toHaveBeenCalledWith("4006381333931");
  });

  it("C8 (proxy): tras capturar frente, la captura de atrás sigue en el alta", () => {
    mount({ initialMode: "catalog" });
    fireEvent.click(screen.getByRole("button", { name: /capturar front/ }));
    expect(screen.getByRole("button", { name: /capturar back/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/descripción/i)).toBeInTheDocument();
  });

  it("review: muestra Registrando en con la tienda activa", () => {
    mount();
    expect(screen.getByText("Registrando en: Centro")).toBeInTheDocument();
  });
});

describe("NewProductForm (alta): guardado", () => {
  it("review: doble toque no envía dos altas", async () => {
    let release: (v: unknown) => void = () => {};
    createProductAction.mockReset().mockReturnValue(new Promise((r) => { release = r; }));
    mount();
    await fillAll();
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Playera" } });
    const form = screen.getByRole("button", { name: /guardar producto/i }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(createProductAction).toHaveBeenCalledTimes(1));
    release(OK);
  });

  it("review: sin conexión conserva el formulario", async () => {
    mount();
    await fillAll();
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Playera" } });
    online.mockReturnValue(false);
    save();
    expect(await screen.findByText("Sin internet no se puede guardar. Tus datos siguen aquí.")).toBeInTheDocument();
    expect(createProductAction).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/descripción/i)).toHaveValue("Algodón suave");

    online.mockReturnValue(true);
    createProductAction.mockRejectedValueOnce(new Error("network"));
    save();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/conexión/i));
    expect(screen.getByLabelText(/descripción/i)).toHaveValue("Algodón suave");
    expect(screen.getByLabelText(/título/i)).toHaveValue("Playera");
  });

  it.each([
    ["Solo stock"],
    ["Falta completar registro fotográfico"],
    ["Fotos completas, sin existencias"],
    ["Listo para catálogo"],
  ])("C13/C14/C15 (UI): el estado «%s» llega al resultado", async (status) => {
    createProductAction.mockResolvedValue({ ...OK, catalogStatus: status });
    const { onSuccess } = mount();
    await fillAll();
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Playera" } });
    save();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const info = onSuccess.mock.calls[0][0];
    expect(info.catalogStatus).toBe(status);
    expect(info.message).toContain(status);
  });

  it("alta en catálogo con dos fotos no manda photosAnalyzed", async () => {
    mount();
    await fillAll({ mode: "catalog" });
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Playera" } });
    fireEvent.click(screen.getByRole("button", { name: /capturar front/ }));
    fireEvent.click(screen.getByRole("button", { name: /capturar back/ }));
    save();
    await waitFor(() => expect(createProductAction).toHaveBeenCalled());
    expect(createProductAction.mock.calls[0][0]).not.toHaveProperty("photosAnalyzed");
  });

  it("estado Listo para catálogo muestra que queda en Por publicar", async () => {
    createProductAction.mockResolvedValue({ ...OK, catalogStatus: "Listo para catálogo" });
    const { onSuccess } = mount();
    await fillAll();
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Playera" } });
    save();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0][0].message).toContain("Queda en «Por publicar» hasta que el dueño o el encargado lo publiquen.");
  });

  it("otros estados no dicen Por publicar", async () => {
    createProductAction.mockResolvedValue({ ...OK, catalogStatus: "Solo stock" });
    const { onSuccess } = mount();
    await fillAll();
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Playera" } });
    save();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0][0].message).not.toContain("Por publicar");
  });

  it("review: el payload lleva productTypeId, color y description, y no lleva category ni tipo", async () => {
    createColorAction.mockResolvedValue({ ok: true, label: "Rosa" });
    mount();
    await fillAll({ mode: "catalog" });
    fireEvent.click(screen.getByRole("button", { name: /capturar front/ }));
    fireEvent.click(screen.getByRole("button", { name: /capturar back/ }));
    fireEvent.change(screen.getByLabelText(/^color/i), { target: { value: "rosas" } });
    save();
    await waitFor(() => expect(createProductAction).toHaveBeenCalled());
    const p = createProductAction.mock.calls[0][0];
    expect(p).toMatchObject({
      productTypeId: "t1", color: "Rosa", description: "Algodón suave",
      mode: "catalog", imageUrl: FRONT, backImageUrl: BACK,
    });
    expect(p).not.toHaveProperty("photosAnalyzed");
    expect(p).not.toHaveProperty("category");
    expect(p).not.toHaveProperty("tipo");
  });

  it("G12(b): el color escrito se guarda con la etiqueta de la lista, antes de subir fotos", async () => {
    createColorAction.mockResolvedValue({ ok: true, label: "Rosa" });
    mount();
    await fillAll({ mode: "catalog" });
    fireEvent.click(screen.getByRole("button", { name: /capturar front/ }));
    fireEvent.change(screen.getByLabelText(/^color/i), { target: { value: "rosas" } });
    save();
    await waitFor(() => expect(createProductAction).toHaveBeenCalled());
    expect(createColorAction).toHaveBeenCalledWith("rosas");
    expect(createColorAction.mock.invocationCallOrder[0]).toBeLessThan(uploadProductImageAction.mock.invocationCallOrder[0]);
  });

  it("G12(b): un color que no se puede resolver no sube ni guarda nada", async () => {
    createColorAction.mockResolvedValue({ ok: false, message: "El color puede tener máximo 40 caracteres." });
    mount();
    await fillAll({ mode: "catalog" });
    fireEvent.click(screen.getByRole("button", { name: /capturar front/ }));
    fireEvent.change(screen.getByLabelText(/^color/i), { target: { value: "rosas" } });
    save();
    expect(await screen.findByText("El color puede tener máximo 40 caracteres.")).toBeInTheDocument();
    expect(uploadProductImageAction).not.toHaveBeenCalled();
    expect(createProductAction).not.toHaveBeenCalled();
  });

  it("G12(a): si algo no valida en el cliente no se sube ninguna foto", async () => {
    mount();
    await fillAll({ mode: "catalog", withBrand: false });
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Playera" } });
    fireEvent.click(screen.getByRole("button", { name: /capturar front/ }));
    save();
    expect(await screen.findByText("Elige la marca.")).toBeInTheDocument();
    expect(uploadProductImageAction).not.toHaveBeenCalled();
  });

  it("G12(a): modo catálogo sin fotos se guarda como estado sin fotos, sin subir nada", async () => {
    mount();
    await fillAll({ mode: "catalog" });
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Playera" } });
    save();
    await waitFor(() => expect(createProductAction).toHaveBeenCalled());
    expect(uploadProductImageAction).not.toHaveBeenCalled();
    expect(createProductAction.mock.calls[0][0]).toMatchObject({ imageUrl: null, backImageUrl: null });
  });

  it("G12(a): una foto de más de 4 MB se rechaza en el cliente sin subir nada", async () => {
    mount();
    await fillAll({ mode: "catalog" });
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Playera" } });
    photoSize.bytes = 5 * 1024 * 1024;
    fireEvent.click(screen.getByRole("button", { name: /capturar front/ }));
    photoSize.bytes = 0;
    save();
    expect(await screen.findByText(/pesa más de 4 MB/i)).toBeInTheDocument();
    expect(uploadProductImageAction).not.toHaveBeenCalled();
    expect(createProductAction).not.toHaveBeenCalled();
  });

  it("G12(a): si la subida falla se ofrece guardar como Solo stock y no se pierde el alta", async () => {
    uploadProductImageAction.mockReset().mockResolvedValue({ ok: false, message: "No se pudo subir la foto." });
    const { onSuccess } = mount();
    await fillAll({ mode: "catalog" });
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Playera" } });
    fireEvent.click(screen.getByRole("button", { name: /capturar front/ }));
    fireEvent.click(screen.getByRole("button", { name: /capturar back/ }));
    save();
    expect(await screen.findByText(/No se pudo subir la foto/)).toBeInTheDocument();
    expect(createProductAction).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/descripción/i)).toHaveValue("Algodón suave");
    fireEvent.click(screen.getByRole("button", { name: /guardar como solo stock/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(createProductAction.mock.calls[0][0]).toMatchObject({
      mode: "stock", imageUrl: null, backImageUrl: null,
    });
  });

  it("G12(a): si el guardado falla tras subir, reintentar no vuelve a subir y se ofrece Solo stock", async () => {
    createProductAction.mockReset()
      .mockResolvedValueOnce({ ok: false, code: "ERROR", message: "No se pudo guardar el producto. Revisa tu conexión e intenta de nuevo." })
      .mockResolvedValueOnce({ ...OK, catalogStatus: "Listo para catálogo" });
    const { onSuccess } = mount();
    await fillAll({ mode: "catalog" });
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Playera" } });
    fireEvent.click(screen.getByRole("button", { name: /capturar front/ }));
    fireEvent.click(screen.getByRole("button", { name: /capturar back/ }));
    save();
    expect(await screen.findByText(/No se pudo guardar el producto/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar como solo stock/i })).toBeInTheDocument();
    expect(uploadProductImageAction).toHaveBeenCalledTimes(2);
    save();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(uploadProductImageAction).toHaveBeenCalledTimes(2);
    expect(createProductAction.mock.calls[1][0]).toMatchObject({ imageUrl: FRONT, backImageUrl: BACK });
  });
});

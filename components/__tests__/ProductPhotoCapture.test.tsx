import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const actions = vi.hoisted(() => ({
  updateProductImageAction: vi.fn(),
  setProductBackImageAction: vi.fn(),
  uploadProductImageAction: vi.fn(),
  setCatalogPhotosAction: vi.fn(),
}));
vi.mock("@/lib/actions", () => actions);

import { ProductPhotoCapture } from "../products/ProductPhotoCapture";
import { ProductPhotoButton } from "../products/ProductPhotoButton";
import { defaultProcessFile } from "@/lib/image/process-file";
import { PHOTO_HINT_BACK, PHOTO_HINT_FRONT } from "../products/ProductPhotoCapture";

const edited = () => new File(["x"], "producto.jpg", { type: "image/jpeg" });
const approve = vi.fn(async (_f: File, _o?: { levels?: boolean }) => ({ file: edited() }));
const pick = (container: HTMLElement) => {
  const input = container.querySelector("input[type=file]") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] } });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
  actions.uploadProductImageAction.mockResolvedValue({ ok: true, url: "https://x.public.blob.vercel-storage.com/a.jpg" });
  actions.updateProductImageAction.mockResolvedValue({ ok: true });
  actions.setProductBackImageAction.mockResolvedValue({ ok: true });
  actions.setCatalogPhotosAction.mockResolvedValue({ ok: true });
});

describe("ProductPhotoCapture: lado de la foto", () => {
  it.each([
    ["front", "frente"],
    ["back", "atrás"],
  ] as const)("lado %s: el botón y la vista previa dicen cuál foto es", async (side, word) => {
    const { container } = render(<ProductPhotoCapture side={side} processFile={approve} onCapture={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByRole("button", { name: new RegExp(`foto de ${word}`, "i") })).toBeInTheDocument();
    pick(container);
    expect(await screen.findByAltText(`Vista previa de la foto de ${word}`)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: `Retomar foto de ${word}` })).toBeEnabled());
    expect(screen.getByRole("button", { name: `Quitar foto de ${word}` })).toBeInTheDocument();
  });
});

describe("ProductPhotoCapture: captura libre", () => {
  it("cualquier foto procesada se entrega con onCapture, sin rechazo", async () => {
    const onCapture = vi.fn();
    const { container } = render(<ProductPhotoCapture processFile={approve} onCapture={onCapture} onClear={vi.fn()} />);
    pick(container);
    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    expect(await screen.findByAltText(/vista previa/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("no hay marco de encuadre ni texto de fondo blanco; el texto de ayuda depende del lado", () => {
    const { unmount } = render(<ProductPhotoCapture side="front" processFile={approve} onCapture={vi.fn()} onClear={vi.fn()} />);
    expect(screen.queryByTestId("framing-guide")).toBeNull();
    expect(screen.queryByText(/blanc/i)).toBeNull();
    expect(screen.getByText(PHOTO_HINT_FRONT)).toBeInTheDocument();
    expect(PHOTO_HINT_FRONT).toBe("Toma la foto de frente de la prenda.");
    unmount();
    render(<ProductPhotoCapture side="back" processFile={approve} onCapture={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText(PHOTO_HINT_BACK)).toBeInTheDocument();
    expect(PHOTO_HINT_BACK).toBe("Toma la foto de atrás de la prenda.");
  });

  it("source camera (por defecto): el input lleva capture=environment", () => {
    const { container } = render(<ProductPhotoCapture processFile={approve} onCapture={vi.fn()} onClear={vi.fn()} />);
    expect(container.querySelector("input[type=file]")).toHaveAttribute("capture", "environment");
  });

  it("source gallery: el input no lleva capture", () => {
    const { container } = render(<ProductPhotoCapture source="gallery" processFile={approve} onCapture={vi.fn()} onClear={vi.fn()} />);
    expect(container.querySelector("input[type=file]")).not.toHaveAttribute("capture");
  });

  it("defaultProcessFile aplica el EXIF, no analiza el fondo y respeta levels: false", async () => {
    const bitmap = vi.fn().mockResolvedValue({ width: 20, height: 20 });
    vi.stubGlobal("createImageBitmap", bitmap);
    const getImageData = vi.fn(() => ({ data: new Uint8ClampedArray(20 * 20 * 4).fill(255) }));
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn(), getImageData, putImageData: vi.fn() })) as never;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(["x"], { type: "image/jpeg" }));
    };
    const res = await defaultProcessFile(new File(["x"], "a.jpg", { type: "image/jpeg" }));
    expect(bitmap).toHaveBeenCalledWith(expect.any(File), { imageOrientation: "from-image" });
    expect(Object.keys(res)).toEqual(["file"]);
    expect(getImageData).toHaveBeenCalledTimes(1);
    getImageData.mockClear();
    await defaultProcessFile(new File(["x"], "a.jpg", { type: "image/jpeg" }), { levels: false });
    expect(getImageData).not.toHaveBeenCalled();
  });
});

describe("ProductPhotoButton: captura sin análisis", () => {
  it("la foto de frente desde la ficha se sube sin photosAnalyzed", async () => {
    const { container } = render(<ProductPhotoButton productId="p1" productTitle="Gorra" hasImage={false} processFile={approve} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar foto de frente de Gorra" }));
    pick(container);
    await waitFor(() => expect(actions.updateProductImageAction).toHaveBeenCalledTimes(1));
    expect(actions.updateProductImageAction).toHaveBeenCalledWith("p1", expect.any(FormData));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("la foto de atrás se envía sin photosAnalyzed", async () => {
    const { container } = render(<ProductPhotoButton productId="p1" side="back" hasImage={false} processFile={approve} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar foto de atrás" }));
    pick(container);
    await waitFor(() => expect(actions.setProductBackImageAction).toHaveBeenCalled());
    expect(actions.setProductBackImageAction).toHaveBeenCalledWith("p1", expect.stringContaining("blob"));
  });

  it("con hasImage dice Reemplazar, abre la galería (sin capture) y no aplica autoniveles", async () => {
    const { container } = render(<ProductPhotoButton productId="p1" productTitle="Gorra" hasImage processFile={approve} />);
    fireEvent.click(screen.getByRole("button", { name: "Reemplazar foto de frente de Gorra" }));
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    expect(input).not.toHaveAttribute("capture");
    pick(container);
    await waitFor(() => expect(actions.updateProductImageAction).toHaveBeenCalledTimes(1));
    expect(approve).toHaveBeenCalledWith(expect.any(File), { levels: false });
  });

  it("sin foto previa usa la cámara y los autoniveles", async () => {
    const { container } = render(<ProductPhotoButton productId="p1" hasImage={false} processFile={approve} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar foto de frente" }));
    expect(container.querySelector("input[type=file]")).toHaveAttribute("capture", "environment");
    pick(container);
    await waitFor(() => expect(actions.updateProductImageAction).toHaveBeenCalled());
    expect(approve).toHaveBeenCalledWith(expect.any(File), { levels: true });
  });

  it("captureBoth ofrece tomar frente y atrás y guarda con setCatalogPhotosAction sin photosAnalyzed", async () => {
    const onUpdated = vi.fn();
    const { container } = render(
      <ProductPhotoButton productId="p1" productTitle="Gorra" hasImage={false} captureBoth processFile={approve} onUpdated={onUpdated} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Tomar fotos de catálogo (frente y atrás) de Gorra" }));
    expect(screen.getByRole("button", { name: "Guardar fotos" })).toBeDisabled();
    const inputs = container.querySelectorAll("input[type=file]");
    expect(inputs).toHaveLength(2);
    for (const input of Array.from(inputs)) {
      fireEvent.change(input, { target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] } });
      await waitFor(() => expect(approve).toHaveBeenCalled());
    }
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar fotos" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Guardar fotos" }));
    await waitFor(() => expect(actions.setCatalogPhotosAction).toHaveBeenCalledTimes(1));
    expect(actions.setCatalogPhotosAction).toHaveBeenCalledWith("p1", {
      imageUrl: expect.stringContaining("blob"),
      backImageUrl: expect.stringContaining("blob"),
    });
    expect(actions.updateProductImageAction).not.toHaveBeenCalled();
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });

  it("cancelar con captureBoth descarta las fotos: al reabrir no hay vistas previas y Guardar fotos está deshabilitado", async () => {
    const { container } = render(<ProductPhotoButton productId="p1" hasImage={false} captureBoth processFile={approve} />);
    const openBtn = () => screen.getByRole("button", { name: "Tomar fotos de catálogo (frente y atrás)" });
    fireEvent.click(openBtn());
    for (const input of Array.from(container.querySelectorAll("input[type=file]"))) {
      fireEvent.change(input, { target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] } });
    }
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar fotos" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(openBtn());
    expect(screen.queryByAltText(/vista previa/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Guardar fotos" })).toBeDisabled();
  });
});

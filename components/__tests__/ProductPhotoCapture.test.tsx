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

const analysis = (ok: boolean) => ({ ok, meanLuma: 0, stdLuma: 0, whiteFraction: 0, meanChroma: 0 });
const edited = () => new File(["x"], "producto.jpg", { type: "image/jpeg" });
const approve = vi.fn(async () => ({ file: edited(), analysis: analysis(true) }));
const reject = vi.fn(async () => ({ file: edited(), analysis: analysis(false) }));
const REJECT_TEXT = "El fondo no está en blanco. Repite la foto con la prenda sobre una superficie blanca.";
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

describe("ProductPhotoCapture: guía y análisis de fondo", () => {
  it("review: la guía de encuadre aparece antes de tomar la foto", () => {
    render(<ProductPhotoCapture processFile={approve} onCapture={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByTestId("framing-guide")).toBeInTheDocument();
    expect(screen.getByText("Coloca la prenda sobre una superficie blanca y céntrala en el marco.")).toBeInTheDocument();
  });

  it("C7: foto rechazada no se sube y muestra el aviso de repetir", async () => {
    const onCapture = vi.fn();
    const { container } = render(<ProductPhotoCapture processFile={reject} onCapture={onCapture} onClear={vi.fn()} />);
    pick(container);
    expect(await screen.findByRole("alert")).toHaveTextContent(REJECT_TEXT);
    expect(onCapture).not.toHaveBeenCalled();
    expect(screen.queryByAltText(/vista previa/i)).toBeNull();
    // Solo se puede repetir: la guía y el botón de tomar siguen ahí.
    expect(screen.getByRole("button", { name: /tomar o subir foto/i })).toBeEnabled();
  });

  it("C7 (aceptada): foto aprobada llama onCapture", async () => {
    const onCapture = vi.fn();
    const { container } = render(<ProductPhotoCapture processFile={approve} onCapture={onCapture} onClear={vi.fn()} />);
    pick(container);
    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("review: foto con orientación EXIF pasa el análisis tras la rotación", async () => {
    const bitmap = vi.fn().mockResolvedValue({ width: 20, height: 20 });
    vi.stubGlobal("createImageBitmap", bitmap);
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray(20 * 20 * 4).fill(255) }),
      putImageData: vi.fn(),
    })) as never;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(["x"], { type: "image/jpeg" }));
    };
    const { analysis: result } = await defaultProcessFile(new File(["x"], "a.jpg", { type: "image/jpeg" }));
    expect(bitmap).toHaveBeenCalledWith(expect.any(File), { imageOrientation: "from-image" });
    expect(result.ok).toBe(true);
  });
});

describe("ProductPhotoButton: la ficha usa el mismo análisis", () => {
  it("C18: la foto desde la ficha pasa por el mismo análisis", async () => {
    const { container, unmount } = render(
      <ProductPhotoButton productId="p1" productTitle="Gorra" hasImage={false} processFile={reject} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Agregar foto de frente de Gorra" }));
    pick(container);
    expect(await screen.findByRole("alert")).toHaveTextContent(REJECT_TEXT);
    expect(actions.updateProductImageAction).not.toHaveBeenCalled();
    expect(actions.uploadProductImageAction).not.toHaveBeenCalled();
    unmount();

    const ok = render(<ProductPhotoButton productId="p1" productTitle="Gorra" hasImage={false} processFile={approve} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar foto de frente de Gorra" }));
    pick(ok.container);
    await waitFor(() => expect(actions.updateProductImageAction).toHaveBeenCalledTimes(1));
    expect(actions.updateProductImageAction).toHaveBeenCalledWith("p1", expect.any(FormData), { photosAnalyzed: true });
  });

  it("la foto de atrás se envía con photosAnalyzed: true", async () => {
    const { container } = render(<ProductPhotoButton productId="p1" side="back" hasImage={false} processFile={approve} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar foto de atrás" }));
    pick(container);
    await waitFor(() => expect(actions.setProductBackImageAction).toHaveBeenCalled());
    expect(actions.setProductBackImageAction).toHaveBeenCalledWith("p1", expect.stringContaining("blob"), { photosAnalyzed: true });
  });

  it("review: producto sin fotos revisadas ofrece tomar frente y atrás y guarda con setCatalogPhotosAction", async () => {
    const onUpdated = vi.fn();
    const { container } = render(
      <ProductPhotoButton productId="p1" productTitle="Gorra" hasImage={false} catalogChecked={false} processFile={approve} onUpdated={onUpdated} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Tomar fotos de catálogo (frente y atrás) de Gorra" }));
    const save = screen.getByRole("button", { name: "Guardar fotos" });
    expect(save).toBeDisabled();
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
      photosAnalyzed: true,
    });
    expect(actions.updateProductImageAction).not.toHaveBeenCalled();
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });

  it("con una foto de catálogo rechazada no se puede guardar", async () => {
    const { container } = render(
      <ProductPhotoButton productId="p1" hasImage={false} catalogChecked={false} processFile={reject} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Tomar fotos de catálogo (frente y atrás)" }));
    pick(container);
    await screen.findAllByRole("alert");
    expect(screen.getByRole("button", { name: "Guardar fotos" })).toBeDisabled();
    expect(actions.setCatalogPhotosAction).not.toHaveBeenCalled();
  });
});

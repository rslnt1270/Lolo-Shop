import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProductPhotoCapture } from "../products/ProductPhotoCapture";

describe("ProductPhotoCapture: lado de la foto", () => {
  beforeEach(() => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 10, height: 10 }));
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray(400) }),
      putImageData: vi.fn(),
    })) as never;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(["x"], { type: "image/jpeg" }));
    };
  });

  it.each([
    ["front", "frente"],
    ["back", "atrás"],
  ] as const)("lado %s: el botón y la vista previa dicen cuál foto es", async (side, word) => {
    const { container } = render(<ProductPhotoCapture side={side} onCapture={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByRole("button", { name: new RegExp(`foto de ${word}`, "i") })).toBeInTheDocument();
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] } });
    expect(await screen.findByAltText(`Vista previa de la foto de ${word}`)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: `Retomar foto de ${word}` })).toBeEnabled());
    expect(screen.getByRole("button", { name: `Quitar foto de ${word}` })).toBeInTheDocument();
  });
});

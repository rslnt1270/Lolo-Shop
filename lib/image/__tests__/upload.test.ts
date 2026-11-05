import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PutBlobResult } from "@vercel/blob";

vi.mock("@vercel/blob");

import { uploadImage, ImageUploadError, MAX_IMAGE_BYTES } from "@/lib/image/upload";
import * as blobModule from "@vercel/blob";

const putMock = vi.mocked(blobModule.put);

describe("uploadImage", () => {
  beforeEach(() => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
    putMock.mockReset();
    putMock.mockResolvedValue({
      url: "https://blob.example/productos/abc.jpg",
      downloadUrl: "https://blob.example/productos/abc.jpg?download",
      pathname: "/productos/abc.jpg",
      contentType: "image/jpeg",
      contentDisposition: "inline",
      etag: "abc123",
    } as unknown as PutBlobResult);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sube el archivo como público y devuelve la URL", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "photo.jpg", { type: "image/jpeg" });
    const url = await uploadImage(file);

    expect(url).toBe("https://blob.example/productos/abc.jpg");
    expect(putMock).toHaveBeenCalledOnce();
    const [name, body, opts] = putMock.mock.calls[0];
    expect(name).toMatch(/^productos\/.+\.jpg$/);
    expect(body).toBe(file);
    expect(opts).toMatchObject({ access: "public", contentType: "image/jpeg" });
  });

  it("usa la extensión según el tipo (png, webp)", async () => {
    await uploadImage(new File([new Uint8Array([1])], "a.png", { type: "image/png" }));
    await uploadImage(new File([new Uint8Array([1])], "a.webp", { type: "image/webp" }));
    expect(putMock.mock.calls[0][0]).toMatch(/\.png$/);
    expect(putMock.mock.calls[1][0]).toMatch(/\.webp$/);
  });

  it("sin BLOB_READ_WRITE_TOKEN falla con mensaje claro y no llama a put", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    const file = new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });
    const err = await uploadImage(file).catch((e) => e);
    expect(err).toBeInstanceOf(ImageUploadError);
    expect(err.message).toMatch(/BLOB_READ_WRITE_TOKEN/);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("rechaza tipos fuera de la lista blanca", async () => {
    for (const type of ["image/gif", "image/svg+xml", "application/pdf", ""]) {
      const err = await uploadImage(new File([new Uint8Array([1])], "x", { type })).catch((e) => e);
      expect(err).toBeInstanceOf(ImageUploadError);
      expect(err.message).toMatch(/JPG, PNG o WebP/);
    }
    expect(putMock).not.toHaveBeenCalled();
  });

  it("rechaza imágenes de más de 4 MB y acepta exactamente 4 MB", async () => {
    expect(MAX_IMAGE_BYTES).toBe(4 * 1024 * 1024);
    const big = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "big.jpg", { type: "image/jpeg" });
    const err = await uploadImage(big).catch((e) => e);
    expect(err).toBeInstanceOf(ImageUploadError);
    expect(err.message).toMatch(/4 MB/);
    const ok = new File([new Uint8Array(MAX_IMAGE_BYTES)], "ok.jpg", { type: "image/jpeg" });
    await expect(uploadImage(ok)).resolves.toMatch(/^https:/);
  });

  it("rechaza archivo vacío", async () => {
    const err = await uploadImage(new File([], "e.jpg", { type: "image/jpeg" })).catch((e) => e);
    expect(err).toBeInstanceOf(ImageUploadError);
  });
});

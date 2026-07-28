import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PutBlobResult } from "@vercel/blob";

vi.mock("@vercel/blob");

import { uploadImage } from "@/lib/image/upload";
import * as blobModule from "@vercel/blob";

const putMock = vi.mocked(blobModule.put);

describe("uploadImage", () => {
  beforeEach(() => {
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

  it("sube el archivo como público y devuelve la URL", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "photo.jpg", { type: "image/jpeg" });
    const url = await uploadImage(file);

    expect(url).toBe("https://blob.example/productos/abc.jpg");
    expect(putMock).toHaveBeenCalledOnce();
    const [name, body, opts] = putMock.mock.calls[0];
    expect(name).toMatch(/^productos\//);
    expect(body).toBe(file);
    expect(opts).toMatchObject({ access: "public" });
  });
});

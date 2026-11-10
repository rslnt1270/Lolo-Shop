import { describe, expect, it } from "vitest";
import { isProductBlobUrl } from "../blob-url";

describe("isProductBlobUrl", () => {
  it("acepta una URL pública de Vercel Blob bajo productos/", () => {
    expect(isProductBlobUrl("https://abc123.public.blob.vercel-storage.com/productos/1-x.jpg")).toBe(true);
  });
  it("rechaza otro dominio aunque sea https", () => {
    expect(isProductBlobUrl("https://evil.example.com/productos/a.jpg")).toBe(false);
    expect(isProductBlobUrl("https://public.blob.vercel-storage.com.evil.com/productos/a.jpg")).toBe(false);
  });
  it("rechaza rutas fuera de productos/", () => {
    expect(isProductBlobUrl("https://abc.public.blob.vercel-storage.com/otra/a.jpg")).toBe(false);
  });
  it("rechaza http, credenciales embebidas, puertos y basura", () => {
    expect(isProductBlobUrl("http://abc.public.blob.vercel-storage.com/productos/a.jpg")).toBe(false);
    expect(isProductBlobUrl("https://u:p@abc.public.blob.vercel-storage.com/productos/a.jpg")).toBe(false);
    expect(isProductBlobUrl("https://abc.public.blob.vercel-storage.com:8443/productos/a.jpg")).toBe(false);
    expect(isProductBlobUrl("javascript:alert(1)")).toBe(false);
    expect(isProductBlobUrl("no es url")).toBe(false);
  });
});

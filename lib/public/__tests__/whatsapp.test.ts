import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_CATALOG_TEXT,
  NO_WHATSAPP_TEXT,
  getWhatsAppNumber,
  productInquiryMessage,
  whatsAppLink,
} from "../whatsapp";
import type { PublicProduct } from "@/lib/data/public-projection";

const NUM = "52" + "0".repeat(10);

const product: PublicProduct = {
  id: "id-interno-123",
  publicCode: "K7Q2M",
  title: "Playera Test",
  brand: "Marca de prueba",
  category: "Playeras",
  imageUrl: "https://example.invalid/f.jpg",
  backImageUrl: "https://example.invalid/a.jpg",
  sizes: [{ size: "M", available: true, price: 350 }],
  price: 350,
  department: null,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getWhatsAppNumber", () => {
  it("sin variable devuelve null", () => {
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", "");
    expect(getWhatsAppNumber()).toBeNull();
  });

  it.each(["52 0000 000000", "52000000000a", "521" + "0".repeat(10), "1" + "0".repeat(11)])(
    "rechaza %s",
    (value) => {
      vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", value);
      expect(getWhatsAppNumber()).toBeNull();
    },
  );

  it("acepta 52 + 10 dígitos", () => {
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", NUM);
    expect(getWhatsAppNumber()).toBe(NUM);
  });
});

describe("productInquiryMessage", () => {
  it("con talla", () => {
    expect(productInquiryMessage(product, "M")).toBe(
      "Hola, me interesa Marca de prueba Playera Test en talla M. ¿Sigue disponible? Código K7Q2M",
    );
  });

  it("sin talla", () => {
    expect(productInquiryMessage(product)).toBe(
      "Hola, me interesa Marca de prueba Playera Test. ¿Qué tallas tienen? Código K7Q2M",
    );
  });

  it("sin código omite Código", () => {
    expect(productInquiryMessage({ ...product, publicCode: null }, "M")).not.toContain("Código");
    expect(productInquiryMessage({ ...product, publicCode: null })).not.toContain("Código");
  });

  it("recorta el nombre a 80 y el total a 300", () => {
    const largo = productInquiryMessage({ ...product, title: "N".repeat(200) }, "M");
    expect(largo).toContain("N".repeat(80));
    expect(largo).not.toContain("N".repeat(81));
    const enorme = productInquiryMessage({ ...product, title: "N".repeat(200), brand: "B".repeat(500) }, "M");
    expect(enorme.length).toBeLessThanOrEqual(300);
    expect(enorme).toContain("Código K7Q2M");
  });

  it("no incluye el id interno ni promesas de apartado", () => {
    const msg = productInquiryMessage(product, "M");
    expect(msg).not.toContain(product.id);
    expect(msg).not.toMatch(/apart/i);
  });
});

describe("whatsAppLink y textos", () => {
  it("arma el enlace wa.me con el texto codificado", () => {
    expect(whatsAppLink(NUM, "Hola ¿qué tal?")).toBe(`https://wa.me/${NUM}?text=${encodeURIComponent("Hola ¿qué tal?")}`);
  });

  it("textos fijos", () => {
    expect(NO_WHATSAPP_TEXT).toBe("Consulta disponibilidad en tienda.");
    expect(EMPTY_CATALOG_TEXT).toBe("Pronto verás aquí las prendas de la tienda.");
  });
});

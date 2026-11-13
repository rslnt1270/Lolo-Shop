import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProductCard3D } from "../products/ProductCard3D";
import { NO_WHATSAPP_TEXT, SHOW_WHATSAPP_CTA } from "@/lib/public/whatsapp";

afterEach(cleanup);

const base = {
  title: "Playera de prueba",
  brand: "Marca de prueba",
  imageUrl: null,
  publicCode: "K7Q2M",
  price: 100,
  titleId: "t1",
};

describe("ProductCard3D: CTA de WhatsApp", () => {
  it("sin waLink no renderiza ningún CTA ni el texto de respaldo", () => {
    render(<ProductCard3D {...base} waLink={null} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(NO_WHATSAPP_TEXT)).toBeNull();
  });

  it("con waLink muestra Consultar por WhatsApp como enlace", () => {
    render(<ProductCard3D {...base} waLink="https://wa.me/520000000000?text=hola" />);
    const link = screen.getByRole("link", { name: /Consultar por WhatsApp/ });
    expect(link.getAttribute("href")).toBe("https://wa.me/520000000000?text=hola");
  });

  it("SHOW_WHATSAPP_CTA es false", () => {
    expect(SHOW_WHATSAPP_CTA).toBe(false);
  });
});

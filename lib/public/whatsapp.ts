import type { PublicProduct } from "@/lib/data/public-projection";

export const NO_WHATSAPP_TEXT = "Consulta disponibilidad en tienda.";
export const EMPTY_CATALOG_TEXT = "Pronto verás aquí las prendas de la tienda.";
export const CATALOG_ERROR_TEXT = "No pudimos cargar el catálogo. Intenta de nuevo en un momento.";

const MAX_NAME = 80;
const MAX_MESSAGE = 300;

/**
 * Número de WhatsApp de la tienda (solo `52` + 10 dígitos). Acceso literal a
 * `process.env.NEXT_PUBLIC_WHATSAPP_NUMBER` para que Next lo incruste en el cliente.
 * Sin número válido devuelve null: nunca se inventa uno.
 */
export function getWhatsAppNumber(): string | null {
  const raw = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  return raw && /^52\d{10}$/.test(raw) ? raw : null;
}

/** Mensaje de consulta: solo marca, nombre, talla y código público (nunca id ni SKU). */
export function productInquiryMessage(p: PublicProduct, size?: string): string {
  const name = p.title.slice(0, MAX_NAME);
  const code = p.publicCode ? ` Código ${p.publicCode}` : "";
  const build = (brand: string) =>
    size
      ? `Hola, me interesa ${brand} ${name} en talla ${size}. ¿Sigue disponible?${code}`
      : `Hola, me interesa ${brand} ${name}. ¿Qué tallas tienen?${code}`;

  let message = build(p.brand);
  if (message.length > MAX_MESSAGE) {
    const excess = message.length - MAX_MESSAGE;
    message = build(p.brand.slice(0, Math.max(0, p.brand.length - excess)));
  }
  return message.slice(0, MAX_MESSAGE);
}

export function whatsAppLink(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

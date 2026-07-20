export { default } from "next-auth/middleware";

// Rutas públicas (excluidas de la protección de sesión):
// - /catalogo: catálogo público para compradores
// - /api/whatsapp: webhook de Meta (verificación y mensajes entrantes)
// - /api/bot: consumido por n8n con su propia autenticación (x-bot-key)
export const config = {
  matcher: [
    "/((?!login|catalogo|api/auth|api/whatsapp|api/bot|manifest.json|icons|loloshop-logo\\.png|sw\\.js|workbox|_next).*)",
  ],
};

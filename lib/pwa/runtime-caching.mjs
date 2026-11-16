import defaultCache from "next-pwa/cache.js";

/**
 * /pos debe abrir sin conexión (venta sin internet). Solo la navegación a /pos
 * exacta: /api/*, /probador y /api/probador/* nunca se cachean (las reglas por
 * omisión de next-pwa los dejan en NetworkOnly para /api).
 */
export const posRuntimeCaching = [
  {
    urlPattern: ({ request, url }) => request.mode === "navigate" && url.pathname === "/pos",
    handler: "NetworkFirst",
    options: {
      cacheName: "pos-page",
      networkTimeoutSeconds: 4,
      cacheableResponse: { statuses: [200] },
      expiration: { maxEntries: 1 },
    },
  },
];

/** Nuestras reglas primero: Workbox usa la primera que coincide. */
export const runtimeCaching = [...posRuntimeCaching, ...defaultCache];

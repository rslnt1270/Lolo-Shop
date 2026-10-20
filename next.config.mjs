import withSerwistInit from "@serwist/next";

// PWA: service worker generado por Serwist desde app/sw.ts → public/sw.js (gitignored).
// Desactivado en desarrollo para no cachear HMR.
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {};
export default withSerwist(nextConfig);

import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Las fotos de producto (≈1 MB máx. tras procesar) viajan por server action.
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },
};
export default withPWA(nextConfig);

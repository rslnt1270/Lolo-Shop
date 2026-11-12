import "./globals.css";
import type { Metadata, Viewport } from "next";
import Providers from "./providers";
import { NavBar } from "@/components/layout/NavBar";

export const metadata: Metadata = {
  title: "LoloShop",
  description: "Gestión de inventario LoloShop",
  manifest: "/manifest.json",
};

// viewportFit "cover": sin esto env(safe-area-inset-*) vale 0 en iPhone/Android
// y la barra inferior queda bajo el indicador de inicio / barra de gestos.
// El relleno inferior del body lo pone globals.css (--bottom-nav-offset).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#22B8B8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>
          <NavBar />
          {children}
        </Providers>
      </body>
    </html>
  );
}

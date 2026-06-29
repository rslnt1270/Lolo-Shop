import "./globals.css";
import type { Metadata } from "next";
import Providers from "./providers";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "LoloShop",
  description: "Gestión de inventario LoloShop",
  manifest: "/manifest.json",
  themeColor: "#3CBFBF",
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

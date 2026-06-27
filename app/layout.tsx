import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LoloShop",
  description: "Gestión de inventario LoloShop",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

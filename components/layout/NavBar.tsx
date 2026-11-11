"use client";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Home, ScanLine, Tags, Package, Receipt, LogOut, ShoppingCart } from "lucide-react";

export function NavBar() {
  const pathname = usePathname();
  const { status } = useSession();

  if (status !== "authenticated") return null;
  // /pos es pantalla completa (tiene su propio "Volver al inicio"); se entra con "Vender".
  if (pathname.startsWith("/pos") || pathname.startsWith("/catalogo") || pathname === "/login") return null;

  const navItems = [
    { name: "Inicio", href: "/", icon: Home },
    { name: "Vender", href: "/pos", icon: ShoppingCart },
    { name: "Escanear", href: "/escanear", icon: ScanLine },
    { name: "Etiquetas", href: "/etiquetas", icon: Tags },
    { name: "Productos", href: "/productos", icon: Package },
    { name: "Ventas", href: "/ventas", icon: Receipt },
  ];

  return (
    <>
      {/* Desktop Top Bar (Hidden on Mobile) */}
      <nav className="hidden md:flex items-center justify-between border-b border-gray-100 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <img
            src="/loloshop-logo.png"
            alt="LoloShop"
            className="h-9 w-9 rounded-full border border-gray-100 shadow-sm"
          />
          <span className="font-bold text-lg text-[#18181B] tracking-tight">LoloShop</span>
        </div>
        <div className="flex items-center gap-6 text-sm font-medium">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.name} 
                href={item.href} 
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-md transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loloteal ${isActive ? 'text-loloteal' : 'text-gray-600 hover:text-gray-900'}`}
              >
                <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                {item.name}
              </Link>
            )
          })}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="ml-4 flex min-h-11 items-center gap-2 rounded-md text-gray-600 transition-colors hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loloteal"
          >
            <LogOut size={18} />
            Salir
          </button>
        </div>
      </nav>

      {/* Mobile Top Header (Just Logo) */}
      <header className="md:hidden flex items-center justify-center border-b border-gray-100 bg-white/80 backdrop-blur-md px-4 py-3 sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <img src="/loloshop-logo.png" alt="LoloShop" className="h-7 w-7 rounded-full shadow-sm" />
          <span className="font-bold text-[#18181B] tracking-tight">LoloShop</span>
        </div>
      </header>

      {/* Mobile Bottom Navigation */}
      {/* 8 destinos: cada uno flex-1 (≈ 44.9 px a 375 px; ≈ 43 px a 360 px) con mínimo de 44 px */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-gray-100 bg-white/90 backdrop-blur-xl pb-6 pt-2 px-2 z-50 shadow-[0_-4px_24px_rgba(0,0,0,0.02)]">
        <div className="flex items-center max-w-md mx-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                aria-label={item.name}
                aria-current={isActive ? "page" : undefined}
                className="relative flex h-12 min-w-11 flex-1 flex-col items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-loloteal"
              >
                <div className={`transition-all duration-300 ${isActive ? '-translate-y-1 text-loloteal' : 'text-gray-500'}`}>
                  <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                {isActive && (
                  <span aria-hidden="true" className="absolute bottom-0 text-[10px] font-bold text-loloteal opacity-100 transition-opacity">
                    {item.name}
                  </span>
                )}
              </Link>
            );
          })}
          <button
            type="button"
            aria-label="Salir"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="relative flex h-12 min-w-11 flex-1 flex-col items-center justify-center rounded-lg text-gray-500 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-loloteal"
          >
            <LogOut size={22} />
          </button>
        </div>
      </nav>
    </>
  );
}

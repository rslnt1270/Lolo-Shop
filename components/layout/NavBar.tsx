"use client";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Home, ScanLine, Tags, Package, Receipt, LogOut, ShoppingCart } from "lucide-react";

const MOBILE_HEADER =
  "md:hidden flex items-center justify-center border-b border-gray-100 bg-white/80 backdrop-blur-md px-4 pb-3 pt-[calc(0.75rem+var(--safe-top))] sticky top-0 z-40";
const BOTTOM_NAV =
  "md:hidden fixed bottom-0 left-0 right-0 z-50 h-[calc(var(--nav-h)+var(--safe-bottom))] border-t border-gray-100 bg-white/90 pb-[var(--safe-bottom)] pl-[max(0.375rem,var(--safe-left))] pr-[max(0.375rem,var(--safe-right))] shadow-[0_-4px_24px_rgba(0,0,0,0.02)] backdrop-blur-xl";

export function NavBar() {
  const pathname = usePathname();
  const { status } = useSession();

  // /pos es pantalla completa (tiene su propio "Volver al inicio"); se entra con "Vender".
  if (pathname.startsWith("/pos") || pathname.startsWith("/catalogo") || pathname === "/login") return null;
  if (status === "unauthenticated") return null;

  // Mientras carga la sesión se reservan el encabezado y la barra inferior
  // (vacíos, con data-bottom-nav) para que --bottom-nav-offset no salte de 0
  // al valor real al terminar de cargar.
  if (status === "loading") {
    return (
      <>
        <header aria-hidden="true" className={MOBILE_HEADER}>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-gray-100" />
            <span className="font-bold text-tinta tracking-tight">LoloShop</span>
          </div>
        </header>
        <nav data-bottom-nav="" data-loading="" aria-hidden="true" className={BOTTOM_NAV} />
      </>
    );
  }

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
      {/* Barra superior md+ (iPad vertical 768 px en adelante, escritorio).
          Entre md y lg solo iconos (con nombre accesible): con textos los 7
          destinos no caben en 768–1023 px (iPad vertical, iPhone horizontal). */}
      <nav className="hidden md:flex items-center justify-between gap-4 border-b border-gray-100 bg-white px-4 py-3 lg:px-6">
        <div className="flex shrink-0 items-center gap-3">
          <img
            src="/loloshop-logo.png"
            alt="LoloShop"
            className="h-9 w-9 rounded-full border border-gray-100 shadow-sm"
          />
          <span className="font-bold text-lg text-tinta tracking-tight">LoloShop</span>
        </div>
        <div className="flex items-center gap-1 text-sm font-medium lg:gap-6">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.name} 
                href={item.href} 
                aria-current={isActive ? "page" : undefined}
                title={item.name}
                className={`flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-turquesa-texto ${isActive ? 'bg-turquesa px-3 text-tinta' : 'text-gray-600 hover:text-gray-900'}`}
              >
                <item.icon aria-hidden="true" size={18} strokeWidth={isActive ? 2.5 : 2} />
                <span className="sr-only lg:not-sr-only">{item.name}</span>
              </Link>
            )
          })}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Salir"
            className="ml-2 flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md text-gray-600 lg:ml-4 transition-colors hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-turquesa-texto"
          >
            <LogOut aria-hidden="true" size={18} />
            <span className="sr-only lg:not-sr-only">Salir</span>
          </button>
        </div>
      </nav>

      {/* Mobile Top Header (Just Logo) */}
      {/* pt con --safe-top: en la PWA instalada / Android de borde a borde el
          encabezado no queda bajo la barra de estado (0 donde no aplica). */}
      <header className={MOBILE_HEADER}>
        <div className="flex items-center gap-2">
          <img src="/loloshop-logo.png" alt="LoloShop" className="h-7 w-7 rounded-full shadow-sm" />
          <span className="font-bold text-tinta tracking-tight">LoloShop</span>
        </div>
      </header>

      {/* Barra inferior móvil (< md, incluye iPad en Split View / Slide Over).
          Alto = --nav-h + área segura inferior (globals.css); el relleno
          inferior es exactamente el área segura (indicador de inicio / gestos)
          y el lateral respeta la muesca en horizontal. data-bottom-nav activa
          --bottom-nav-offset, que usan el body y las barras pegajosas.
          7 destinos flex-1 con mínimo de 44 px: 7 × 44 = 308 px caben en 320 px. */}
      <nav
        data-bottom-nav=""
        className={BOTTOM_NAV}
      >
        <div className="mx-auto flex h-full max-w-md items-center">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                aria-label={item.name}
                aria-current={isActive ? "page" : undefined}
                className="relative flex h-12 min-w-11 flex-1 flex-col items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-turquesa-texto"
              >
                <div className={`transition-all duration-300 ${isActive ? '-translate-y-1 rounded-full bg-turquesa px-3 py-0.5 text-tinta' : 'text-gray-500'}`}>
                  <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                {isActive && (
                  <span aria-hidden="true" className="absolute bottom-0 text-[10px] font-bold text-turquesa-texto opacity-100 transition-opacity">
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
            className="relative flex h-12 min-w-11 flex-1 flex-col items-center justify-center rounded-lg text-gray-500 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-turquesa-texto"
          >
            <LogOut size={22} />
          </button>
        </div>
      </nav>
    </>
  );
}

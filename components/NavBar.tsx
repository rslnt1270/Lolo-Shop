"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Home, ScanLine, Tags, Package, LogOut } from "lucide-react";

export function NavBar() {
  const pathname = usePathname();
  
  const navItems = [
    { name: "Inicio", href: "/", icon: Home },
    { name: "Escanear", href: "/escanear", icon: ScanLine },
    { name: "Etiquetas", href: "/etiquetas", icon: Tags },
    { name: "Productos", href: "/productos", icon: Package },
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
                className={`flex items-center gap-2 transition-all ${isActive ? 'text-loloteal' : 'text-gray-500 hover:text-gray-900'}`}
              >
                <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                {item.name}
              </Link>
            )
          })}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-2 text-gray-400 hover:text-red-500 transition-colors ml-4"
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-gray-100 bg-white/90 backdrop-blur-xl pb-6 pt-2 px-4 z-50 shadow-[0_-4px_24px_rgba(0,0,0,0.02)]">
        <div className="flex items-center justify-between max-w-sm mx-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className="relative flex flex-col items-center justify-center w-16 h-12"
              >
                <div className={`transition-all duration-300 ${isActive ? '-translate-y-1 text-loloteal' : 'text-gray-400'}`}>
                  <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                {isActive && (
                  <span className="absolute bottom-0 text-[10px] font-bold text-loloteal opacity-100 transition-opacity">
                    {item.name}
                  </span>
                )}
              </Link>
            );
          })}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="relative flex flex-col items-center justify-center w-16 h-12 text-gray-400 hover:text-red-500"
          >
            <LogOut size={22} />
          </button>
        </div>
      </nav>
    </>
  );
}

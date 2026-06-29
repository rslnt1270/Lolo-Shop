"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";

export function NavBar() {
  return (
    <nav className="flex items-center justify-between border-b border-[rgba(18,33,31,0.1)] bg-white px-4 py-2">
      <div className="flex items-center gap-2">
        <img
          src="/loloshop-logo.png"
          alt="LoloShop"
          className="h-8 w-8 rounded-full border border-[#D7EFEE]"
        />
        <span className="font-bold text-[#147E7E]">LoloShop</span>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <Link href="/" className="text-[#3A4D4A] hover:text-loloteal">
          Inicio
        </Link>
        <Link href="/productos" className="text-[#3A4D4A] hover:text-loloteal">
          Productos
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-gray-500 hover:text-gray-700"
        >
          Salir
        </button>
      </div>
    </nav>
  );
}

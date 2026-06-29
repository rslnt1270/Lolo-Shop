"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";

export function NavBar() {
  return (
    <nav className="flex items-center justify-between border-b bg-white px-4 py-3">
      <Link href="/" className="font-bold text-loloteal">LoloShop</Link>
      <div className="flex gap-4 text-sm">
        <Link href="/">Inicio</Link>
        <Link href="/productos">Productos</Link>
        <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-gray-500">
          Salir
        </button>
      </div>
    </nav>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { Location, Product } from "@/lib/domain/types";
import { fetchProductsAction, fetchLocationsAction } from "@/lib/actions";
import { productStock, lowStockVariants } from "@/lib/services/inventory";
import { StockSummary } from "@/components/StockSummary";
import { LowStockList } from "@/components/LowStockList";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const { data: session } = useSession();

  useEffect(() => {
    fetchProductsAction().then(setProducts);
    fetchLocationsAction().then(setLocations);
  }, []);

  const stockTotal = products.reduce((sum, p) => sum + productStock(p), 0);
  const enAlerta = lowStockVariants(products, 1).length;
  const role = session?.user?.role;

  return (
    <main className="mx-auto max-w-2xl">
      {/* Teal gradient hero */}
      <div className="flex items-center gap-3 bg-gradient-to-br from-loloteal to-[#147E7E] px-5 pb-8 pt-6 text-white">
        <img
          src="/loloshop-logo.png"
          alt="LoloShop"
          className="h-11 w-11 flex-none rounded-full border-2 border-white/60"
        />
        <div>
          <p className="text-lg font-extrabold leading-tight">Inventario</p>
          <p className="mt-0.5 font-mono text-[0.74rem] tracking-wide text-white/85">
            Resumen de inventario
          </p>
        </div>
        {role && (
          <span className="ml-auto rounded-full bg-white/20 px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-widest">
            {role}
          </span>
        )}
      </div>

      {/* Body lifted over header bottom */}
      <div className="-mt-3 space-y-5 rounded-t-2xl bg-[#F4FBFA] px-4 pb-6 pt-4">
        {/* KPIs — solo datos reales: sin métricas de ventas/movimientos */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-[14px] border border-[rgba(18,33,31,0.12)] bg-white p-3 text-center">
            <p className="text-2xl font-extrabold leading-none text-[#147E7E]">{stockTotal}</p>
            <p className="mt-1 text-[0.62rem] tracking-wide text-[#3A4D4A]">Stock total</p>
          </div>
          <div className="rounded-[14px] border border-[rgba(18,33,31,0.12)] bg-white p-3 text-center">
            <p className="text-2xl font-extrabold leading-none text-[#147E7E]">{products.length}</p>
            <p className="mt-1 text-[0.62rem] tracking-wide text-[#3A4D4A]">Productos</p>
          </div>
          <div className="rounded-[14px] border border-[#F4CFC8] bg-[#FFE7E2] p-3 text-center">
            <p className="text-2xl font-extrabold leading-none text-[#C23A2B]">{enAlerta}</p>
            <p className="mt-1 text-[0.62rem] tracking-wide text-[#3A4D4A]">En alerta</p>
          </div>
        </div>

        {/* Link al catálogo público */}
        <div className="pt-2">
          <a href="/catalogo" target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#147E7E] p-3 text-sm font-extrabold text-white shadow-sm transition-all hover:bg-[#106666] active:scale-95">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Ver Catálogo Interactivo (Público)
          </a>
        </div>

        {/* Stock por tienda */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-[#12211F]">Stock por tienda</h2>
            <span className="font-mono text-[0.6rem] text-[#3A4D4A]">{stockTotal} unidades</span>
          </div>
          <StockSummary products={products} locations={locations} />
        </section>

        {/* Alertas de stock bajo */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-[#12211F]">Alertas de stock bajo</h2>
            <span className="font-mono text-[0.6rem] text-[#3A4D4A]">umbral ≤ 1</span>
          </div>
          <LowStockList products={products} threshold={1} />
        </section>
      </div>
    </main>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { Location, Product } from "@/lib/domain/types";
import { getDataSource } from "@/lib/data/get-source";
import { productStock, lowStockVariants } from "@/lib/services/inventory";
import { StockSummary } from "@/components/StockSummary";
import { LowStockList } from "@/components/LowStockList";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const { data: session } = useSession();

  useEffect(() => {
    const ds = getDataSource();
    ds.getProducts().then(setProducts);
    ds.getLocations().then(setLocations);
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

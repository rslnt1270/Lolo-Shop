"use client";
import { useEffect, useState } from "react";
import type { Location, Product } from "@/lib/domain/types";
import { getDataSource } from "@/lib/data/get-source";
import { StockSummary } from "@/components/StockSummary";
import { LowStockList } from "@/components/LowStockList";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  useEffect(() => {
    const ds = getDataSource();
    ds.getProducts().then(setProducts);
    ds.getLocations().then(setLocations);
  }, []);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <section>
        <h2 className="mb-2 text-lg font-semibold">Stock por tienda</h2>
        <StockSummary products={products} locations={locations} />
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Alertas de stock bajo</h2>
        <LowStockList products={products} threshold={1} />
      </section>
    </main>
  );
}

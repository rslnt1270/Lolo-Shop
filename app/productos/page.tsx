"use client";
import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/domain/types";
import { filterProducts } from "@/lib/data/filter";
import { SearchFilter } from "@/components/SearchFilter";
import { ProductCard } from "@/components/ProductCard";
import { fetchProductsAction } from "@/lib/actions";

const CATEGORIES = [
  "Playeras", "Pantalones", "Hoodies", "Tenis", "Accesorios", "Perfumes", "Raquetas de Padel",
];

export default function ProductosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    fetchProductsAction().then(setProducts);
  }, []);

  const visible = useMemo(
    () => filterProducts(products, query, category),
    [products, query, category]
  );

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-xl font-bold">Productos</h1>
      <SearchFilter categories={CATEGORIES} onQuery={setQuery} onCategory={setCategory} />
      <div className="grid gap-3">
        {visible.map((p) => <ProductCard key={p.id} product={p} />)}
        {visible.length === 0 && <p className="text-gray-500">Sin resultados.</p>}
      </div>
    </main>
  );
}

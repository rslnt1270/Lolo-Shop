"use client";
import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/domain/types";
import { filterProducts } from "@/lib/data/filter";
import { SearchFilter } from "@/components/products/SearchFilter";
import { ProductCard } from "@/components/products/ProductCard";
import { ProductPhotoButton } from "@/components/products/ProductPhotoButton";
import { fetchProductsAction } from "@/lib/actions";
import { PRODUCT_CATEGORIES } from "@/lib/domain/new-product";

const CATEGORIES = [...PRODUCT_CATEGORIES];

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
        {visible.map((p) => (
          <div key={p.id} className="space-y-1">
            <ProductCard product={p} />
            <div className="flex flex-wrap items-center gap-x-2">
              <ProductPhotoButton
                productId={p.id}
                hasImage={!!p.imageUrl}
                onUpdated={() => fetchProductsAction().then(setProducts)}
              />
              <ProductPhotoButton
                productId={p.id}
                side="back"
                hasImage={!!p.backImageUrl}
                onUpdated={() => fetchProductsAction().then(setProducts)}
              />
              {!(p.imageUrl && p.backImageUrl) && (
                <span className="text-xs text-gray-500">Solo stock: falta una foto para el catálogo</span>
              )}
            </div>
          </div>
        ))}
        {visible.length === 0 && <p className="text-gray-500">Sin resultados.</p>}
      </div>
    </main>
  );
}

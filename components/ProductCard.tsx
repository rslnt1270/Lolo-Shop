import type { Product } from "@/lib/domain/types";
import { productStock } from "@/lib/services/inventory";

export function ProductCard({ product, locationId }: { product: Product; locationId?: string }) {
  return (
    <div className="rounded-lg border p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{product.title}</h3>
        <span className="rounded bg-loloteal/10 px-2 py-1 text-sm text-loloteal">
          {productStock(product, locationId)} en stock
        </span>
      </div>
      <p className="text-sm text-gray-500">{product.brand} · {product.category}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {product.variants.map((v) => (
          <li key={v.id} className="flex justify-between">
            <span>{v.title}</span>
            <span className="text-gray-600">${v.price}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

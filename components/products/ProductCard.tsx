import type { Product } from "@/lib/domain/types";
import { productStock } from "@/lib/services/inventory";

export function ProductCard({ product, locationId }: { product: Product; locationId?: string }) {
  return (
    <div className="rounded-lg border p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{product.title}</h3>
        <span className="rounded bg-niebla px-2 py-1 text-sm text-turquesa-texto">
          {productStock(product, locationId)} en stock
        </span>
      </div>
      <p className="text-sm text-gray-600">{product.brand} · {product.category}</p>
      {product.publicCode && (
        <p className="mt-1 text-sm text-gray-700">
          Código <span className="font-mono font-semibold tracking-wider text-gray-900">{product.publicCode}</span>
        </p>
      )}
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

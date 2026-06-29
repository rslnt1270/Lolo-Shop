import type { Product } from "@/lib/domain/types";
import { lowStockVariants } from "@/lib/services/inventory";

export function LowStockList({ products, threshold }: { products: Product[]; threshold: number }) {
  const low = lowStockVariants(products, threshold);
  if (low.length === 0) return <p className="text-sm text-gray-500">Sin alertas de stock.</p>;
  return (
    <ul className="space-y-1">
      {low.map((e) => (
        <li key={e.variant.id} className="flex justify-between rounded bg-red-50 px-3 py-2 text-sm">
          <span>{e.product.title} — {e.variant.title}</span>
          <span className="font-semibold text-red-600">{e.available}</span>
        </li>
      ))}
    </ul>
  );
}

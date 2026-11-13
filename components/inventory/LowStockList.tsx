import type { Product } from "@/lib/domain/types";
import { lowStockVariants } from "@/lib/services/inventory";

export function LowStockList({ products, threshold }: { products: Product[]; threshold: number }) {
  const low = lowStockVariants(products, threshold);
  if (low.length === 0) return <p className="text-sm text-gray-500">Sin alertas de stock.</p>;
  return (
    <ul className="space-y-2">
      {low.map((e) => (
        <li
          key={e.variant.id}
          className="flex items-center gap-2.5 rounded-[11px] border border-[rgba(18,33,31,0.12)] border-l-[3px] border-l-agotado bg-white px-3 py-2.5 text-sm"
        >
          <span className="h-2 w-2 flex-none rounded-full bg-agotado" />
          <span className="flex-1">
            {e.product.title} — {e.variant.title}
          </span>
          <span className="ml-auto rounded-full border border-agotado bg-white px-2.5 py-0.5 font-mono text-xs font-bold text-agotado">
            {e.available}
          </span>
        </li>
      ))}
    </ul>
  );
}

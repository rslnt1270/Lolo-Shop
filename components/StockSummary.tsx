import type { Location, Product } from "@/lib/domain/types";
import { productStock } from "@/lib/services/inventory";

export function StockSummary({ products, locations }: { products: Product[]; locations: Location[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {locations.map((loc) => {
        const total = products.reduce((sum, p) => sum + productStock(p, loc.id), 0);
        return (
          <div key={loc.id} className="rounded-lg border p-4 text-center">
            <p className="text-sm text-gray-500">{loc.name}</p>
            <p data-testid={`stock-${loc.id}`} className="text-3xl font-bold text-loloteal">
              {total}
            </p>
            <p className="text-xs text-gray-400">unidades</p>
          </div>
        );
      })}
    </div>
  );
}

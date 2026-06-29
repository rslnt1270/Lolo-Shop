import type { Location, Product } from "@/lib/domain/types";
import { productStock } from "@/lib/services/inventory";

export function StockSummary({ products, locations }: { products: Product[]; locations: Location[] }) {
  const grandTotal = products.reduce((sum, p) => sum + productStock(p), 0);

  return (
    <div className="space-y-2">
      {locations.map((loc) => {
        const locTotal = products.reduce((sum, p) => sum + productStock(p, loc.id), 0);
        const pct = grandTotal > 0 ? (locTotal / grandTotal) * 100 : 0;
        return (
          <div
            key={loc.id}
            className="rounded-[14px] border border-[rgba(18,33,31,0.12)] bg-white p-3.5"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold">{loc.name}</span>
              <span
                data-testid={`stock-${loc.id}`}
                className="text-xl font-extrabold text-[#147E7E]"
              >
                {locTotal}{" "}
                <small className="text-[0.62rem] font-normal text-gray-500">uds</small>
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#D7EFEE]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-loloteal to-[#147E7E]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

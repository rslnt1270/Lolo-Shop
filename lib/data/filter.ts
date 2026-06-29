import type { Product } from "@/lib/domain/types";

export function filterProducts(
  products: Product[],
  query: string,
  category: string | null
): Product[] {
  const q = query.trim().toLowerCase();
  return products.filter((p) => {
    if (category && p.category !== category) return false;
    if (!q) return true;
    const haystack = [
      p.title,
      p.brand,
      p.category,
      ...p.variants.map((v) => v.sku),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

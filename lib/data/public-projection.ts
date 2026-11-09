import type { Product } from "@/lib/domain/types";
import type { InventoryDataSource } from "./source";

/** Lo único que el catálogo público y el bot pueden ver (ER §2.7): sin SKU, barcode ni conteos. */
export interface PublicProduct {
  id: string;
  publicCode: string | null;
  title: string;
  brand: string;
  category: string;
  imageUrl: string | null;
  backImageUrl: string | null;
  sizes: { size: string; available: boolean }[];
  price: number | null;
}

/**
 * Proyección pública. `storeLocationIds` son las ubicaciones de tipo `store`;
 * una talla está disponible si alguna variante activa tiene > 0 en una de ellas.
 * Excluye variantes inactivas; el llamador descarta productos inactivos.
 */
export function toPublicProduct(
  p: Product & { publicCode: string | null },
  storeLocationIds: ReadonlySet<string>,
): PublicProduct {
  const bySize = new Map<string, boolean>();
  const prices: number[] = [];
  for (const v of p.variants) {
    if (v.isActive === false) continue;
    const inStore = v.inventory.some((l) => storeLocationIds.has(l.locationId) && l.available > 0);
    bySize.set(v.size, (bySize.get(v.size) ?? false) || inStore);
    prices.push(v.price);
  }
  return {
    id: p.id,
    publicCode: p.publicCode,
    title: p.title,
    brand: p.brand,
    category: p.category,
    imageUrl: p.imageUrl,
    backImageUrl: p.backImageUrl ?? null,
    sizes: [...bySize].map(([size, available]) => ({ size, available })),
    price: prices.length ? Math.min(...prices) : null,
  };
}

/** Catálogo público: productos activos con las dos fotos (frente y atrás) y al menos una variante activa. */
export async function getPublicCatalog(ds: InventoryDataSource): Promise<PublicProduct[]> {
  const [products, locations] = await Promise.all([ds.getProducts(), ds.getLocations()]);
  const storeIds = new Set(locations.filter((l) => l.type === "store").map((l) => l.id));
  return products
    .filter((p) => p.isActive !== false && !!p.imageUrl && !!p.backImageUrl)
    .map((p) => toPublicProduct({ ...p, publicCode: p.publicCode ?? null }, storeIds))
    .filter((p) => p.sizes.length > 0);
}

/** Búsqueda del bot: solo por título, marca y categoría (nunca por SKU). */
export function matchesPublicQuery(p: PublicProduct, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [p.title, p.brand, p.category].join(" ").toLowerCase().includes(q);
}

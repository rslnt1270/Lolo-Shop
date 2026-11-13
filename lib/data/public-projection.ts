import type { Location, Product } from "@/lib/domain/types";
import { catalogEligibility, hasStockInPublicStore } from "@/lib/domain/catalog-eligibility";
import { sortSizes } from "@/lib/domain/sizes";
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
  sizes: { size: string; available: boolean; price: number }[];
  price: number | null;
  /** Departamento activo del producto; inactivo o sin asignar -> null (spec §3.1). */
  department: { slug: string; name: string; sortOrder: number } | null;
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
  // Misma talla en dos variantes activas: precio menor y disponible si alguna lo está.
  const bySize = new Map<string, { available: boolean; price: number }>();
  for (const v of p.variants) {
    if (v.isActive === false) continue;
    const inStore = v.inventory.some((l) => storeLocationIds.has(l.locationId) && l.available > 0);
    const prev = bySize.get(v.size);
    bySize.set(v.size, {
      available: (prev?.available ?? false) || inStore,
      price: prev ? Math.min(prev.price, v.price) : v.price,
    });
  }
  const sizes = sortSizes([...bySize.keys()]).map((size) => ({ size, ...bySize.get(size)! }));
  return {
    id: p.id,
    publicCode: p.publicCode,
    title: p.title,
    brand: p.brand,
    category: p.category,
    imageUrl: p.imageUrl,
    backImageUrl: p.backImageUrl ?? null,
    sizes,
    price: sizes.length ? Math.min(...sizes.map((x) => x.price)) : null,
    department:
      p.department && p.department.isActive
        ? { slug: p.department.slug, name: p.department.name, sortOrder: p.department.sortOrder }
        : null,
  };
}

/** Tiendas que cuentan para el sitio: type store e isPublic distinto de false (ausente = pública). */
export function publicStoreIds(locations: Pick<Location, "id" | "type" | "isPublic">[]): Set<string> {
  return new Set(locations.filter((l) => l.type === "store" && l.isPublic !== false).map((l) => l.id));
}

/** Regla de verdad del sitio: publicado por owner/manager Y elegible (fotos, descripción, existencias). */
function isPublicListed(p: Product, storeIds: ReadonlySet<string>): boolean {
  return (
    p.isPublished === true &&
    catalogEligibility({
      imageUrl: p.imageUrl,
      backImageUrl: p.backImageUrl,
      description: p.description,
      hasStockInPublicStore: hasStockInPublicStore(p, storeIds),
    }).eligible
  );
}

/**
 * Catálogo público: la fuente prefiltra (activos, sin unir, publicados, con frente y atrás);
 * aquí se exige publicado + elegible y alguna talla disponible en una tienda pública.
 */
export async function getPublicCatalog(ds: InventoryDataSource): Promise<PublicProduct[]> {
  const [products, locations] = await Promise.all([ds.getCatalogProducts(), ds.getLocations()]);
  const storeIds = publicStoreIds(locations);
  return products
    .filter((p) => isPublicListed(p, storeIds))
    .map((p) => toPublicProduct({ ...p, publicCode: p.publicCode ?? null }, storeIds))
    .filter((p) => p.sizes.some((x) => x.available));
}

/** Búsqueda del bot: solo por título, marca y categoría (nunca por SKU). */
export function matchesPublicQuery(p: PublicProduct, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [p.title, p.brand, p.category].join(" ").toLowerCase().includes(q);
}

/**
 * Producto público por código: resuelve uniones (el código de un producto unido
 * devuelve el que se quedó) y proyecta solo si es público: activo, publicado,
 * elegible y con alguna talla disponible. Lo usan el bot de WhatsApp, el modal y la ficha.
 */
export async function findPublicByCode(ds: InventoryDataSource, code: string): Promise<PublicProduct | null> {
  const product = await ds.getProductByPublicCode(code);
  if (!product || product.isActive === false || !product.imageUrl || !product.backImageUrl) return null;
  const locations = await ds.getLocations();
  const storeIds = publicStoreIds(locations);
  if (!product.isPublished || !isPublicListed(product, storeIds)) return null;
  const projected = toPublicProduct({ ...product, publicCode: product.publicCode ?? null }, storeIds);
  return projected.sizes.some((x) => x.available) ? projected : null;
}

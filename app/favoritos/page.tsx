import { fetchPublicProductsAction } from "@/lib/actions";
import FavoritesClient from "@/components/favorites/FavoritesClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Favoritos | LoloShop" };

/** Pública: solo lee la proyección pública; los favoritos viven en el navegador. */
export default async function FavoritosPage() {
  let loadError = false;
  const products = await fetchPublicProductsAction().catch((err: unknown) => {
    console.error("[favoritos] No se pudo cargar el catálogo:", err);
    loadError = true;
    return [];
  });
  return <FavoritesClient products={products} loadError={loadError} />;
}

import { fetchPublicProductsAction } from "@/lib/actions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import CatalogClient from "./CatalogClient";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const session = await getServerSession(authOptions);

  let loadError = false;
  const products = await fetchPublicProductsAction().catch((err: unknown) => {
    console.error("[catalogo] No se pudieron cargar productos:", err);
    loadError = true;
    return [];
  });

  return (
    <CatalogClient
      isLoggedIn={Boolean(session?.user)}
      products={products}
      loadError={loadError}
    />
  );
}

import { fetchPublicProductsAction } from "@/lib/actions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import CatalogClient from "./CatalogClient";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const session = await getServerSession(authOptions);

  const products = await fetchPublicProductsAction().catch((err: unknown) => {
    console.error("[catalogo] No se pudieron cargar productos:", err);
    return [];
  });
  
  const featuredProduct = products.length > 0 ? products[0] : null;
  const imageSrc = featuredProduct?.imageUrl || "https://lh3.googleusercontent.com/aida-public/AB6AXuD6HqCZ1QwPLfT275aW3h9N_AJgtN9KK3rPw25D8YYiUWLiue26Z_5RmK87lVE9CsRUS37mYwcZs4tY0DZWPq4slB6tACrRvgcx-CNatV2g6NsJTlNr_nqfbHlcfJPX0rQdUY6x2mH-KGPfGeJIBC3C-Ndh51eeeg4WmX32gNhmXdfvcyIE4TlbGExldW_uhQ_BmAEbh-fW2Wap7ZXWvfzfqiaWX5Xket2hQJmHgnEwlVjFtxhri3RgmLCZ27R_x2Acc22-4DZopzUL";
  const title = featuredProduct?.title || "GHOST_PUFFER v1";
  
  const waMessage = encodeURIComponent(`Hola, me interesa apartar el producto: ${title}`);

  return (
    <CatalogClient
      isLoggedIn={Boolean(session?.user)}
      title={title}
      imageSrc={imageSrc}
      waMessage={waMessage}
    />
  );
}

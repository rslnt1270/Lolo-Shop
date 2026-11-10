"use client";

import type { PublicProduct } from "@/lib/data/public-projection";
import { VirtualStoreCatalog } from "@/components/virtual-store/VirtualStoreCatalog";

interface Props {
  isLoggedIn: boolean;
  products?: PublicProduct[];
  /** La base falló: se avisa el error en vez del catálogo vacío. */
  loadError?: boolean;
}

export default function CatalogClient({
  isLoggedIn,
  products = [],
  loadError = false,
}: Props) {
  return (
    <VirtualStoreCatalog
      initialProducts={products}
      isLoggedIn={isLoggedIn}
      loadError={loadError}
    />
  );
}

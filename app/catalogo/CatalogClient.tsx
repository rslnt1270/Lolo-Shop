"use client";

import type { PublicProduct } from "@/lib/data/public-projection";
import { VirtualStoreCatalog } from "@/components/virtual-store/VirtualStoreCatalog";

interface Props {
  isLoggedIn: boolean;
  products?: PublicProduct[];
}

export default function CatalogClient({
  isLoggedIn,
  products = [],
}: Props) {
  return (
    <VirtualStoreCatalog
      initialProducts={products}
      isLoggedIn={isLoggedIn}
    />
  );
}

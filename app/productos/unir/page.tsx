import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserOrNull } from "@/lib/auth/permissions";
import { getDataSource } from "@/lib/data/get-source";
import { findSizeDuplicateGroups } from "@/lib/domain/size-duplicates";
import prisma from "@/lib/prisma";
import { MergeGroups } from "./MergeGroups";

export const dynamic = "force-dynamic";

export default async function UnirProductosPage() {
  const user = await currentUserOrNull();
  if (!user) redirect("/login");
  const isOwner = user.role === "owner";

  let content;
  if (isOwner) {
    const ds = getDataSource();
    const [products, locations] = await Promise.all([ds.getProducts(), ds.getLocations()]);
    const groups = findSizeDuplicateGroups(products);
    const ids = groups.flatMap((g) => g.products.map((p) => p.id));
    const counts = ids.length
      ? await prisma.saleLine.groupBy({ by: ["productId"], where: { productId: { in: ids } }, _count: { _all: true } })
      : [];
    const saleCounts = Object.fromEntries(counts.map((c) => [c.productId, c._count._all]));
    content = (
      <MergeGroups
        groups={groups}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        saleCounts={saleCounts}
        isOwner
      />
    );
  } else {
    content = <MergeGroups groups={[]} locations={[]} saleCounts={{}} isOwner={false} />;
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <Link href="/productos" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-loloteal">
        ← Productos
      </Link>
      <h1 className="text-xl font-bold">Unir productos duplicados</h1>
      <p className="text-sm text-gray-700">
        Estos productos parecen ser la misma prenda dada de alta por talla. Al unirlos quedan en una sola ficha con todas las tallas; las ventas y los movimientos no cambian.
      </p>
      {content}
    </main>
  );
}

/**
 * Relleno de tipos de producto: crea el catálogo de tipos y la puente
 * departamento ↔ tipo, y asigna tipo a productos y ventas viejos.
 * Idempotente. Nunca escribe un par (departamento, tipo) inválido: esos
 * productos quedan sin tipo y se cuentan en `mismatched` ("Por revisar").
 *
 * Uso: npx tsx prisma/scripts/backfill-product-types.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  DEPARTMENT_TYPE_SLUGS, LEGACY_CATEGORY_TO_TYPE, PRODUCT_TYPE_CATALOG,
} from "../../lib/domain/product-types-catalog";

export interface BackfillProductTypesResult {
  /** Tipos creados en esta corrida. */
  types: number;
  /** Pares departamento-tipo creados en esta corrida. */
  pairs: number;
  /** Productos que recibieron tipo en esta corrida. */
  products: number;
  /** Líneas de venta que recibieron tipo en esta corrida. */
  saleLines: number;
  /** Productos con texto mapeable cuyo departamento no admite el tipo (siguen sin tipo). */
  mismatched: number;
  /** Productos sin tipo por texto de categoría (excluye los mismatched). */
  unmapped: Record<string, number>;
}

export async function backfillProductTypes(prisma: PrismaClient): Promise<BackfillProductTypesResult> {
  // 1. Departamentos: abortar antes de escribir si falta alguno.
  const departments = await prisma.department.findMany({ select: { id: true, slug: true } });
  const deptBySlug = new Map(departments.map((d) => [d.slug, d.id]));
  for (const slug of Object.keys(DEPARTMENT_TYPE_SLUGS)) {
    if (!deptBySlug.has(slug)) {
      throw new Error(`Falta el departamento ${slug}: corre primero backfill-brand-department.`);
    }
  }

  // 2. Tipos: no actualiza los existentes (no pisa un renombre del dueño).
  const types = (
    await prisma.productType.createMany({
      data: PRODUCT_TYPE_CATALOG.map((t) => ({ slug: t.slug, name: t.name, sortOrder: t.sortOrder })),
      skipDuplicates: true,
    })
  ).count;
  const typeRows = await prisma.productType.findMany({ select: { id: true, slug: true, name: true } });
  const typeBySlug = new Map(typeRows.map((t) => [t.slug, t]));

  // 3. Pares.
  const pairData: { departmentId: string; productTypeId: string }[] = [];
  for (const [deptSlug, typeSlugs] of Object.entries(DEPARTMENT_TYPE_SLUGS)) {
    for (const typeSlug of typeSlugs) {
      pairData.push({
        departmentId: deptBySlug.get(deptSlug) as string,
        productTypeId: (typeBySlug.get(typeSlug) as { id: string }).id,
      });
    }
  }
  const pairs = (await prisma.departmentProductType.createMany({ data: pairData, skipDuplicates: true })).count;
  const allowed = new Set(
    (await prisma.departmentProductType.findMany()).map((p) => `${p.departmentId}:${p.productTypeId}`),
  );

  // Texto viejo → slug: el mapa legado más el nombre vigente de cada tipo.
  const textToSlug = new Map<string, string>(Object.entries(LEGACY_CATEGORY_TO_TYPE));
  for (const t of typeRows) if (!textToSlug.has(t.name)) textToSlug.set(t.name, t.slug);

  // 4. Productos.
  let products = 0;
  let mismatched = 0;
  const mismatchedByCategory = new Map<string, number>();
  for (const [text, slug] of textToSlug) {
    const type = typeBySlug.get(slug);
    if (!type) continue;
    const candidates = await prisma.product.findMany({
      where: { productTypeId: null, category: text },
      select: { id: true, departmentId: true },
    });
    const ids: string[] = [];
    for (const c of candidates) {
      if (c.departmentId && !allowed.has(`${c.departmentId}:${type.id}`)) {
        mismatched++;
        mismatchedByCategory.set(text, (mismatchedByCategory.get(text) ?? 0) + 1);
      } else {
        ids.push(c.id);
      }
    }
    if (ids.length > 0) {
      const r = await prisma.product.updateMany({
        where: { id: { in: ids }, productTypeId: null },
        data: { productTypeId: type.id, category: type.name },
      });
      products += r.count;
    }
  }

  // 5. Ventas: la copia histórica de la línea; no se toca `category`.
  let saleLines = 0;
  for (const [text, slug] of textToSlug) {
    const type = typeBySlug.get(slug);
    if (!type) continue;
    const r = await prisma.saleLine.updateMany({
      where: { productTypeId: null, category: text },
      data: { productTypeId: type.id },
    });
    saleLines += r.count;
  }

  // 6. Sin mapear.
  const unmapped: Record<string, number> = {};
  const groups = await prisma.product.groupBy({
    by: ["category"], where: { productTypeId: null }, _count: true,
  });
  for (const g of groups) {
    const n = g._count - (mismatchedByCategory.get(g.category) ?? 0);
    if (n > 0) unmapped[g.category] = n;
  }

  return { types, pairs, products, saleLines, mismatched, unmapped };
}

// Ejecución directa (no al importar desde los tests).
if (process.argv[1] && /backfill-product-types\.[tj]s$/.test(process.argv[1])) {
  const prisma = new PrismaClient();
  backfillProductTypes(prisma)
    .then((r) => {
      console.log(
        `Relleno listo: ${r.types} tipos, ${r.pairs} pares, ${r.products} productos, ${r.saleLines} líneas de venta, ${r.mismatched} por revisar (departamento no admite el tipo).`,
      );
      const names = Object.entries(r.unmapped);
      if (names.length > 0) console.log("Sin tipo:", names.map(([k, n]) => `${k} (${n})`).join(", "));
    })
    .catch((e) => {
      console.error("Relleno falló:", e instanceof Error ? e.message : "error desconocido");
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

/**
 * Relleno de marcas, departamentos, códigos públicos y umbral de stock bajo.
 * Idempotente: puede correrse varias veces sin duplicar nada.
 *
 * Uso: npx tsx prisma/scripts/backfill-brand-department.ts
 */
import { PrismaClient } from "@prisma/client";
import { slugify } from "../../lib/domain/slug";
import { generatePublicCode } from "../../lib/domain/public-code";

const DEPARTMENTS = [
  { slug: "dama", name: "Dama" },
  { slug: "caballero", name: "Caballero" },
  { slug: "ninos", name: "Niños" },
  { slug: "calzado", name: "Calzado" },
  { slug: "accesorios", name: "Accesorios" },
];

const MAX_CODE_ATTEMPTS = 20;

export interface BackfillResult {
  /** Marcas creadas en esta corrida. */
  brands: number;
  /** Productos modificados (brandId y/o publicCode) en esta corrida. */
  products: number;
  /** Departamentos creados en esta corrida. */
  departments: number;
}

const normalizeName = (raw: string) => raw.trim().replace(/\s+/g, " ");

export async function backfillBrandDepartment(prisma: PrismaClient): Promise<BackfillResult> {
  let brands = 0;
  let products = 0;
  let departments = 0;

  for (const [i, dep] of DEPARTMENTS.entries()) {
    const exists = await prisma.department.findUnique({ where: { slug: dep.slug } });
    if (!exists) {
      await prisma.department.create({ data: { ...dep, sortOrder: i + 1 } });
      departments++;
    }
  }

  const brandIdBySlug = new Map<string, string>();
  for (const b of await prisma.brand.findMany({ select: { id: true, slug: true } })) {
    brandIdBySlug.set(b.slug, b.id);
  }
  const usedCodes = new Set(
    (await prisma.product.findMany({ where: { publicCode: { not: null } }, select: { publicCode: true } })).map(
      (p) => p.publicCode as string,
    ),
  );

  const pending = await prisma.product.findMany({
    where: { OR: [{ brandId: null }, { publicCode: null }] },
    select: { id: true, brand: true, brandId: true, publicCode: true },
    orderBy: { createdAt: "asc" },
  });

  for (const p of pending) {
    const data: { brandId?: string; publicCode?: string } = {};

    if (!p.brandId) {
      const name = normalizeName(p.brand);
      const slug = slugify(name);
      if (slug) {
        let id = brandIdBySlug.get(slug);
        if (!id) {
          id = (await prisma.brand.create({ data: { name, slug } })).id;
          brandIdBySlug.set(slug, id);
          brands++;
        }
        data.brandId = id;
      }
    }

    if (!p.publicCode) {
      let code = "";
      for (let n = 0; n < MAX_CODE_ATTEMPTS; n++) {
        const candidate = generatePublicCode();
        if (!usedCodes.has(candidate)) {
          code = candidate;
          break;
        }
      }
      if (!code) throw new Error("No se pudo generar un publicCode único tras varios intentos");
      usedCodes.add(code);
      data.publicCode = code;
    }

    if (Object.keys(data).length > 0) {
      await prisma.product.update({ where: { id: p.id }, data });
      products++;
    }
  }

  await prisma.appSetting.upsert({
    where: { key: "lowStockThreshold" },
    create: { key: "lowStockThreshold", value: 2 },
    update: {},
  });

  return { brands, products, departments };
}

// Ejecución directa (no al importar desde los tests).
if (process.argv[1] && /backfill-brand-department\.[tj]s$/.test(process.argv[1])) {
  const prisma = new PrismaClient();
  backfillBrandDepartment(prisma)
    .then((r) => console.log(`Relleno listo: ${r.brands} marcas, ${r.products} productos, ${r.departments} departamentos nuevos.`))
    .catch((e) => {
      console.error("Relleno falló:", e instanceof Error ? e.message : "error desconocido");
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

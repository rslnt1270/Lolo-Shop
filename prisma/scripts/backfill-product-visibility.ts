/**
 * Relleno de visibilidad de productos en el sitio público.
 * Idempotente: solo escribe filas cuyo estado cambia.
 *
 * Uso:
 *   npx tsx prisma/scripts/backfill-product-visibility.ts [--publish <ruta.csv>] [--unpublish <ruta.csv>] [--all-false]
 *
 * - Sin argumentos no publica nada (y despublica lo que estuviera publicado).
 * - --publish: CSV (encabezado `id`) con los ids cuyas fotos de frente y atrás el dueño confirma en fondo blanco.
 * - --unpublish: CSV (encabezado `id`) con ids de fotos de tienda; gana sobre --publish y limpia catalogPhotosCheckedAt.
 * - --all-false: retroceso; deja todo sin publicar y no toca catalogPhotosCheckedAt.
 * Orden: migraciones y relleno de tipos (backfill-product-types.ts) antes de este script; si falta una migración
 * o no existe ningún tipo de producto, se detiene (excepto con --all-false, que nunca se bloquea).
 * Código de salida 1 si hay ids no encontrados o no publicables (los cambios válidos sí se aplican).
 * Los CSV viven fuera del repo (~/respaldos/loloshop/visibilidad/).
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { TX_OPTIONS } from "../../lib/data/tx-options";
import { parseIdList, planVisibility, type VisibilityPlan } from "./lib/plan-visibility";

export interface BackfillVisibilityResult {
  /** Filas cambiadas a true. */
  published: number;
  /** Filas cambiadas a false. */
  unpublished: number;
  /** Filas con catalogPhotosCheckedAt puesto en null. */
  checkedCleared: number;
  plan: VisibilityPlan;
}

const REQUIRED_MIGRATIONS = ["_add_product_types", "_catalog_color_visibility"];

/**
 * Orden de salida: migraciones, relleno de tipos, relleno de visibilidad.
 * Falla con un mensaje claro (nunca el error crudo de Prisma) si falta alguna migración
 * o si hay productos y ningún ProductType (el relleno de tipos no corrió).
 */
export async function assertVisibilityPrerequisites(
  prisma: PrismaClient,
  requiredSuffixes: string[] = REQUIRED_MIGRATIONS,
): Promise<void> {
  const migrationsMsg = "Aplica primero las migraciones (add_product_types y catalog_color_visibility).";
  let applied: string[];
  try {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    applied = rows.map((r) => r.migration_name);
  } catch {
    throw new Error(migrationsMsg);
  }
  if (!requiredSuffixes.every((suf) => applied.some((n) => n.endsWith(suf)))) throw new Error(migrationsMsg);

  let products: number;
  let types: number;
  try {
    [products, types] = await Promise.all([prisma.product.count(), prisma.productType.count()]);
  } catch {
    throw new Error(migrationsMsg);
  }
  if (products > 0 && types === 0) {
    throw new Error(
      "No existen tipos de producto: corre antes prisma/scripts/backfill-product-types.ts (orden: migraciones, relleno de tipos, relleno de visibilidad).",
    );
  }
}

export async function backfillProductVisibility(
  prisma: PrismaClient,
  opts: { publishIds: string[]; forceUnpublishIds: string[]; allFalse: boolean },
): Promise<BackfillVisibilityResult> {
  if (!opts.allFalse) await assertVisibilityPrerequisites(prisma);
  const [products, locations] = await Promise.all([
    prisma.product.findMany({
      select: {
        id: true, imageUrl: true, backImageUrl: true, description: true,
        isPublished: true, catalogPhotosCheckedAt: true,
      },
    }),
    prisma.location.findMany({ select: { id: true, type: true, isPublic: true } }),
  ]);

  const plan = planVisibility({
    products,
    locations,
    publishIds: opts.allFalse ? [] : opts.publishIds,
    forceUnpublishIds: opts.allFalse ? [] : opts.forceUnpublishIds,
  });

  const { published, unpublished, checkedCleared } = await prisma.$transaction(async (tx) => {
    const unpub = plan.unpublish.length
      ? await tx.product.updateMany({
          where: { id: { in: plan.unpublish }, isPublished: true },
          data: { isPublished: false },
        })
      : { count: 0 };
    const cleared = plan.clearChecked.length
      ? await tx.product.updateMany({
          where: { id: { in: plan.clearChecked }, catalogPhotosCheckedAt: { not: null } },
          data: { catalogPhotosCheckedAt: null },
        })
      : { count: 0 };
    let pub = 0;
    if (plan.publish.length) {
      pub = (
        await tx.product.updateMany({
          where: { id: { in: plan.publish }, isPublished: false },
          data: { isPublished: true },
        })
      ).count;
      await tx.product.updateMany({
        where: { id: { in: plan.publish }, catalogPhotosCheckedAt: null },
        data: { catalogPhotosCheckedAt: new Date() },
      });
    }
    return { published: pub, unpublished: unpub.count, checkedCleared: cleared.count };
  }, TX_OPTIONS);

  return { published, unpublished, checkedCleared, plan };
}

function readIdFile(path: string): string[] {
  const raw = readFileSync(path, "utf8").replace(/^﻿/, "");
  const first = raw.split(/\r?\n/).find((l) => l.trim() !== "");
  if (first?.trim().toLowerCase() !== "id") {
    throw new Error(`El CSV ${path} debe tener el encabezado "id" en la primera línea.`);
  }
  return parseIdList(raw);
}

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i === -1) return undefined;
  const v = args[i + 1];
  if (!v || v.startsWith("--")) throw new Error(`Falta la ruta después de ${flag}.`);
  return v;
}

// Ejecución directa (no al importar desde los tests).
if (process.argv[1] && /backfill-product-visibility\.[tj]s$/.test(process.argv[1])) {
  const prisma = new PrismaClient();
  (async () => {
    const args = process.argv.slice(2);
    const publishPath = argValue(args, "--publish");
    const unpublishPath = argValue(args, "--unpublish");
    const r = await backfillProductVisibility(prisma, {
      publishIds: publishPath ? readIdFile(publishPath) : [],
      forceUnpublishIds: unpublishPath ? readIdFile(unpublishPath) : [],
      allFalse: args.includes("--all-false"),
    });
    console.log(
      `Visibilidad lista: ${r.published} publicados, ${r.unpublished} despublicados, ${r.checkedCleared} fotos de tienda excluidas.`,
    );
    for (const w of r.plan.warnings) console.warn("Aviso:", w);
    if (r.plan.unknownIds.length) console.error("Ids no encontrados:", r.plan.unknownIds.join(", "));
    if (r.plan.notPublishable.length) {
      console.error("Ids sin foto de frente, foto de atrás o descripción:", r.plan.notPublishable.join(", "));
    }
    if (r.plan.unknownIds.length || r.plan.notPublishable.length) process.exitCode = 1;
  })()
    .catch((e) => {
      console.error("Relleno falló:", e instanceof Error ? e.message : "error desconocido");
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

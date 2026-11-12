/**
 * Planificador puro de visibilidad de productos (sin base de datos).
 * Decide qué publicar, despublicar y qué fechas de revisión de fotos limpiar
 * a partir de las listas de ids que aporta el dueño.
 */
export interface ProductRow {
  id: string;
  imageUrl: string | null;
  backImageUrl: string | null;
  description: string | null;
  isPublished: boolean;
  catalogPhotosCheckedAt: Date | null;
}

export interface LocationRow {
  id: string;
  type: "store" | "warehouse";
  isPublic: boolean;
}

export interface VisibilityPlan {
  /** Ids a poner isPublished = true y catalogPhotosCheckedAt = now() si es nulo. */
  publish: string[];
  /** Ids a poner isPublished = false. */
  unpublish: string[];
  /** Ids de exclusión: catalogPhotosCheckedAt = null (fotos de tienda). */
  clearChecked: string[];
  /** Ids de las listas que no existen en la base. */
  unknownIds: string[];
  /** Ids de publishIds sin imageUrl, sin backImageUrl o sin descripción. */
  notPublishable: string[];
  warnings: string[];
}

/** Quita BOM, espacios, líneas vacías, duplicados y el encabezado `id`. No cambia mayúsculas. */
export function parseIdList(raw: string): string[] {
  const lines = raw.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim().replace(/^﻿/, ""));
  const nonEmpty = lines.filter((l) => l !== "");
  if (nonEmpty[0]?.toLowerCase() === "id") nonEmpty.shift();
  return [...new Set(nonEmpty)];
}

const filled = (v: string | null) => v !== null && v.trim() !== "";

export function planVisibility(input: {
  products: ProductRow[];
  locations: LocationRow[];
  publishIds: string[];
  forceUnpublishIds: string[];
}): VisibilityPlan {
  const byId = new Map(input.products.map((p) => [p.id, p]));
  const force = new Set(input.forceUnpublishIds);

  const unknownIds = [...new Set([...input.publishIds, ...input.forceUnpublishIds])].filter((id) => !byId.has(id));

  const publish: string[] = [];
  const notPublishable: string[] = [];
  for (const id of new Set(input.publishIds)) {
    const p = byId.get(id);
    if (!p || force.has(id)) continue;
    if (filled(p.imageUrl) && filled(p.backImageUrl) && filled(p.description)) publish.push(id);
    else notPublishable.push(id);
  }

  const publishSet = new Set(publish);
  const unpublish = input.products.filter((p) => p.isPublished && !publishSet.has(p.id)).map((p) => p.id);
  const clearChecked = [...force].filter((id) => byId.get(id)?.catalogPhotosCheckedAt != null);

  const warnings: string[] = [];
  if (!input.locations.some((l) => l.type === "store" && l.isPublic)) {
    warnings.push("No hay ninguna tienda pública (type = store e isPublic = true): el sitio quedará vacío.");
  }

  return { publish, unpublish, clearChecked, unknownIds, notPublishable, warnings };
}

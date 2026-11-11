import type { PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import { BASE_COLORS, displayColor, normalizeColorKey } from "@/lib/domain/product-reference";

type Db = Pick<PrismaClient, "colorOption">;

/** Colores base primero y después los de la tabla, sin repetir por clave. */
export async function listColors(db: Db = prisma): Promise<string[]> {
  const rows = await db.colorOption.findMany({ select: { label: true }, orderBy: [{ createdAt: "asc" }, { label: "asc" }] });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of [...BASE_COLORS, ...rows.map((r) => r.label)]) {
    const key = normalizeColorKey(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/**
 * Agrega un color a la lista compartida. Si la clave ya existe (base o tabla)
 * devuelve la etiqueta existente sin crear fila. El llamador valida el texto
 * (`validateReference`); aquí una clave vacía es un error.
 */
export async function addColor(raw: string, userId: string, db: Db = prisma): Promise<{ label: string }> {
  const key = normalizeColorKey(raw);
  if (!key) throw new Error("Escribe un color.");
  const base = BASE_COLORS.find((c) => normalizeColorKey(c) === key);
  if (base) return { label: base };
  const existing = await db.colorOption.findUnique({ where: { key } });
  if (existing) return { label: existing.label };
  try {
    const created = await db.colorOption.create({
      data: { key, label: displayColor(raw), createdById: userId },
    });
    return { label: created.label };
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code !== "P2002") throw err;
    // Otra caja creó la misma clave al mismo tiempo: se usa la ganadora.
    const winner = await db.colorOption.findUnique({ where: { key } });
    if (!winner) throw err;
    return { label: winner.label };
  }
}

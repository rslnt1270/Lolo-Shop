import { InventoryDataSource, VariantMatch, CreateProductData, CreateLocationData, RecordStockMovementData } from "./source";
import { InsufficientStockError, StockTargetNotFoundError } from "./errors";
import type { Location, Product, Variant } from "../domain/types";
import prisma from "../prisma";
import { Prisma, type PrismaClient } from "@prisma/client";
import { codeCandidates } from "../domain/barcode";
import { DEFAULT_SIZE } from "../domain/new-product";

/**
 * Numéricos (EAN/UPC) → `in` exacto (usa el índice único). Alfanuméricos →
 * comparación sin mayúsculas, para encontrar datos viejos guardados en minúsculas.
 */
function codeWhere(candidates: string[]) {
  const numeric = candidates.filter((c) => /^\d+$/.test(c));
  const seen = new Set<string>();
  const alpha = candidates.filter((c) => {
    if (/^\d+$/.test(c) || seen.has(c.toUpperCase())) return false;
    seen.add(c.toUpperCase());
    return true;
  });
  const or: Prisma.VariantWhereInput[] = [];
  if (numeric.length) or.push({ barcode: { in: numeric } }, { sku: { in: numeric } });
  for (const c of alpha) {
    or.push({ barcode: { equals: c, mode: "insensitive" as const } }, { sku: { equals: c, mode: "insensitive" as const } });
  }
  return or;
}

export class PrismaDataSource implements InventoryDataSource {
  constructor(private readonly db: PrismaClient = prisma) {}

  async getLocations(): Promise<Location[]> {
    const locs = await this.db.location.findMany({ orderBy: { createdAt: "asc" } });
    return locs.map(l => ({
      id: l.id,
      name: l.name,
      type: l.type as any
    }));
  }

  async createLocation(data: CreateLocationData): Promise<Location> {
    const name = data.name.trim();
    if (!name) throw new Error("El nombre de la tienda es obligatorio.");
    const loc = await this.db.location.create({
      data: { name, type: (data.type ?? "store") as any },
    });
    return { id: loc.id, name: loc.name, type: loc.type as any };
  }

  async getProducts(): Promise<Product[]> {
    const prods = await this.db.product.findMany({
      include: { 
        variants: {
          include: { inventory: true }
        }
      }
    });
    return prods.map(p => ({
      id: p.id,
      title: p.title,
      brand: p.brand,
      category: p.category,
      imageUrl: p.imageUrl,
      backImageUrl: p.backImageUrl,
      description: p.description,
      publicCode: p.publicCode,
      isActive: p.isActive,
      brandId: p.brandId,
      departmentId: p.departmentId,
      mergedIntoId: p.mergedIntoId,
      createdAt: p.createdAt.toISOString(),
      variants: p.variants.map(v => ({
        id: v.id,
        isActive: v.isActive,
        size: v.size,
        color: v.color,
        title: v.title,
        sku: v.sku,
        barcode: v.barcode,
        price: Number(v.price),
        inventory: v.inventory.map(inv => ({
          locationId: inv.locationId,
          available: inv.available
        }))
      }))
    }));
  }

  async getProductByBarcode(code: string): Promise<VariantMatch | null> {
    const candidates = codeCandidates(code);
    if (candidates.length === 0) return null;
    const v = await this.db.variant.findFirst({
      where: { OR: codeWhere(candidates) },
      include: {
        product: true,
        inventory: true
      }
    });
    if (!v) return null;
    return {
      product: {
        id: v.product.id,
        title: v.product.title,
        brand: v.product.brand,
        category: v.product.category,
        imageUrl: v.product.imageUrl,
        variants: []
      },
      variant: {
        id: v.id,
        size: v.size,
        color: v.color,
        title: v.title,
        sku: v.sku,
        barcode: v.barcode,
        price: Number(v.price),
        inventory: v.inventory.map(inv => ({
          locationId: inv.locationId,
          available: inv.available
        }))
      }
    };
  }

  async getProductByVariantId(variantId: string): Promise<VariantMatch | null> {
    const v = await this.db.variant.findUnique({
      where: { id: variantId },
      include: { 
        product: true,
        inventory: true
      }
    });
    if (!v) return null;
    return {
      product: {
        id: v.product.id,
        title: v.product.title,
        brand: v.product.brand,
        category: v.product.category,
        imageUrl: v.product.imageUrl,
        variants: []
      },
      variant: {
        id: v.id,
        size: v.size,
        color: v.color,
        title: v.title,
        sku: v.sku,
        barcode: v.barcode,
        price: Number(v.price),
        inventory: v.inventory.map(inv => ({
          locationId: inv.locationId,
          available: inv.available
        }))
      }
    };
  }

  async recordStockMovement(data: RecordStockMovementData): Promise<{ available: number; replayed: boolean }> {
    const { variantId, locationId, type, delta, notes, requestId, userId } = data;
    if (!Number.isInteger(delta) || delta === 0) {
      throw new Error("El movimiento de stock debe ser un entero distinto de cero.");
    }
    const currentAvailable = async (client: Pick<PrismaClient, "inventoryLevel">) =>
      (await client.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId, locationId } } }))
        ?.available ?? 0;

    try {
      return await this.db.$transaction(async (tx) => {
        const existing = await tx.movement.findUnique({ where: { requestId }, select: { id: true } });
        if (existing) return { available: await currentAvailable(tx), replayed: true };

        // El Movement va primero: su índice único sobre requestId serializa los
        // intentos repetidos (el perdedor recibe P2002 -> replayed) antes de que
        // el updateMany pueda dar INSUFFICIENT por haber visto ya el descuento del ganador.
        // Si el stock no alcanza, el error revierte también este Movement.
        await tx.movement.create({
          data: { variantId, locationId, userId, delta, type, notes, requestId },
        });

        let available: number;
        if (delta > 0) {
          const level = await tx.inventoryLevel.upsert({
            where: { variantId_locationId: { variantId, locationId } },
            update: { available: { increment: delta } },
            create: { variantId, locationId, available: delta },
          });
          available = level.available;
        } else {
          const n = -delta;
          // Atómico: solo resta si alcanza; sin fila no hay salida y no se crea una.
          const res = await tx.inventoryLevel.updateMany({
            where: { variantId, locationId, available: { gte: n } },
            data: { available: { decrement: n } },
          });
          if (res.count === 0) {
            throw new InsufficientStockError(variantId, await currentAvailable(tx), n);
          }
          available = await currentAvailable(tx);
        }
        return { available, replayed: false };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002" && /request_?id/i.test(String(err.meta?.target ?? ""))) {
          // Carrera: otro intento con el mismo requestId ganó; la transacción se revirtió.
          return { available: await currentAvailable(this.db), replayed: true };
        }
        if (err.code === "P2003") throw new StockTargetNotFoundError();
      }
      throw err;
    }
  }

  async createProduct(data: CreateProductData): Promise<VariantMatch> {
    // Producto + variante + inventario + Movement en una sola transacción:
    // si algo falla (p. ej. P2002 por barcode/sku) no queda nada a medias.
    const product = await this.db.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          title: data.title,
          brand: data.brand,
          brandId: data.brandId,
          departmentId: data.departmentId,
          publicCode: data.publicCode,
          category: data.category,
          imageUrl: data.imageUrl ?? null,
          backImageUrl: data.backImageUrl ?? null,
          description: data.description ?? null,
          variants: {
            create: {
              title: data.title,
              sku: data.sku,
              barcode: data.barcode,
              size: data.size?.trim() || DEFAULT_SIZE,
              price: data.price,
              inventory: {
                create: {
                  locationId: data.locationId,
                  available: data.initialStock
                }
              }
            }
          }
        },
        include: {
          variants: { include: { inventory: true } }
        }
      });

      if (data.initialStock > 0) {
        await tx.movement.create({
          data: {
            variantId: created.variants[0].id,
            locationId: data.locationId,
            userId: data.userId,
            delta: data.initialStock,
            type: "RESTOCK",
            notes: "alta",
          }
        });
      }
      return created;
    });

    const createdVariant = product.variants[0];

    return {
      product: {
        id: product.id,
        title: product.title,
        brand: product.brand,
        category: product.category,
        imageUrl: product.imageUrl,
        variants: []
      },
      variant: {
        id: createdVariant.id,
        size: createdVariant.size,
        color: createdVariant.color,
        title: createdVariant.title,
        sku: createdVariant.sku,
        barcode: createdVariant.barcode,
        price: Number(createdVariant.price),
        inventory: createdVariant.inventory.map(inv => ({
          locationId: inv.locationId,
          available: inv.available
        }))
      }
    };
  }

  async updateProductImage(productId: string, imageUrl: string): Promise<void> {
    await this.db.product.update({
      where: { id: productId },
      data: { imageUrl },
    });
  }

  async updateProductBackImage(productId: string, backImageUrl: string): Promise<void> {
    await this.db.product.update({
      where: { id: productId },
      data: { backImageUrl },
    });
  }
}

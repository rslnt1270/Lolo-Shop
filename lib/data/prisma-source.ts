import { InventoryDataSource, VariantMatch, CreateProductData, CreateLocationData } from "./source";
import type { Location, Product, Variant } from "../domain/types";
import prisma from "../prisma";
import type { Prisma } from "@prisma/client";
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
  async getLocations(): Promise<Location[]> {
    const locs = await prisma.location.findMany({ orderBy: { createdAt: "asc" } });
    return locs.map(l => ({
      id: l.id,
      name: l.name,
      type: l.type as any
    }));
  }

  async createLocation(data: CreateLocationData): Promise<Location> {
    const name = data.name.trim();
    if (!name) throw new Error("El nombre de la tienda es obligatorio.");
    const loc = await prisma.location.create({
      data: { name, type: (data.type ?? "store") as any },
    });
    return { id: loc.id, name: loc.name, type: loc.type as any };
  }

  async getProducts(): Promise<Product[]> {
    const prods = await prisma.product.findMany({
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
      publicCode: p.publicCode,
      isActive: p.isActive,
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
    const v = await prisma.variant.findFirst({
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
    const v = await prisma.variant.findUnique({
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

  async adjustInventory(variantId: string, locationId: string, delta: number, userId?: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // 1. Operación Atómica (Previene Race Conditions si 2 personas escanean al mismo tiempo)
      await tx.inventoryLevel.upsert({
        where: {
          variantId_locationId: { variantId, locationId }
        },
        update: {
          available: { increment: delta }
        },
        create: {
          variantId,
          locationId,
          available: delta
        }
      });

      // 2. Registro Histórico en la misma Transacción
      if (userId) {
        await tx.movement.create({
          data: {
            variantId,
            locationId,
            userId,
            delta
          }
        });
      }
    });
  }
  async createProduct(data: CreateProductData): Promise<VariantMatch> {
    // Producto + variante + inventario + Movement en una sola transacción:
    // si algo falla (p. ej. P2002 por barcode/sku) no queda nada a medias.
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          title: data.title,
          brand: data.brand,
          brandId: data.brandId,
          departmentId: data.departmentId,
          publicCode: data.publicCode,
          category: data.category,
          imageUrl: data.imageUrl ?? null,
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
    await prisma.product.update({
      where: { id: productId },
      data: { imageUrl },
    });
  }
}

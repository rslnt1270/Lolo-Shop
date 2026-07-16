import { InventoryDataSource, VariantMatch, CreateProductData } from "./source";
import type { Location, Product, Variant } from "../domain/types";
import prisma from "../prisma";

export class PrismaDataSource implements InventoryDataSource {
  async getLocations(): Promise<Location[]> {
    const locs = await prisma.location.findMany();
    return locs.map(l => ({
      id: l.id,
      name: l.name,
      type: l.type as any
    }));
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
      category: "General",
      imageUrl: p.imageUrl,
      variants: p.variants.map(v => ({
        id: v.id,
        size: "U",
        color: "General",
        title: v.title,
        sku: v.sku,
        barcode: v.barcode,
        price: v.price,
        inventory: v.inventory.map(inv => ({
          locationId: inv.locationId,
          available: inv.available
        }))
      }))
    }));
  }

  async getProductByBarcode(barcode: string): Promise<VariantMatch | null> {
    const v = await prisma.variant.findUnique({
      where: { barcode },
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
        category: "General",
        imageUrl: v.product.imageUrl,
        variants: []
      },
      variant: {
        id: v.id,
        size: "U",
        color: "General",
        title: v.title,
        sku: v.sku,
        barcode: v.barcode,
        price: v.price,
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
        category: "General",
        imageUrl: v.product.imageUrl,
        variants: []
      },
      variant: {
        id: v.id,
        size: "U",
        color: "General",
        title: v.title,
        sku: v.sku,
        barcode: v.barcode,
        price: v.price,
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
    const sku = data.sku || `SKU-${Date.now()}`;
    const product = await prisma.product.create({
      data: {
        title: data.title,
        brand: data.brand,
        imageUrl: data.imageUrl,
        variants: {
          create: {
            title: data.title,
            sku: sku,
            barcode: data.barcode,
            price: data.price,
            inventory: {
              create: {
                locationId: data.locationId,
                available: 1
              }
            }
          }
        }
      },
      include: {
        variants: true
      }
    });

    const createdVariant = product.variants[0];

    return {
      product: {
        id: product.id,
        title: product.title,
        brand: product.brand,
        category: "General",
        imageUrl: product.imageUrl,
        variants: []
      },
      variant: {
        id: createdVariant.id,
        size: "U",
        color: "General",
        title: createdVariant.title,
        sku: createdVariant.sku,
        barcode: createdVariant.barcode,
        price: createdVariant.price,
        inventory: [{ locationId: data.locationId, available: 1 }]
      }
    };
  }
}

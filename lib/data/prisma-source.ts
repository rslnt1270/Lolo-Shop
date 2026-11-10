import {
  MAX_SEARCH_RESULTS,
  type AddVariantData, type CreatedProduct, type CreateLocationData, type CreateProductData, type InventoryDataSource,
  type ProductSearchHit, type RecordStockMovementData, type VariantMatch,
} from "./source";
import { InsufficientStockError, InventoryRuleError, StockTargetNotFoundError } from "./errors";
import type { Location, Product, Variant } from "../domain/types";
import prisma from "../prisma";
import { Prisma, type PrismaClient } from "@prisma/client";
import { canonicalCode, codeCandidates } from "../domain/barcode";
import { normalizeSize, sortSizes } from "../domain/sizes";
import { normalizePublicCode } from "../domain/public-code";

type DbVariant = Prisma.VariantGetPayload<{ include: { inventory: true } }>;
type DbProduct = Prisma.ProductGetPayload<object>;

function toVariant(v: DbVariant): Variant {
  return {
    id: v.id,
    isActive: v.isActive,
    size: v.size,
    color: v.color,
    title: v.title,
    sku: v.sku,
    barcode: v.barcode,
    price: Number(v.price),
    inventory: v.inventory.map((inv) => ({ locationId: inv.locationId, available: inv.available })),
  };
}

function toProduct(p: DbProduct, variants: Variant[]): Product {
  return {
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
    createdAt: p.createdAt?.toISOString(),
    variants,
  };
}

/** El data source guarda los códigos canónicos (alfanuméricos en mayúsculas), aunque el llamador no lo haga. */
const storedCode = (barcode: string | null) => (barcode === null ? null : canonicalCode(barcode));
const MAX_QUERY_LENGTH = 80;

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
        // Todas las tallas del producto: la tarjeta de /escanear las muestra con las piezas de la tienda.
        product: { include: { variants: { include: { inventory: true }, orderBy: { createdAt: "asc" } } } },
        inventory: true,
      },
    });
    if (!v) return null;
    const siblings = (v.product as { variants?: DbVariant[] }).variants ?? [];
    return {
      product: {
        id: v.product.id,
        title: v.product.title,
        brand: v.product.brand,
        category: v.product.category,
        imageUrl: v.product.imageUrl,
        backImageUrl: v.product.backImageUrl,
        publicCode: v.product.publicCode,
        isActive: v.product.isActive,
        mergedIntoId: v.product.mergedIntoId,
        variants: siblings.map(toVariant),
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

  async createProduct(data: CreateProductData): Promise<CreatedProduct> {
    const rows = data.variants.map((v) => ({ ...v, barcode: storedCode(v.barcode), size: normalizeSize(v.size) }));
    // Producto + tallas + inventario + Movements en una sola transacción: si
    // algo falla (p. ej. P2002 por barcode/sku) no queda nada a medias.
    return await this.db.$transaction(async (tx) => {
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
            create: rows.map((r) => ({
              title: r.size,
              sku: r.sku,
              barcode: r.barcode,
              size: r.size,
              price: r.price,
              inventory: { create: { locationId: data.locationId, available: r.initialStock } },
            })),
          },
        },
        include: { variants: { include: { inventory: true } } },
      });

      const bySku = new Map(created.variants.map((v) => [v.sku, v]));
      const ordered = rows.map((r) => bySku.get(r.sku)).filter((v): v is DbVariant => !!v);
      const moves = rows.flatMap((r, i) =>
        r.initialStock > 0 && ordered[i]
          ? [{
              variantId: ordered[i].id,
              locationId: data.locationId,
              userId: data.userId,
              delta: r.initialStock,
              type: "RESTOCK" as const,
              notes: "alta",
            }]
          : [],
      );
      if (moves.length > 0) await tx.movement.createMany({ data: moves });

      const variants = ordered.map(toVariant);
      return { product: toProduct(created, variants), variants };
    });
  }

  async addVariant(data: AddVariantData): Promise<VariantMatch> {
    const size = normalizeSize(data.size);
    const barcode = storedCode(data.barcode);
    return await this.db.$transaction(async (tx) => {
      // Tocar el producto bloquea su fila: dos "agregar talla" del mismo
      // producto se serializan y la revisión de talla repetida no se cruza.
      let product: { isActive: boolean; mergedIntoId: string | null };
      try {
        product = await tx.product.update({
          where: { id: data.productId },
          data: { updatedAt: new Date() },
          select: { isActive: true, mergedIntoId: true },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
          throw new InventoryRuleError("El producto ya no existe. Búscalo de nuevo.");
        }
        throw err;
      }
      if (!product.isActive || product.mergedIntoId) {
        throw new InventoryRuleError("Ese producto ya no está activo o se unió con otro. Búscalo de nuevo.");
      }
      if (barcode === null) {
        const same = await tx.variant.findFirst({
          where: { productId: data.productId, isActive: true, size: { equals: size, mode: "insensitive" } },
          select: { id: true },
        });
        if (same) throw new InventoryRuleError("Esa talla ya existe: suma piezas con Entrada");
      }
      const created = await tx.variant.create({
        data: {
          productId: data.productId,
          title: size,
          sku: data.sku,
          barcode,
          size,
          price: data.price,
          inventory: { create: { locationId: data.locationId, available: data.initialStock } },
        },
        select: { id: true },
      });
      if (data.initialStock > 0) {
        await tx.movement.create({
          data: {
            variantId: created.id,
            locationId: data.locationId,
            userId: data.userId,
            delta: data.initialStock,
            type: "RESTOCK",
            notes: "alta",
          },
        });
      }
      const full = await tx.product.findUniqueOrThrow({
        where: { id: data.productId },
        include: { variants: { include: { inventory: true }, orderBy: { createdAt: "asc" } } },
      });
      const variants = full.variants.map(toVariant);
      return { product: toProduct(full, variants), variant: variants.find((v) => v.id === created.id)! };
    });
  }

  async searchProducts(query: string): Promise<ProductSearchHit[]> {
    const q = String(query ?? "").trim().slice(0, MAX_QUERY_LENGTH);
    if (!q) return [];
    const code = normalizePublicCode(q);
    const or: Prisma.ProductWhereInput[] = [
      { title: { contains: q, mode: "insensitive" } },
      { brand: { contains: q, mode: "insensitive" } },
    ];
    if (code) or.unshift({ publicCode: code });
    const rows = await this.db.product.findMany({
      where: { isActive: true, mergedIntoId: null, OR: or },
      orderBy: { createdAt: "desc" },
      take: MAX_SEARCH_RESULTS,
      select: {
        id: true, title: true, brand: true, publicCode: true, imageUrl: true,
        variants: { where: { isActive: true }, select: { size: true } },
      },
    });
    const hits = rows.map((p) => ({
      productId: p.id,
      title: p.title,
      brand: p.brand,
      publicCode: p.publicCode,
      imageUrl: p.imageUrl,
      sizes: sortSizes([...new Set(p.variants.map((v) => v.size))]),
    }));
    // El código público exacto va primero.
    return code ? [...hits.filter((h) => h.publicCode === code), ...hits.filter((h) => h.publicCode !== code)] : hits;
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

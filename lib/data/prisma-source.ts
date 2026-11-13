import {
  MAX_SEARCH_RESULTS,
  type AddVariantData, type CreatedProduct, type CreateLocationData, type CreateProductData, type InventoryDataSource, type MergeProductsResult,
  type AssignProductTypeResult, type StockByTypeRow,
  type PriceChangeEntry, type ProductPatch, type ProductSearchHit, type RecordStockMovementData,
  type UpdateVariantPriceResult, type VariantMatch, type StockAt, type VariantStockRow,
  MOVEMENT_PAGE_SIZE, type MovementPage, type MovementQuery,
} from "./source";
import { isAudience } from "../domain/product-taxonomy";
import { MOVEMENT_TYPE_LABEL, type MovementType } from "../domain/types";
import { mexicoRangeToUtc } from "../domain/movement-scope";
import { InsufficientStockError, InventoryRuleError, ProductNotFoundError, StockTargetNotFoundError } from "./errors";
import type { Location, Product, Variant } from "../domain/types";
import prisma from "../prisma";
import { Prisma, type PrismaClient } from "@prisma/client";
import { canonicalCode, codeCandidates } from "../domain/barcode";
import { UNIQUE_SIZE, normalizeSize, sortSizes } from "../domain/sizes";
import { stripTrailingSize, trailingSize } from "../domain/size-duplicates";
import { INVENTORY_TX_OPTIONS } from "./tx-options";
import { normalizePublicCode } from "../domain/public-code";

type DbVariant = Prisma.VariantGetPayload<{ include: { inventory: true } }>;
type DbProduct = Prisma.ProductGetPayload<{ include: { department: true } }> | Prisma.ProductGetPayload<object>;

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
    color: p.color,
    isPublished: p.isPublished,
    catalogPhotosCheckedAt: p.catalogPhotosCheckedAt?.toISOString() ?? null,
    isActive: p.isActive,
    brandId: p.brandId,
    departmentId: p.departmentId,
    productTypeId: p.productTypeId,
    style: p.style,
    audience: isAudience(p.audience) ? p.audience : null,
    ...("department" in p && p.department
      ? { department: { slug: p.department.slug, name: p.department.name, sortOrder: p.department.sortOrder, isActive: p.department.isActive } }
      : {}),
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
      type: l.type as any,
      isPublic: l.isPublic,
    }));
  }

  async createLocation(data: CreateLocationData): Promise<Location> {
    const name = data.name.trim();
    if (!name) throw new Error("El nombre de la tienda es obligatorio.");
    const loc = await this.db.location.create({
      data: { name, type: (data.type ?? "store") as any },
    });
    return { id: loc.id, name: loc.name, type: loc.type as any, isPublic: loc.isPublic };
  }

  async getProducts(): Promise<Product[]> {
    const prods = await this.db.product.findMany({
      include: { 
        department: true,
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
      color: p.color,
      isPublished: p.isPublished,
      catalogPhotosCheckedAt: p.catalogPhotosCheckedAt?.toISOString() ?? null,
      isActive: p.isActive,
      brandId: p.brandId,
      departmentId: p.departmentId,
      productTypeId: p.productTypeId,
      style: p.style,
      audience: isAudience(p.audience) ? p.audience : null,
      department: p.department
        ? { slug: p.department.slug, name: p.department.name, sortOrder: p.department.sortOrder, isActive: p.department.isActive }
        : null,
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

  async getCatalogProducts(): Promise<Product[]> {
    const prods = await this.db.product.findMany({
      where: { isActive: true, mergedIntoId: null, isPublished: true, imageUrl: { not: null }, backImageUrl: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      include: { variants: { include: { inventory: true } }, department: true },
    });
    return prods.map((p) => toProduct(p, p.variants.map(toVariant)));
  }

  async getStockAt(variantId: string, locationId: string): Promise<StockAt> {
    const [level, soldLines] = await Promise.all([
      this.db.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId, locationId } } }),
      this.db.saleLine.count({ where: { variantId } }),
    ]);
    return { available: level?.available ?? 0, sold: soldLines > 0 };
  }

  async listVariantStockAt(productId: string, locationId: string): Promise<VariantStockRow[]> {
    const variants = await this.db.variant.findMany({
      where: { productId, isActive: true },
      include: { inventory: { where: { locationId } } },
    });
    const rows = variants.map((v) => ({
      variantId: v.id,
      size: v.size,
      sku: v.sku,
      price: Number(v.price),
      available: v.inventory[0]?.available ?? 0,
    }));
    const order = sortSizes(rows.map((r) => r.size));
    return rows.sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size));
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

  async listMovements(q: MovementQuery): Promise<MovementPage> {
    const { gte, lt } = mexicoRangeToUtc(q.from, q.to);
    const rows = await this.db.movement.findMany({
      where: {
        timestamp: { gte, lt },
        ...(q.locationIds === "all" ? {} : { locationId: { in: q.locationIds } }),
        ...(q.type ? { type: q.type } : {}),
        ...(q.userId ? { userId: q.userId } : {}),
        ...(q.variantId ? { variantId: q.variantId } : {}),
      },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: MOVEMENT_PAGE_SIZE + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      // Solo lo que se muestra: nunca el alias del cliente ni datos de la venta salvo el folio.
      select: {
        id: true, timestamp: true, delta: true, type: true, notes: true,
        variant: { select: { size: true, product: { select: { title: true } } } },
        location: { select: { name: true } },
        user: { select: { name: true, username: true } },
        sale: { select: { number: true } },
      },
    });
    const hasMore = rows.length > MOVEMENT_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, MOVEMENT_PAGE_SIZE) : rows;
    return {
      rows: page.map((m) => ({
        id: m.id,
        timestamp: m.timestamp.toISOString(),
        productTitle: m.variant.product.title,
        size: m.variant.size,
        locationName: m.location.name,
        type: m.type as MovementType,
        typeLabel: MOVEMENT_TYPE_LABEL[m.type as MovementType],
        delta: m.delta,
        userName: m.user.name || m.user.username,
        notes: m.notes,
        saleNumber: m.sale?.number ?? null,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async listMovementActors(): Promise<{ id: string; name: string }[]> {
    const users = await this.db.user.findMany({
      where: { movements: { some: {} } },
      select: { id: true, name: true, username: true },
      orderBy: { name: "asc" },
    });
    return users.map((u) => ({ id: u.id, name: u.name || u.username }));
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
      }, INVENTORY_TX_OPTIONS);
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
          productTypeId: data.productTypeId ?? null,
          style: data.style ?? null,
          audience: data.audience ?? null,
          imageUrl: data.imageUrl ?? null,
          backImageUrl: data.backImageUrl ?? null,
          description: data.description ?? null,
          color: data.color ?? null,
          catalogPhotosCheckedAt: data.photosChecked ? new Date() : null,
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
    }, INVENTORY_TX_OPTIONS);
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
    }, INVENTORY_TX_OPTIONS);
  }

  async searchProducts(query: string): Promise<ProductSearchHit[]> {
    const q = String(query ?? "").trim().slice(0, MAX_QUERY_LENGTH);
    if (!q) return [];
    const select = {
      id: true, title: true, brand: true, publicCode: true, imageUrl: true,
      variants: { where: { isActive: true }, select: { size: true } },
    } as const;
    const live = { isActive: true, mergedIntoId: null };
    // El código público exacto va en una consulta aparte para que el corte a 8 no lo deje fuera.
    const code = normalizePublicCode(q);
    const exact = code ? await this.db.product.findFirst({ where: { ...live, publicCode: code }, select }) : null;
    const rest = await this.db.product.findMany({
      where: {
        ...live,
        ...(exact ? { id: { not: exact.id } } : {}),
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { brand: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: MAX_SEARCH_RESULTS - (exact ? 1 : 0),
      select,
    });
    return [...(exact ? [exact] : []), ...rest].map((p) => ({
      productId: p.id,
      title: p.title,
      brand: p.brand,
      publicCode: p.publicCode,
      imageUrl: p.imageUrl,
      sizes: sortSizes([...new Set(p.variants.map((v) => v.size))]),
    }));
  }

  async updateVariantPrice(
    variantId: string,
    expectedPrice: number,
    newPrice: number,
    userId: string,
    reason: string | null,
  ): Promise<UpdateVariantPriceResult> {
    return await this.db.$transaction(async (tx) => {
      // Condicionado al precio que vio quien edita: de dos ediciones con el mismo
      // precio esperado, la segunda espera el candado de fila y ya no encuentra coincidencia.
      const res = await tx.variant.updateMany({
        where: { id: variantId, price: expectedPrice },
        data: { price: newPrice },
      });
      if (res.count === 0) {
        const current = await tx.variant.findUnique({ where: { id: variantId }, select: { price: true } });
        if (!current) throw new ProductNotFoundError("La talla ya no existe.");
        return { ok: false as const, currentPrice: Number(current.price) };
      }
      await tx.priceChange.create({
        data: { variantId, oldPrice: expectedPrice, newPrice, changedById: userId, reason },
      });
      return { ok: true as const, price: newPrice };
    }, INVENTORY_TX_OPTIONS);
  }

  async listPriceChanges(variantId: string, limit: number): Promise<PriceChangeEntry[]> {
    const rows = await this.db.priceChange.findMany({
      where: { variantId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        oldPrice: true,
        newPrice: true,
        createdAt: true,
        changedBy: { select: { name: true, username: true } },
      },
    });
    return rows.map((r) => ({
      oldPrice: Number(r.oldPrice),
      newPrice: Number(r.newPrice),
      userName: r.changedBy.name.trim() || r.changedBy.username,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async updateProduct(productId: string, patch: ProductPatch): Promise<void> {
    const data: Prisma.ProductUpdateInput = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.category !== undefined) data.category = patch.category;
    if (patch.productTypeId !== undefined) data.productType = { connect: { id: patch.productTypeId } };
    if (patch.style !== undefined) data.style = patch.style;
    if (patch.audience !== undefined) data.audience = patch.audience;
    if (patch.brandId !== undefined) {
      data.brandRef = { connect: { id: patch.brandId } };
      if (patch.brand !== undefined) data.brand = patch.brand;
    }
    if (patch.departmentId !== undefined) data.department = { connect: { id: patch.departmentId } };
    try {
      await this.db.product.update({ where: { id: productId }, data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") throw new ProductNotFoundError();
      throw err;
    }
  }

  async setProductActive(productId: string, active: boolean): Promise<void> {
    const p = await this.db.product.findUnique({ where: { id: productId }, select: { mergedIntoId: true } });
    if (!p) throw new ProductNotFoundError();
    if (active && p.mergedIntoId) {
      throw new InventoryRuleError("Este producto se unió con otro y no se puede reactivar.");
    }
    await this.db.product.update({ where: { id: productId }, data: { isActive: active } });
  }

  async setVariantActive(variantId: string, active: boolean): Promise<void> {
    if (active) {
      const v = await this.db.variant.findUnique({ where: { id: variantId }, select: { productId: true, size: true } });
      if (!v) throw new ProductNotFoundError("La talla ya no existe.");
      const same = await this.db.variant.findFirst({
        where: { productId: v.productId, isActive: true, id: { not: variantId }, size: { equals: v.size, mode: "insensitive" } },
        select: { id: true },
      });
      if (same) throw new InventoryRuleError("Ya hay otra talla activa con esa talla. Desactívala primero.");
    }
    const res = await this.db.variant.updateMany({ where: { id: variantId }, data: { isActive: active } });
    if (res.count === 0) throw new ProductNotFoundError("La talla ya no existe.");
  }

  async assignDepartment(productIds: string[], departmentId: string): Promise<number> {
    const res = await this.db.product.updateMany({
      where: { id: { in: productIds } },
      data: { departmentId },
    });
    return res.count;
  }

  async assignProductType(
    productIds: string[],
    data: { productTypeId: string; category: string; allowedStyles: readonly string[] },
  ): Promise<AssignProductTypeResult> {
    const ids = [...new Set(productIds)];
    return await this.db.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, departmentId: true, style: true },
      });
      const deptIds = [...new Set(products.flatMap((p) => (p.departmentId ? [p.departmentId] : [])))];
      const pairs = await tx.departmentProductType.findMany({
        where: { productTypeId: data.productTypeId, departmentId: { in: deptIds } },
        select: { departmentId: true },
      });
      const allowedDepts = new Set(pairs.map((p) => p.departmentId));
      // Los productos sin departamento no se pueden revisar: se permiten (quedan en "Por revisar" si no encajan).
      const invalid = products.filter((p) => p.departmentId && !allowedDepts.has(p.departmentId)).length;
      if (invalid > 0) {
        throw new InventoryRuleError(
          `«${data.category}» no aplica a ${invalid} de los productos elegidos. Quítalos de la selección.`,
        );
      }
      const found = products.map((p) => p.id);
      await tx.product.updateMany({
        where: { id: { in: found } },
        data: { productTypeId: data.productTypeId, category: data.category },
      });
      const cleared = products.filter((p) => p.style !== null && !data.allowedStyles.includes(p.style)).map((p) => p.id);
      if (cleared.length > 0) await tx.product.updateMany({ where: { id: { in: cleared } }, data: { style: null } });
      return { updated: found.length, styleCleared: cleared.length };
    }, INVENTORY_TX_OPTIONS);
  }

  async getStockByType(filter: { locationId?: string | null }): Promise<StockByTypeRow[]> {
    const locationId = filter.locationId ?? null;
    const rows = await this.db.$queryRaw<
      {
        departmentId: string | null; departmentName: string; productTypeId: string | null; typeName: string;
        typeActive: boolean; audience: string | null; locationId: string; locationName: string;
        pieces: number; products: number;
      }[]
    >(Prisma.sql`
      SELECT p."departmentId"                          AS "departmentId",
             COALESCE(d."name", 'Sin departamento')    AS "departmentName",
             p."productTypeId"                         AS "productTypeId",
             COALESCE(t."name", 'Sin tipo')            AS "typeName",
             COALESCE(t."isActive", true)              AS "typeActive",
             p."audience"                              AS "audience",
             il."locationId"                           AS "locationId",
             loc."name"                                AS "locationName",
             SUM(il."available")::int                  AS "pieces",
             (COUNT(DISTINCT p."id") FILTER (WHERE il."available" > 0))::int AS "products"
      FROM "InventoryLevel" il
      JOIN "Variant"  v   ON v."id" = il."variantId" AND v."isActive"
      JOIN "Product"  p   ON p."id" = v."productId"  AND p."isActive" AND p."mergedIntoId" IS NULL
      JOIN "Location" loc ON loc."id" = il."locationId"
      LEFT JOIN "Department"  d ON d."id" = p."departmentId"
      LEFT JOIN "ProductType" t ON t."id" = p."productTypeId"
      WHERE ${locationId ? Prisma.sql`il."locationId" = ${locationId}` : Prisma.sql`TRUE`}
      GROUP BY p."departmentId", d."name", d."sortOrder", p."productTypeId", t."name", t."isActive", t."sortOrder",
               p."audience", il."locationId", loc."name"
      HAVING SUM(il."available") > 0
      ORDER BY d."sortOrder" NULLS LAST, t."sortOrder" NULLS LAST, p."audience" NULLS FIRST, loc."name"
    `);
    return rows.map((r) => ({ ...r, audience: isAudience(r.audience) ? r.audience : null }));
  }

  async mergeProducts(targetId: string, sourceIds: string[], userId: string): Promise<MergeProductsResult> {
    const sources = [...new Set(sourceIds)];
    if (sources.length === 0) throw new InventoryRuleError("Elige al menos un producto para unir.");
    if (sources.includes(targetId)) throw new InventoryRuleError("El producto que se queda no puede ser también uno de los que se unen.");
    const ids = [targetId, ...sources].sort();

    return await this.db.$transaction(async (tx) => {
      // Mismo orden de bloqueo en todas las uniones: evita interbloqueos entre uniones cruzadas.
      await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
      const rows = await tx.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true, brandId: true, isActive: true, mergedIntoId: true, imageUrl: true, backImageUrl: true },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      if (rows.length !== ids.length) throw new InventoryRuleError("Alguno de los productos ya no existe. Actualiza la pantalla.");

      const target = byId.get(targetId)!;
      if (!target.isActive || target.mergedIntoId) {
        throw new InventoryRuleError("El producto que se queda ya no está activo o se unió con otro.");
      }
      if (!target.brandId) throw new InventoryRuleError("El producto que se queda no tiene marca.");

      let alreadyMerged = 0;
      const toMove: string[] = [];
      for (const id of sources) {
        const src = byId.get(id)!;
        if (src.mergedIntoId === targetId) {
          alreadyMerged++;
          continue;
        }
        if (src.mergedIntoId) throw new InventoryRuleError("Uno de los productos ya se unió con otro distinto.");
        if (src.brandId !== target.brandId) throw new InventoryRuleError("Solo se pueden unir productos de la misma marca.");
        toMove.push(id);
      }
      if (toMove.length === 0) return { movedVariants: 0, movedSaleLines: 0, alreadyMerged };

      // Datos viejos: la talla quedó en el título ("Polo - M") y la variante en "U". Antes de mover,
      // cada variante "U" toma la talla del título de su producto (el destino incluido).
      for (const id of [targetId, ...toMove]) {
        const size = trailingSize(byId.get(id)!.title);
        if (size) await tx.variant.updateMany({ where: { productId: id, size: UNIQUE_SIZE }, data: { size, title: size } });
      }
      const variants = await tx.variant.updateMany({ where: { productId: { in: toMove } }, data: { productId: targetId } });
      // SaleLine.departmentId no se toca: es el departamento de la venta, histórico.
      const lines = await tx.saleLine.updateMany({ where: { productId: { in: toMove } }, data: { productId: targetId } });

      const photoData: Prisma.ProductUpdateInput = {};
      if (!target.imageUrl || !target.backImageUrl) {
        const donor = toMove.map((id) => byId.get(id)!).find((s) => s.imageUrl && s.backImageUrl);
        if (donor) {
          photoData.imageUrl = donor.imageUrl;
          photoData.backImageUrl = donor.backImageUrl;
        }
      }

      // Sin cadenas: lo que ya apuntaba a un origen pasa a apuntar al destino.
      await tx.product.updateMany({ where: { mergedIntoId: { in: toMove } }, data: { mergedIntoId: targetId } });
      await tx.product.updateMany({
        where: { id: { in: toMove } },
        data: { isActive: false, mergedIntoId: targetId, mergedAt: new Date(), mergedById: userId },
      });
      // La talla ya vive en las variantes: el título del destino queda sin ella ("Polo - M" → "Polo").
      const cleanTitle = stripTrailingSize(target.title);
      if (cleanTitle !== target.title) photoData.title = cleanTitle;
      if (Object.keys(photoData).length > 0) await tx.product.update({ where: { id: targetId }, data: photoData });

      return { movedVariants: variants.count, movedSaleLines: lines.count, alreadyMerged };
    }, INVENTORY_TX_OPTIONS);
  }

  async getProductByPublicCode(code: string): Promise<Product | null> {
    const include = { variants: { include: { inventory: true } } } as const;
    let p = await this.db.product.findUnique({ where: { publicCode: code }, include });
    if (p?.mergedIntoId) p = await this.db.product.findUnique({ where: { id: p.mergedIntoId }, include });
    return p ? toProduct(p, p.variants.map(toVariant)) : null;
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

  async setCatalogPhotos(productId: string, photos: { imageUrl: string; backImageUrl: string }): Promise<void> {
    await this.db.product.update({
      where: { id: productId },
      data: { imageUrl: photos.imageUrl, backImageUrl: photos.backImageUrl, catalogPhotosCheckedAt: new Date() },
    });
  }
}

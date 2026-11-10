"use server";
import { isProductBlobUrl } from "./image/blob-url";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./auth/current-user";
import { ForbiddenError } from "./auth/errors";
import { assertCanOperate, currentUserOrNull, requireRole } from "./auth/permissions";
import { getPublicCatalog, type PublicProduct } from "@/lib/data/public-projection";
import { getDataSource } from "./data/get-source";
import type { Location, LocationType, Product } from "./domain/types";
import { validateNewProduct, validateSizeRow, type EntryMode, type SizeRowInput } from "./domain/new-product";
import { generatePublicCode } from "./domain/public-code";
import prisma from "./prisma";
import { normalizeCode, generateInternalSku } from "./domain/barcode";
import type { InventoryDataSource, ProductSearchHit, VariantMatch } from "./data/source";
import {
  InsufficientStockError, InventoryRuleError, StockTargetNotFoundError, uniqueViolationField,
} from "./data/errors";
import { validateStockMovement, type StockMovementKind } from "./domain/stock-movement";
import { uploadImage, ImageUploadError } from "./image/upload";
import { changePassword, type ChangePasswordResult } from "./auth/password";

export async function fetchProductsAction(): Promise<Product[] | null> {
  const user = await currentUserOrNull();
  if (!user) return null;
  return await getDataSource().getProducts();
}

export async function fetchLocationsAction(): Promise<Location[] | null> {
  const user = await currentUserOrNull();
  if (!user) return null;
  return await getDataSource().getLocations();
}

export async function createLocationAction(data: { name: string; type?: LocationType }): Promise<Location> {
  const user = await getCurrentUser();
  if (user.role !== "owner") {
    throw new ForbiddenError("Solo el dueño puede crear tiendas.");
  }
  const location = await getDataSource().createLocation(data);
  revalidatePath("/");
  return location;
}

export async function getProductByBarcodeAction(code: string): Promise<VariantMatch | null> {
  if (!(await currentUserOrNull())) return null;
  return await getDataSource().getProductByBarcode(code);
}

export async function getProductByVariantIdAction(id: string): Promise<VariantMatch | null> {
  if (!(await currentUserOrNull())) return null;
  return await getDataSource().getProductByVariantId(id);
}

export type StockMovementResult =
  | { ok: true; available: number; replayed: boolean }
  | {
      ok: false;
      code: "SESSION" | "FORBIDDEN" | "INVALID" | "INSUFFICIENT" | "NOT_FOUND" | "ERROR";
      message: string;
      available?: number;
    };

const STOCK_TYPE = { restock: "RESTOCK", damage: "DAMAGE", adjustment: "ADJUSTMENT" } as const;

/**
 * Entrada, merma o corrección de stock. Rol y tienda se releen de la base; no
 * hay "salida" (las ventas se registran en /pos). Nunca lanza: devuelve el código.
 */
export async function recordStockMovementAction(input: {
  variantId: string;
  locationId: string;
  kind: StockMovementKind;
  quantity: number;
  direction?: "in" | "out";
  reason?: string;
  requestId: string;
}): Promise<StockMovementResult> {
  try {
    const user = await currentUserOrNull();
    if (!user) return { ok: false, code: "SESSION", message: "Tu sesión venció. Vuelve a iniciar sesión." };

    const parsed = validateStockMovement(input);
    if (!parsed.ok) return { ok: false, code: "INVALID", message: parsed.message };
    const v = parsed.value;

    if (v.kind !== "restock") requireRole(user, ["owner", "manager"]);
    assertCanOperate(user, v.locationId);

    const res = await getDataSource().recordStockMovement({
      variantId: v.variantId,
      locationId: v.locationId,
      type: STOCK_TYPE[v.kind],
      delta: v.delta,
      notes: v.reason,
      requestId: v.requestId,
      userId: user.id,
    });
    revalidatePath("/catalogo");
    revalidatePath("/productos");
    return { ok: true, available: res.available, replayed: res.replayed };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, code: "FORBIDDEN", message: err.message };
    if (err instanceof InsufficientStockError) {
      return {
        ok: false,
        code: "INSUFFICIENT",
        available: err.available,
        message: `Solo hay ${err.available} en esta tienda.`,
      };
    }
    if (err instanceof StockTargetNotFoundError) {
      return { ok: false, code: "NOT_FOUND", message: "No encontramos la prenda o la tienda." };
    }
    console.error("recordStockMovementAction", err);
    return { ok: false, code: "ERROR", message: "No se pudo registrar. Intenta de nuevo." };
  }
}

export type LookupCodeResult =
  | { found: true; product: Product; variantId: string }
  | { found: false; code: string; error?: string };

/**
 * Busca un código escaneado/tecleado en barcode o sku (con equivalencias
 * UPC-A ↔ EAN-13). Nunca lanza: en error devuelve `found: false` con `error`.
 */
export async function lookupCodeAction(raw: string): Promise<LookupCodeResult> {
  const code = normalizeCode(typeof raw === "string" ? raw : "");
  if (!code) return { found: false, code, error: "El código está vacío. Vuelve a escanear." };
  try {
    if (!(await currentUserOrNull())) {
      return { found: false, code, error: "Tu sesión expiró: inicia sesión de nuevo." };
    }
    const match = await getDataSource().getProductByBarcode(code);
    if (!match) return { found: false, code };
    return { found: true, product: withVariant(match), variantId: match.variant.id };
  } catch (err) {
    console.error("lookupCodeAction", err);
    return { found: false, code, error: "No se pudo buscar el código. Revisa tu conexión e intenta de nuevo." };
  }
}

export type CreateProductInput = {
  title: string;
  /** `Brand.id` del combo (elegida o creada al vuelo); el nombre canónico lo pone el servidor. */
  brandId: string;
  /** `Department.id`, obligatorio en altas nuevas. */
  departmentId: string;
  category: string;
  /**
   * Una fila por talla (1 a 12): talla, código escaneado (null = "Sin código"),
   * precio y piezas contadas en `locationId`.
   */
  sizes: SizeRowInput[];
  locationId: string;
  /** "stock" (por defecto): sin fotos. "catalog": exige imageUrl y backImageUrl. */
  mode?: EntryMode;
  description?: string | null;
  imageUrl?: string | null;
  backImageUrl?: string | null;
};

export type CreateProductResult =
  | { ok: true; product: Product; variantId: string; sku: string }
  | {
      ok: false;
      code: "FORBIDDEN" | "INVALID" | "DUPLICATE" | "LOCATION" | "ERROR";
      message: string;
      existingVariantId?: string;
      /** En DUPLICATE: el código (canónico) que ya está registrado. */
      duplicateBarcode?: string;
    };

/** Un intento inicial + hasta 3 reintentos si el SKU generado choca (P2002). */
const SKU_ATTEMPTS = 4;
/** Hasta 5 intentos si el código público generado choca (P2002 en publicCode). */
const PUBLIC_CODE_ATTEMPTS = 5;
const SESSION_EXPIRED_TEXT = "Tu sesión expiró: inicia sesión de nuevo.";

function withVariant(match: VariantMatch): Product {
  return {
    ...match.product,
    variants: match.product.variants.length ? match.product.variants : [match.variant],
  };
}

function duplicateResult(match: VariantMatch, barcode: string): CreateProductResult {
  return {
    ok: false,
    code: "DUPLICATE",
    message: `Este código ya está registrado en ${match.product.title}.`,
    existingVariantId: match.variant.id,
    duplicateBarcode: barcode,
  };
}

/** Primer código del envío que ya está registrado, o null. */
async function findDuplicate(ds: InventoryDataSource, barcodes: string[]): Promise<CreateProductResult | null> {
  for (const code of barcodes) {
    const existing = await ds.getProductByBarcode(code);
    if (existing) return duplicateResult(existing, code);
  }
  return null;
}

function revalidateProducts(where: string): void {
  try {
    revalidatePath("/catalogo");
    revalidatePath("/productos");
  } catch (err) {
    console.error(`${where} revalidate`, err);
  }
}

/**
 * P2002 al guardar: si es un código de barras (carrera con otra tableta)
 * devuelve DUPLICATE; si es SKU o código público devuelve null para reintentar.
 */
async function duplicateFromRace(
  ds: InventoryDataSource, field: ReturnType<typeof uniqueViolationField>, barcodes: string[],
): Promise<CreateProductResult | null> {
  if (barcodes.length === 0 || field === "sku" || field === "publicCode") return null;
  const dup = await findDuplicate(ds, barcodes);
  if (dup) return dup;
  if (field === "barcode") {
    return { ok: false, code: "DUPLICATE", message: "Ese código ya está registrado. Búscalo para sumar piezas." };
  }
  return null;
}

async function checkLocation(
  user: NonNullable<Awaited<ReturnType<typeof currentUserOrNull>>>, ds: InventoryDataSource, rawLocationId: unknown,
): Promise<{ ok: true; locationId: string } | { ok: false; result: CreateProductResult }> {
  const locationId = typeof rawLocationId === "string" ? rawLocationId : "";
  try {
    assertCanOperate(user, locationId);
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, result: { ok: false, code: "FORBIDDEN", message: err.message } };
    throw err;
  }
  const locations = await ds.getLocations();
  if (!locationId || !locations.some((l) => l.id === locationId)) {
    return {
      ok: false,
      result: { ok: false, code: "LOCATION", message: "La tienda seleccionada no existe. Recarga la página y elige otra." },
    };
  }
  return { ok: true, locationId };
}

/**
 * Alta de producto con una o varias tallas desde el escáner. Nunca lanza:
 * devuelve un resultado tipado con mensaje en español para el operador. Los
 * SKU los genera el servidor; si un código ya existe no se crea nada y el
 * resultado dice cuál (`duplicateBarcode`).
 */
// TODO(alta-lote, auditoría QA 2026-11-04): si el alta falla después de
// uploadProductImageAction, el blob en Vercel queda huérfano. Fuera del alcance
// de la demo; limpiar con `del()` de @vercel/blob o un barrido periódico.
export async function createProductAction(input: CreateProductInput): Promise<CreateProductResult> {
  try {
    const user = await currentUserOrNull();
    if (!user) {
      return { ok: false, code: "FORBIDDEN", message: SESSION_EXPIRED_TEXT };
    }
    if (!input || typeof input !== "object") {
      return { ok: false, code: "INVALID", message: "Faltan los datos del producto." };
    }

    let data;
    try {
      data = validateNewProduct(input);
    } catch (err) {
      return { ok: false, code: "INVALID", message: err instanceof Error ? err.message : "Datos inválidos." };
    }

    const ds = getDataSource();
    // Permiso antes que catálogos: un colaborador de otra tienda no consulta nada más.
    try {
      assertCanOperate(user, typeof input.locationId === "string" ? input.locationId : "");
    } catch (err) {
      if (err instanceof ForbiddenError) return { ok: false, code: "FORBIDDEN", message: err.message };
      throw err;
    }

    const [brand, department] = await Promise.all([
      prisma.brand.findUnique({ where: { id: data.brandId }, select: { name: true, isActive: true } }),
      prisma.department.findUnique({ where: { id: data.departmentId }, select: { isActive: true } }),
    ]);
    if (!brand?.isActive) {
      return { ok: false, code: "INVALID", message: "Elige una marca de la lista o créala." };
    }
    if (!department?.isActive) {
      return { ok: false, code: "INVALID", message: "Elige el departamento." };
    }

    const loc = await checkLocation(user, ds, input.locationId);
    if (!loc.ok) return loc.result;

    const barcodes = data.sizes.flatMap((r) => (r.barcode === null ? [] : [r.barcode]));
    const dup = await findDuplicate(ds, barcodes);
    if (dup) return dup;

    let skuTries = 0;
    let codeTries = 0;
    for (;;) {
      try {
        const created = await ds.createProduct({
          title: data.title,
          brand: brand.name,
          brandId: data.brandId,
          departmentId: data.departmentId,
          publicCode: generatePublicCode(),
          category: data.category,
          variants: data.sizes.map((r) => ({ ...r, sku: generateInternalSku() })),
          locationId: loc.locationId,
          imageUrl: data.imageUrl,
          backImageUrl: data.backImageUrl,
          description: data.description,
          userId: user.id,
        });
        revalidateProducts("createProductAction");
        const first = created.variants[0];
        return {
          ok: true,
          product: { ...created.product, variants: created.product.variants.length ? created.product.variants : created.variants },
          variantId: first.id,
          sku: first.sku,
        };
      } catch (err) {
        const field = uniqueViolationField(err);
        if (field === null) throw err;
        const race = await duplicateFromRace(ds, field, barcodes);
        if (race) return race;
        // Choque de SKU o de código público (improbable): se reintenta con otro.
        const exhausted = field === "publicCode" ? ++codeTries >= PUBLIC_CODE_ATTEMPTS : ++skuTries >= SKU_ATTEMPTS;
        if (exhausted) {
          return { ok: false, code: "ERROR", message: "No se pudo generar un código único. Intenta guardar de nuevo." };
        }
      }
    }
  } catch (err) {
    console.error("createProductAction", err);
    return { ok: false, code: "ERROR", message: "No se pudo guardar el producto. Revisa tu conexión e intenta de nuevo." };
  }
}

export type AddVariantInput = {
  productId: string;
  size: string;
  /** Código escaneado de la talla nueva; null = "Sin código". */
  barcode: string | null;
  price: number;
  initialStock: number;
  locationId: string;
};

/**
 * Agrega una talla a un producto existente (activo y sin unir). El
 * colaborador fija el precio de la talla nueva igual que en el alta. Si la
 * talla ya existe sin código → INVALID "Esa talla ya existe: suma piezas con
 * Entrada"; con otro código se permite (otra etiqueta). Nunca lanza.
 */
export async function addVariantAction(input: AddVariantInput): Promise<CreateProductResult> {
  try {
    const user = await currentUserOrNull();
    if (!user) return { ok: false, code: "FORBIDDEN", message: SESSION_EXPIRED_TEXT };
    if (!input || typeof input !== "object" || typeof input.productId !== "string" || !input.productId) {
      return { ok: false, code: "INVALID", message: "Elige el producto al que se agrega la talla." };
    }

    let row;
    try {
      row = validateSizeRow({ size: input.size, barcode: input.barcode, price: input.price, initialStock: input.initialStock });
    } catch (err) {
      return { ok: false, code: "INVALID", message: err instanceof Error ? err.message : "Datos inválidos." };
    }

    const ds = getDataSource();
    const loc = await checkLocation(user, ds, input.locationId);
    if (!loc.ok) return loc.result;

    const barcodes = row.barcode === null ? [] : [row.barcode];
    const dup = await findDuplicate(ds, barcodes);
    if (dup) return dup;

    for (let tries = 1; ; tries++) {
      try {
        const match = await ds.addVariant({
          productId: input.productId,
          sku: generateInternalSku(),
          size: row.size,
          barcode: row.barcode,
          price: row.price,
          initialStock: row.initialStock,
          locationId: loc.locationId,
          userId: user.id,
        });
        revalidateProducts("addVariantAction");
        return { ok: true, product: withVariant(match), variantId: match.variant.id, sku: match.variant.sku };
      } catch (err) {
        if (err instanceof InventoryRuleError) return { ok: false, code: "INVALID", message: err.message };
        const field = uniqueViolationField(err);
        if (field === null) throw err;
        const race = await duplicateFromRace(ds, field, barcodes);
        if (race) return race;
        if (tries >= SKU_ATTEMPTS) {
          return { ok: false, code: "ERROR", message: "No se pudo generar un código único. Intenta guardar de nuevo." };
        }
      }
    }
  } catch (err) {
    console.error("addVariantAction", err);
    return { ok: false, code: "ERROR", message: "No se pudo agregar la talla. Revisa tu conexión e intenta de nuevo." };
  }
}

/**
 * Busca productos para "¿Es otra talla de un producto ya registrado?": código
 * público exacto, título o marca. Solo staff con sesión (null si venció).
 */
export async function searchProductsAction(query: string): Promise<ProductSearchHit[] | null> {
  if (!(await currentUserOrNull())) return null;
  return await getDataSource().searchProducts(typeof query === "string" ? query : "");
}

export type UploadImageResult = { ok: true; url: string } | { ok: false; message: string };

/** Sube la foto del alta (campo `image` del FormData). Nunca lanza. */
export async function uploadProductImageAction(formData: FormData): Promise<UploadImageResult> {
  try {
    if (!(await currentUserOrNull())) {
      return { ok: false, message: "Tu sesión expiró: inicia sesión de nuevo." };
    }
    const file = formData?.get("image");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: "No se recibió una imagen válida. Toma la foto de nuevo." };
    }
    return { ok: true, url: await uploadImage(file) };
  } catch (err) {
    if (err instanceof ImageUploadError) return { ok: false, message: err.message };
    console.error("uploadProductImageAction", err);
    return { ok: false, message: "No se pudo subir la foto. Revisa tu conexión e intenta de nuevo." };
  }
}

export type PhotoActionResult =
  | { ok: true }
  | { ok: false; code: "SESSION" | "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "ERROR"; message: string };

const SESSION_EXPIRED: PhotoActionResult = { ok: false, code: "SESSION", message: SESSION_EXPIRED_TEXT };

/**
 * Verifica sesión, que el producto exista y esté activo, y que reemplazar una
 * foto existente lo haga solo owner o manager (poner la primera, cualquiera).
 */
async function checkPhotoAccess(productId: string, side: "front" | "back"): Promise<PhotoActionResult> {
  const user = await currentUserOrNull();
  if (!user) return SESSION_EXPIRED;
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { isActive: true, imageUrl: true, backImageUrl: true },
  });
  if (!product || !product.isActive) {
    return { ok: false, code: "NOT_FOUND", message: "El producto ya no existe." };
  }
  const existing = side === "back" ? product.backImageUrl : product.imageUrl;
  if (existing && user.role !== "owner" && user.role !== "manager") {
    return { ok: false, code: "FORBIDDEN", message: "Solo el dueño o el encargado pueden cambiar una foto ya puesta." };
  }
  return { ok: true };
}

/** Fija la foto de atrás (URL ya subida con uploadProductImageAction). Nunca lanza. */
export async function setProductBackImageAction(productId: string, url: string): Promise<PhotoActionResult> {
  try {
    const access = await checkPhotoAccess(productId, "back");
    if (!access.ok) return access;
    if (!isProductBlobUrl(url)) {
      return { ok: false, code: "INVALID", message: "La foto no se subió correctamente. Tómala de nuevo." };
    }
    await getDataSource().updateProductBackImage(productId, url);
    revalidatePath("/catalogo");
    revalidatePath("/productos");
    return { ok: true };
  } catch (err) {
    console.error("setProductBackImageAction", err);
    return { ok: false, code: "ERROR", message: "No se pudo guardar la foto. Intenta de nuevo." };
  }
}

/** Foto de frente: sube el archivo y la fija. Nunca lanza. */
export async function updateProductImageAction(productId: string, formData: FormData): Promise<PhotoActionResult> {
  try {
    const access = await checkPhotoAccess(productId, "front");
    if (!access.ok) return access;
    const file = formData?.get("image");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, code: "INVALID", message: "No se recibió una imagen válida." };
    }
    const url = await uploadImage(file);
    await getDataSource().updateProductImage(productId, url);
    revalidatePath("/catalogo");
    revalidatePath("/productos");
    return { ok: true };
  } catch (err) {
    if (err instanceof ImageUploadError) return { ok: false, code: "INVALID", message: err.message };
    console.error("updateProductImageAction", err);
    return { ok: false, code: "ERROR", message: "No se pudo guardar la foto. Intenta de nuevo." };
  }
}

/** Pública (sin sesión) a propósito: devuelve solo la proyección sin SKU, barcode ni conteos (B1). */
export async function fetchPublicProductsAction(): Promise<PublicProduct[]> {
  return await getPublicCatalog(getDataSource());
}

export async function changePasswordAction(
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  const user = await currentUserOrNull();
  if (!user) return { ok: false, error: "Tu sesión expiró: inicia sesión de nuevo." };
  return await changePassword(user.id, currentPassword, newPassword);
}

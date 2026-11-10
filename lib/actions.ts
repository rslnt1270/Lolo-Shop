"use server";
import { isProductBlobUrl } from "./image/blob-url";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./auth/current-user";
import { ForbiddenError } from "./auth/errors";
import { assertCanOperate, currentUserOrNull } from "./auth/permissions";
import { getPublicCatalog, type PublicProduct } from "@/lib/data/public-projection";
import { getDataSource } from "./data/get-source";
import type { Location, LocationType, Product } from "./domain/types";
import { validateNewProduct, type EntryMode } from "./domain/new-product";
import { generatePublicCode } from "./domain/public-code";
import prisma from "./prisma";
import { normalizeCode, canonicalCode, isValidGtin, generateInternalSku } from "./domain/barcode";
import type { VariantMatch } from "./data/source";
import { uniqueViolationField } from "./data/errors";
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

export async function adjustInventoryAction(variantId: string, locationId: string, delta: number): Promise<void> {
  const user = await getCurrentUser();

  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error("El ajuste de inventario debe ser un entero distinto de cero.");
  }
  // Un colaborador solo puede mover inventario de su propia tienda.
  assertCanOperate(user, locationId);

  await getDataSource().adjustInventory(variantId, locationId, delta, user.id);
  revalidatePath("/catalogo");
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
  price: number;
  size?: string;
  barcode?: string | null;
  noBarcode?: boolean;
  locationId: string;
  initialStock: number;
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
    };

/** Un intento inicial + hasta 3 reintentos si el SKU generado choca (P2002). */
const SKU_ATTEMPTS = 4;
/** Hasta 5 intentos si el código público generado choca (P2002 en publicCode). */
const PUBLIC_CODE_ATTEMPTS = 5;
const MAX_BARCODE_LENGTH = 64;

function withVariant(match: VariantMatch): Product {
  return {
    ...match.product,
    variants: match.product.variants.length ? match.product.variants : [match.variant],
  };
}

function duplicateResult(match: VariantMatch): CreateProductResult {
  return {
    ok: false,
    code: "DUPLICATE",
    message: `Ese código ya está registrado: «${match.product.title}». Abre el producto para sumar piezas.`,
    existingVariantId: match.variant.id,
  };
}

/**
 * Alta de producto desde el escáner. Nunca lanza: devuelve un resultado
 * tipado con mensaje en español para el operador. El SKU lo genera el servidor.
 */
// TODO(alta-lote, auditoría QA 2026-11-04): si el alta falla después de
// uploadProductImageAction, el blob en Vercel queda huérfano. Fuera del alcance
// de la demo; limpiar con `del()` de @vercel/blob o un barrido periódico.
export async function createProductAction(input: CreateProductInput): Promise<CreateProductResult> {
  try {
    const user = await currentUserOrNull();
    if (!user) {
      return { ok: false, code: "FORBIDDEN", message: "Tu sesión expiró: inicia sesión de nuevo." };
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

    let barcode: string | null = null;
    if (!input.noBarcode) {
      // Alfanuméricos en MAYÚSCULAS para que "abc-1" y "ABC-1" sean el mismo código.
      barcode = canonicalCode(typeof input.barcode === "string" ? input.barcode : "");
      if (!barcode) {
        return { ok: false, code: "INVALID", message: "Escanea o escribe el código de la etiqueta, o marca «Sin código»." };
      }
      if (barcode.length > MAX_BARCODE_LENGTH) {
        return { ok: false, code: "INVALID", message: "El código es demasiado largo. Vuelve a escanearlo." };
      }
      if (!isValidGtin(barcode)) {
        return {
          ok: false,
          code: "INVALID",
          message: `El código ${barcode} no es válido (falla el dígito verificador). Vuelve a escanearlo.`,
        };
      }
    }

    const locationId = typeof input.locationId === "string" ? input.locationId : "";
    try {
      assertCanOperate(user, locationId);
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return { ok: false, code: "FORBIDDEN", message: err.message };
      }
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

    const ds = getDataSource();
    const locations = await ds.getLocations();
    if (!locationId || !locations.some((l) => l.id === locationId)) {
      return { ok: false, code: "LOCATION", message: "La tienda seleccionada no existe. Recarga la página y elige otra." };
    }

    if (barcode) {
      const existing = await ds.getProductByBarcode(barcode);
      if (existing) return duplicateResult(existing);
    }

    let skuTries = 0;
    let codeTries = 0;
    for (;;) {
      const sku = generateInternalSku();
      try {
        const match = await ds.createProduct({
          ...data,
          brand: brand.name,
          publicCode: generatePublicCode(),
          barcode,
          sku,
          locationId,
          userId: user.id,
        });
        try {
          revalidatePath("/catalogo");
          revalidatePath("/productos");
        } catch (err) {
          console.error("createProductAction revalidate", err);
        }
        return { ok: true, product: withVariant(match), variantId: match.variant.id, sku: match.variant.sku };
      } catch (err) {
        const field = uniqueViolationField(err);
        if (field === null) throw err;
        if (barcode && field !== "sku" && field !== "publicCode") {
          const existing = await ds.getProductByBarcode(barcode);
          if (existing) return duplicateResult(existing);
          if (field === "barcode") {
            return { ok: false, code: "DUPLICATE", message: "Ese código ya está registrado. Búscalo para sumar piezas." };
          }
        }
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

const SESSION_EXPIRED: PhotoActionResult = { ok: false, code: "SESSION", message: "Tu sesión expiró: inicia sesión de nuevo." };

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

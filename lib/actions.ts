"use server";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "./auth/options";
import { getDataSource } from "./data/get-source";
import type { Location, Product } from "./domain/types";
import type { VariantMatch } from "./data/source";

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("No autorizado: inicia sesión.");
  }
  return session;
}

export async function fetchProductsAction(): Promise<Product[]> {
  await requireSession();
  return await getDataSource().getProducts();
}

export async function fetchLocationsAction(): Promise<Location[]> {
  await requireSession();
  return await getDataSource().getLocations();
}

export async function getProductByBarcodeAction(code: string): Promise<VariantMatch | null> {
  await requireSession();
  return await getDataSource().getProductByBarcode(code);
}

export async function getProductByVariantIdAction(id: string): Promise<VariantMatch | null> {
  await requireSession();
  return await getDataSource().getProductByVariantId(id);
}

export async function adjustInventoryAction(variantId: string, locationId: string, delta: number): Promise<void> {
  const session = await requireSession();

  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error("El ajuste de inventario debe ser un entero distinto de cero.");
  }
  // Un colaborador solo puede mover inventario de su propia tienda.
  if (session.user.role === "collaborator" && session.user.locationId !== locationId) {
    throw new Error("No autorizado: solo puedes mover inventario de tu tienda asignada.");
  }

  await getDataSource().adjustInventory(variantId, locationId, delta, session.user.id);
  revalidatePath("/catalogo");
}

export async function createProductAction(data: {
  barcode: string;
  title: string;
  brand: string;
  price: number;
  sku?: string;
  locationId: string;
  imageUrl?: string;
}): Promise<VariantMatch> {
  await requireSession();

  if (!data.title.trim() || !data.brand.trim()) {
    throw new Error("Título y marca son obligatorios.");
  }
  if (!Number.isFinite(data.price) || data.price < 0) {
    throw new Error("El precio debe ser un número mayor o igual a cero.");
  }

  const result = await getDataSource().createProduct(data);
  revalidatePath("/catalogo");
  return result;
}

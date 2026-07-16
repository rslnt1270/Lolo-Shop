"use server";
import { getDataSource } from "./data/get-source";
import type { Location, Product } from "./domain/types";
import type { VariantMatch } from "./data/source";

export async function fetchProductsAction(): Promise<Product[]> {
  return await getDataSource().getProducts();
}

export async function fetchLocationsAction(): Promise<Location[]> {
  return await getDataSource().getLocations();
}

export async function getProductByBarcodeAction(code: string): Promise<VariantMatch | null> {
  return await getDataSource().getProductByBarcode(code);
}

export async function getProductByVariantIdAction(id: string): Promise<VariantMatch | null> {
  return await getDataSource().getProductByVariantId(id);
}

export async function adjustInventoryAction(variantId: string, locationId: string, delta: number, userId?: string): Promise<void> {
  return await getDataSource().adjustInventory(variantId, locationId, delta, userId);
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
  return await getDataSource().createProduct(data);
}

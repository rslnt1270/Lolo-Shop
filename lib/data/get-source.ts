import type { InventoryDataSource } from "./source";
import { FixtureDataSource } from "./fixture-source";

// Fase 1: fixtures. Fase 2+: si existe SHOPIFY_ACCESS_TOKEN, devolver ShopifyDataSource.
export function getDataSource(): InventoryDataSource {
  return new FixtureDataSource();
}

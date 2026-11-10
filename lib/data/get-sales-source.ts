import type { SalesDataSource } from "./sales-source";
import { PrismaSalesDataSource } from "./prisma-sales-source";

export function getSalesSource(): SalesDataSource {
  return new PrismaSalesDataSource();
}

import type { InventoryDataSource } from "./source";
import { PrismaDataSource } from "./prisma-source";

export function getDataSource(): InventoryDataSource {
  return new PrismaDataSource();
}

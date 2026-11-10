import { PrismaClient } from "@prisma/client";
import { getTestDatabaseUrl } from "./guard";

/** true si hay base de pruebas configurada; usar con `describe.skipIf(!hasTestDb)`. */
export const hasTestDb = Boolean(getTestDatabaseUrl());

export const testPrisma = new PrismaClient({
  datasources: { db: { url: getTestDatabaseUrl() ?? "postgresql://invalid:invalid@127.0.0.1:1/none" } },
});

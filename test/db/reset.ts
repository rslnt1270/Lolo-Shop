import { Prisma } from "@prisma/client";
import { testPrisma } from "./setup";

/** Vacía todas las tablas del esquema (TRUNCATE ... CASCADE), generado desde el DMMF. */
export async function resetDb(): Promise<void> {
  const tables = Prisma.dmmf.datamodel.models.map((m) => `"public"."${m.dbName ?? m.name}"`);
  if (tables.length === 0) return;
  await testPrisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
}

import { isLocalDatabaseUrl } from "../../prisma/local-db";

/** Devuelve TEST_DATABASE_URL solo si apunta a un host local; si no, lanza. */
export function getTestDatabaseUrl(): string | undefined {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return undefined;
  if (!isLocalDatabaseUrl(url)) {
    throw new Error(`TEST_DATABASE_URL apunta a un host no local (${new URL(url).hostname}); se rechaza.`);
  }
  return url;
}

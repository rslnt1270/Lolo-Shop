const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Devuelve TEST_DATABASE_URL solo si apunta a un host local; si no, lanza. */
export function getTestDatabaseUrl(): string | undefined {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return undefined;
  const { hostname } = new URL(url);
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error(`TEST_DATABASE_URL apunta a un host no local (${hostname}); se rechaza.`);
  }
  return url;
}

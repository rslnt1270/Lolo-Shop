const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** true solo si la URL de conexión apunta a un host local. Una URL inválida no es local. */
export function isLocalDatabaseUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

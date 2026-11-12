/** Favoritos locales: solo IDs de texto en localStorage. El servidor nunca los recibe. */
export const FAVORITES_KEY = "loloshop.favoritos.v1";

/** Storage del navegador, o null sin `window` o si el acceso lanza (modo privado, bloqueado). */
export function getLocalStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readFavorites(storage: Storage | null): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.filter((x): x is string => typeof x === "string")));
  } catch {
    return [];
  }
}

export function writeFavorites(storage: Storage | null, ids: string[]): boolean {
  if (!storage) return false;
  try {
    storage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(new Set(ids))));
    return true;
  } catch {
    return false;
  }
}

export function toggleFavorite(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

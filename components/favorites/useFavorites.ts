"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FAVORITES_KEY, getLocalStorage, readFavorites, toggleFavorite, writeFavorites } from "@/lib/public/favorites";

export interface FavoritesApi {
  ready: boolean;
  storageOk: boolean;
  ids: string[];
  /** La última escritura falló: la lista sigue usable en memoria durante la sesión. */
  saveFailed: boolean;
  isSaved(id: string): boolean;
  toggle(id: string): void;
}

/** Favoritos del navegador. Lee localStorage solo después de montar (sin desajuste de hidratación). */
export function useFavorites(): FavoritesApi {
  const [ready, setReady] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [ids, setIds] = useState<string[]>([]);
  const [saveFailed, setSaveFailed] = useState(false);
  const idsRef = useRef<string[]>([]);
  const readyRef = useRef(false);

  useEffect(() => {
    const storage = getLocalStorage();
    let ok = storage !== null;
    if (storage) {
      try {
        storage.getItem(FAVORITES_KEY);
      } catch {
        ok = false;
      }
    }
    setStorageOk(ok);
    const initial = ok ? readFavorites(storage) : [];
    idsRef.current = initial;
    setIds(initial);
    readyRef.current = true;
    setReady(true);
  }, []);

  const toggle = useCallback((id: string) => {
    // Antes de leer lo guardado no se escribe: evitaría pisar la lista con [].
    if (!readyRef.current) return;
    const next = toggleFavorite(idsRef.current, id);
    idsRef.current = next;
    setIds(next);
    setSaveFailed(!writeFavorites(getLocalStorage(), next));
  }, []);

  const isSaved = useCallback((id: string) => ids.includes(id), [ids]);

  return { ready, storageOk, ids, saveFailed, isSaved, toggle };
}

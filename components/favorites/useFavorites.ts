"use client";

import { useCallback, useEffect, useState } from "react";
import { FAVORITES_KEY, getLocalStorage, readFavorites, toggleFavorite, writeFavorites } from "@/lib/public/favorites";

export interface FavoritesApi {
  ready: boolean;
  storageOk: boolean;
  ids: string[];
  isSaved(id: string): boolean;
  toggle(id: string): void;
}

/** Favoritos del navegador. Lee localStorage solo después de montar (sin desajuste de hidratación). */
export function useFavorites(): FavoritesApi {
  const [ready, setReady] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [ids, setIds] = useState<string[]>([]);

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
    setIds(ok ? readFavorites(storage) : []);
    setReady(true);
  }, []);

  const toggle = useCallback(
    (id: string) => {
      setIds((prev) => {
        const next = toggleFavorite(prev, id);
        if (!writeFavorites(getLocalStorage(), next)) setStorageOk(false);
        return next;
      });
    },
    [],
  );

  const isSaved = useCallback((id: string) => ids.includes(id), [ids]);

  return { ready, storageOk, ids, isSaved, toggle };
}

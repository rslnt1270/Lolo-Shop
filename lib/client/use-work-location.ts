"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLocationsAction } from "@/lib/actions";

export const WORK_LOCATION_KEY = "loloshop:work-location";
const LEGACY_KEYS = ["loloshop:pos:location", "loloshop:escanear:location"];
/** Nombres de las tiendas de la última carga: /pos sin red los usa para decir en qué tienda está. */
export const LOCATIONS_CACHE_KEY = "loloshop:locations-cache";

type NamedLocation = { id: string; name: string };

function readCachedLocations(): NamedLocation[] {
  try {
    const raw = localStorage.getItem(LOCATIONS_CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l): l is NamedLocation =>
        typeof l === "object" && l !== null && typeof l.id === "string" && typeof l.name === "string",
    );
  } catch {
    return [];
  }
}

function writeCachedLocations(list: NamedLocation[]) {
  try {
    localStorage.setItem(LOCATIONS_CACHE_KEY, JSON.stringify(list));
  } catch {
    /* sin storage */
  }
}

/** Guardada (si sigue en la lista) → asignada (si está en la lista) → "" (hay que preguntar). */
export function pickWorkLocation(
  locations: { id: string }[],
  saved: string | null,
  assigned: string | null,
): string {
  if (saved && locations.some((l) => l.id === saved)) return saved;
  if (assigned && locations.some((l) => l.id === assigned)) return assigned;
  return "";
}

function readSaved(): string | null {
  try {
    const current = sessionStorage.getItem(WORK_LOCATION_KEY);
    if (current) return current;
    for (const key of LEGACY_KEYS) {
      const old = sessionStorage.getItem(key);
      if (old) {
        sessionStorage.setItem(WORK_LOCATION_KEY, old);
        return old;
      }
    }
  } catch {
    /* sin storage */
  }
  return null;
}

export function useWorkLocation(opts: { assigned: string | null; enabled: boolean }) {
  const { assigned, enabled } = opts;
  const [locations, setLocations] = useState<NamedLocation[]>([]);
  // Se lee después de montar (no en el render del servidor).
  const [cachedLocations, setCachedLocations] = useState<NamedLocation[]>([]);
  const [locationId, setLocationId] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "session">("loading");
  const [attempt, setAttempt] = useState(0);
  const assignedRef = useRef(assigned);
  assignedRef.current = assigned;

  useEffect(() => {
    setCachedLocations(readCachedLocations());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setStatus("loading");
    fetchLocationsAction()
      .then((res) => {
        if (cancelled) return;
        if (res == null) {
          setStatus("session");
          return;
        }
        const list = res.map((l) => ({ id: l.id, name: l.name }));
        setLocations(list);
        writeCachedLocations(list);
        setCachedLocations(list);
        setLocationId(pickWorkLocation(list, readSaved(), assignedRef.current));
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);

  const choose = useCallback((id: string) => {
    setLocationId(id);
    try {
      sessionStorage.setItem(WORK_LOCATION_KEY, id);
    } catch {
      /* sin storage */
    }
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const locationName = locations.find((l) => l.id === locationId)?.name ?? null;

  return { locations, cachedLocations, locationId, locationName, choose, status, retry };
}

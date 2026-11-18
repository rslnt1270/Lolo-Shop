"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLocationsAction } from "@/lib/actions";

export const WORK_LOCATION_KEY = "loloshop:work-location";
const LEGACY_KEYS = ["loloshop:pos:location", "loloshop:escanear:location"];

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
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [locationId, setLocationId] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "session">("loading");
  const [attempt, setAttempt] = useState(0);
  const assignedRef = useRef(assigned);
  assignedRef.current = assigned;

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

  return { locations, locationId, locationName, choose, status, retry };
}

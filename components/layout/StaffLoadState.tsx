"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoginLink, SESSION_EXPIRED_TEXT } from "@/components/sales/session-expired";
import { Button } from "@/components/ui/Button";

export type StaffLoadStatus = "loading" | "ready" | "session" | "error";

/**
 * Carga datos de una pantalla de staff. `load` devuelve null cuando la sesión venció
 * y rechaza cuando falla la red. `setData` permite actualizar sin volver a "loading".
 */
export function useStaffData<T>(load: () => Promise<T | null>) {
  const [state, setState] = useState<StaffLoadStatus>("loading");
  const [data, setData] = useState<T | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    Promise.resolve()
      .then(() => loadRef.current())
      .then((r) => {
        if (cancelled) return;
        if (r === null || r === undefined) {
          setData(null);
          setState("session");
        } else {
          setData(r);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, data, retry, setData };
}

/** Aviso a pantalla completa para los estados que no son "ready". */
export function StaffLoadState({ state, retry }: { state: StaffLoadStatus; retry: () => void }) {
  if (state === "ready") return null;
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center gap-3 p-6 text-center">
      {state === "loading" && (
        <p role="status" className="text-base text-gray-700 motion-safe:animate-pulse">
          Cargando…
        </p>
      )}
      {state === "session" && (
        <div role="alert" className="space-y-2 text-base font-semibold text-gray-800">
          <p>{SESSION_EXPIRED_TEXT}</p>
          <LoginLink />
        </div>
      )}
      {state === "error" && (
        <div role="alert" className="space-y-3">
          <p className="text-base font-semibold text-gray-800">No hay conexión.</p>
          <Button onClick={retry}>Reintentar</Button>
        </div>
      )}
    </main>
  );
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Role } from "@/lib/domain/types";
import { getOfflineSnapshotAction } from "@/lib/sales/offline-actions";
import type { StoredIdentity, StoredSnapshot } from "./db";
import { getIdentity, saveIdentity } from "./identity-store";
import { getLatestSnapshot, getSnapshot, saveSnapshot } from "./snapshot-store";

const HOUR_MS = 60 * 60 * 1000;
/** Identidad sin conexión vigente: igual que el JWT (spec §12, P1). */
export const IDENTITY_MAX_AGE_MS = 12 * HOUR_MS;
/** Sin internet solo se vende con una copia de ≤ 24 h (spec §5, P1). */
export const SNAPSHOT_MAX_AGE_MS = 24 * HOUR_MS;
/** Con `/pos` abierto y conexión, la copia se vuelve a pedir cada 10 min. */
export const SNAPSHOT_REFRESH_MS = 10 * 60 * 1000;
/** Cada cuánto se recalculan las edades de la identidad y de la copia. */
const CLOCK_TICK_MS = 60 * 1000;

// Textos al cajero (spec §10 y §12).
export const OFFLINE_IDENTITY_EXPIRED_TEXT = "Conéctate e inicia sesión para seguir vendiendo";
export const OFFLINE_SNAPSHOT_BLOCKED_TEXT = "Conéctate para actualizar precios y existencias";
export const OFFLINE_NOT_FOUND_TEXT =
  "No está en la copia de esta tienda. Si es nueva, se vende cuando vuelva la conexión.";

export interface OfflineIdentity {
  userId: string;
  role: Role;
  locationId: string | null;
}

export type OfflineBlockReason = null | "no_snapshot" | "stale_snapshot" | "identity_expired";

export interface UseOfflinePosArgs {
  online: boolean;
  sessionUser: { id: string; role: Role; locationId: string | null } | null;
  /** Tienda pedida por la página (la del colaborador o la elegida en el selector). */
  locationId: string;
}

export interface OfflinePosState {
  /** Identidad vigente (≤ 12 h desde la última sesión confirmada); null si venció o no hay. */
  identity: OfflineIdentity | null;
  /** Ya se leyó la identidad guardada (antes de eso no se sabe si se puede vender sin red). */
  identityChecked: boolean;
  /** Copia de la tienda `locationId` con su `snapshotToken`. */
  snapshot: StoredSnapshot | null;
  /** Ya se leyó la copia guardada de `locationId` (antes de eso no se avisa "sin copia"). */
  snapshotChecked: boolean;
  snapshotAgeMs: number | null;
  canSellOffline: boolean;
  blockReason: OfflineBlockReason;
  /**
   * Tienda efectiva: la pedida; sin conexión y sin tienda pedida, la de la
   * identidad o, para owner y manager sin tienda, la de la copia más reciente.
   */
  locationId: string;
  /** Pide la copia otra vez (después de una sincronización con éxito). */
  refreshSnapshot: () => void;
}

const ROLES: readonly Role[] = ["owner", "manager", "collaborator"];

function validIdentity(stored: StoredIdentity | null, now: number): OfflineIdentity | null {
  if (!stored || !ROLES.includes(stored.role as Role)) return null;
  const at = Date.parse(stored.confirmedAt);
  if (!Number.isFinite(at) || now - at > IDENTITY_MAX_AGE_MS) return null;
  return { userId: stored.userId, role: stored.role as Role, locationId: stored.locationId };
}

const newer = <T extends { generatedAt: string } | { confirmedAt: string }>(a: T | null, b: T | null): T | null => {
  if (!a) return b;
  if (!b) return a;
  const at = (x: T) => Date.parse("generatedAt" in x ? x.generatedAt : x.confirmedAt);
  return at(b) > at(a) ? b : a;
};

/** `navigator.onLine` con sus eventos. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/**
 * Copia local de la tienda e identidad sin conexión para `/pos` (spec §5 y §12).
 *
 * - La identidad se guarda (sin JWT, cookie ni secretos) cada vez que hay
 *   sesión, y se vuelve a confirmar con cada copia que el servidor entrega.
 * - Con conexión y sesión, la copia se pide al abrir, al cambiar de tienda, al
 *   volver la conexión y cada 10 min; se guarda con su `snapshotToken`.
 * - Nada aquí lanza: si el almacenamiento o la red fallan, se sigue sin copia.
 */
export function useOfflinePos({ online, sessionUser, locationId }: UseOfflinePosArgs): OfflinePosState {
  const [now, setNow] = useState(() => Date.now());
  const [storedIdentity, setStoredIdentity] = useState<StoredIdentity | null>(null);
  const [identityChecked, setIdentityChecked] = useState(false);
  const [latestLocationId, setLatestLocationId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<StoredSnapshot | null>(null);
  const [snapshotChecked, setSnapshotChecked] = useState(false);

  const sessionId = sessionUser?.id ?? null;
  const sessionRole = sessionUser?.role ?? null;
  const sessionLocation = sessionUser?.locationId ?? null;

  const identity = validIdentity(storedIdentity, now);
  const effectiveLocationId =
    locationId || (!online && identity ? (identity.locationId ?? latestLocationId ?? "") : "");

  const mountedRef = useRef(true);
  const locationRef = useRef(effectiveLocationId);
  locationRef.current = effectiveLocationId;
  const sessionRef = useRef(sessionUser);
  sessionRef.current = sessionUser;
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const inFlightRef = useRef(new Set<string>());

  useEffect(() => {
    mountedRef.current = true;
    const tick = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    void getIdentity().then((stored) => {
      if (!mountedRef.current) return;
      setStoredIdentity((prev) => newer(prev, stored));
      setIdentityChecked(true);
    });
    void getLatestSnapshot().then((s) => {
      if (mountedRef.current && s) setLatestLocationId((prev) => prev ?? s.locationId);
    });
    return () => {
      mountedRef.current = false;
      clearInterval(tick);
    };
  }, []);

  const confirmIdentity = useCallback((user: { id: string; role: Role; locationId: string | null }) => {
    const record: StoredIdentity = {
      userId: user.id,
      role: user.role,
      locationId: user.locationId,
      confirmedAt: new Date().toISOString(),
    };
    setNow(Date.now());
    setStoredIdentity(record);
    setIdentityChecked(true);
    void saveIdentity(record);
  }, []);

  // Sesión confirmada: se guarda la identidad.
  useEffect(() => {
    if (sessionId === null || sessionRole === null) return;
    confirmIdentity({ id: sessionId, role: sessionRole, locationId: sessionLocation });
  }, [sessionId, sessionRole, sessionLocation, confirmIdentity]);

  // Copia guardada de la tienda efectiva.
  useEffect(() => {
    setSnapshot(null);
    setSnapshotChecked(false);
    if (!effectiveLocationId) return;
    let cancelled = false;
    void getSnapshot(effectiveLocationId).then((s) => {
      if (cancelled) return;
      if (s && s.locationId === effectiveLocationId) setSnapshot((prev) => newer(prev, s));
      setSnapshotChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveLocationId]);

  const refreshSnapshot = useCallback(async () => {
    const loc = locationRef.current;
    const user = sessionRef.current;
    if (!onlineRef.current || !user || !loc || inFlightRef.current.has(loc)) return;
    inFlightRef.current.add(loc);
    try {
      const res = await getOfflineSnapshotAction(loc);
      // `undefined`: el middleware redirigió (sesión vencida). Cualquier `ok: false` deja la copia que había.
      if (!res || !res.ok || res.snapshot.locationId !== loc) return;
      const record: StoredSnapshot = { ...res.snapshot, snapshotToken: res.snapshotToken };
      await saveSnapshot(record);
      if (!mountedRef.current) return;
      if (locationRef.current === loc) setSnapshot((prev) => newer(prev, record));
      setLatestLocationId(loc);
      // El servidor aceptó la sesión: la identidad queda confirmada ahora.
      const current = sessionRef.current;
      if (current && current.id === user.id) confirmIdentity(current);
    } catch {
      // Sin red o servidor caído: se sigue con la copia guardada.
    } finally {
      inFlightRef.current.delete(loc);
    }
  }, [confirmIdentity]);

  // Al abrir, al cambiar de tienda, al volver la conexión y cada 10 min.
  useEffect(() => {
    if (!online || sessionId === null || !effectiveLocationId) return;
    void refreshSnapshot();
    const timer = setInterval(() => void refreshSnapshot(), SNAPSHOT_REFRESH_MS);
    return () => clearInterval(timer);
  }, [online, sessionId, effectiveLocationId, refreshSnapshot]);

  const snapshotAgeMs = snapshot ? Math.max(0, now - Date.parse(snapshot.generatedAt)) : null;
  const blockReason: OfflineBlockReason = !identity
    ? "identity_expired"
    : !snapshot
      ? "no_snapshot"
      : snapshotAgeMs === null || !Number.isFinite(snapshotAgeMs) || snapshotAgeMs > SNAPSHOT_MAX_AGE_MS
        ? "stale_snapshot"
        : null;

  return {
    identity,
    identityChecked,
    snapshot,
    snapshotChecked,
    snapshotAgeMs,
    canSellOffline: blockReason === null,
    blockReason,
    locationId: effectiveLocationId,
    refreshSnapshot: () => void refreshSnapshot(),
  };
}

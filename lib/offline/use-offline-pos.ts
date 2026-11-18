"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Role } from "@/lib/domain/types";
import { getOfflineSnapshotAction } from "@/lib/sales/offline-actions";
import type { StoredIdentity, StoredSnapshot } from "./db";
import { getIdentity, saveIdentity } from "./identity-store";
import { fetchSessionUser, type SessionUser } from "./session-user";
import { deleteSnapshot, getLatestSnapshot, getSnapshot, saveSnapshot } from "./snapshot-store";

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
/** Texto propio (el spec §5 solo pide "deshabilitado con aviso"). */
export const OFFLINE_SNAPSHOT_TOO_LARGE_TEXT =
  "Esta tienda tiene demasiadas prendas para vender sin internet. Avisa al dueño.";
export const OFFLINE_NOT_FOUND_TEXT =
  "No está en la copia de esta tienda. Si es nueva, se vende cuando vuelva la conexión.";

export interface OfflineIdentity {
  userId: string;
  role: Role;
  locationId: string | null;
}

/** `too_large`: el servidor rechazó la copia por pasar de 20 000 variantes (spec §5). */
export type OfflineBlockReason = null | "no_snapshot" | "stale_snapshot" | "identity_expired" | "too_large";

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
  /** Copia de la tienda `locationId` con su `snapshotToken`, solo si la bajó el usuario de `identity`. */
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
  /** Usuario cuya copia más reciente ya se buscó (antes de eso, sin red no se elige tienda). */
  const [latestCheckedFor, setLatestCheckedFor] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<StoredSnapshot | null>(null);
  const [snapshotChecked, setSnapshotChecked] = useState(false);
  /** Tiendas cuya copia el servidor rechazó por tamaño: sin internet no se vende ahí. */
  const [tooLarge, setTooLarge] = useState<ReadonlySet<string>>(() => new Set());

  const sessionId = sessionUser?.id ?? null;
  const sessionRole = sessionUser?.role ?? null;
  const sessionLocation = sessionUser?.locationId ?? null;

  const identity = validIdentity(storedIdentity, now);
  const identityUserId = identity?.userId ?? null;
  // Sin red y sin tienda elegida: la tienda de la copia más reciente del usuario (la tienda de
  // siempre ya no basta: el colaborador pudo trabajar en otra). Se espera a saber cuál es.
  const effectiveLocationId =
    locationId ||
    (!online && identity && latestCheckedFor === identity.userId
      ? (latestLocationId ?? identity.locationId ?? "")
      : "");

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

  // Tienda de la copia más reciente de este usuario (cualquier rol que abre sin red).
  useEffect(() => {
    setLatestLocationId(null);
    setLatestCheckedFor(null);
    if (identityUserId === null) return;
    let cancelled = false;
    void getLatestSnapshot(identityUserId).then((s) => {
      if (cancelled) return;
      if (s) setLatestLocationId((prev) => prev ?? s.locationId);
      setLatestCheckedFor(identityUserId);
    }, () => {
      // Sin almacenamiento: se sigue con la tienda de siempre.
      if (!cancelled) setLatestCheckedFor(identityUserId);
    });
    return () => {
      cancelled = true;
    };
  }, [identityUserId]);

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
      if (res && !res.ok && res.reason === "too_large") {
        // Spec §5: pasar de 20 000 variantes deshabilita la venta sin internet en esa tienda;
        // la copia anterior tampoco se usa.
        await deleteSnapshot(loc);
        if (!mountedRef.current) return;
        setTooLarge((prev) => new Set(prev).add(loc));
        if (locationRef.current === loc) setSnapshot(null);
        return;
      }
      // `undefined`: el middleware redirigió (sesión vencida). Otro `ok: false` deja la copia que había.
      if (!res || !res.ok || res.snapshot.locationId !== loc) return;
      const record: StoredSnapshot = { ...res.snapshot, snapshotToken: res.snapshotToken, userId: user.id };
      await saveSnapshot(record);
      if (!mountedRef.current) return;
      setTooLarge((prev) => {
        if (!prev.has(loc)) return prev;
        const next = new Set(prev);
        next.delete(loc);
        return next;
      });
      if (locationRef.current === loc) setSnapshot(record);
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

  // Una copia solo vale con la identidad de quien la bajó (otro usuario del teléfono baja la suya).
  const ownSnapshot = snapshot && identity && snapshot.userId === identity.userId ? snapshot : null;
  const snapshotAgeMs = ownSnapshot ? Math.max(0, now - Date.parse(ownSnapshot.generatedAt)) : null;
  const blockReason: OfflineBlockReason = !identity
    ? "identity_expired"
    : tooLarge.has(effectiveLocationId)
      ? "too_large"
    : !ownSnapshot
      ? "no_snapshot"
      : snapshotAgeMs === null || !Number.isFinite(snapshotAgeMs) || snapshotAgeMs > SNAPSHOT_MAX_AGE_MS
        ? "stale_snapshot"
        : null;

  return {
    identity,
    identityChecked,
    snapshot: ownSnapshot,
    snapshotChecked,
    snapshotAgeMs,
    canSellOffline: blockReason === null,
    blockReason,
    locationId: effectiveLocationId,
    refreshSnapshot: () => void refreshSnapshot(),
  };
}

export interface RevalidatedSession {
  /** Usuario confirmado por el servidor al volver la conexión (null: sin confirmar o sin sesión). */
  user: SessionUser | null;
  /**
   * La revalidación está en curso o falló por red: la página sigue con la
   * identidad local hasta saber si hay sesión.
   */
  pending: boolean;
  /** La consulta al servidor está en curso. */
  checking: boolean;
}

/**
 * next-auth 4 no vuelve a pedir una sesión que quedó en null (abrir sin red o
 * volver a la pestaña sin red) ni escucha el evento `online`. Al volver la
 * conexión sin sesión de next-auth, se pregunta al servidor; mientras tanto, y
 * si la red sigue fallando, la página usa la identidad local. Solo un "no hay
 * sesión" del servidor lleva a la pantalla de iniciar sesión.
 */
export function useRevalidatedSession({
  online,
  status,
  sessionUser,
}: {
  online: boolean;
  status: "loading" | "authenticated" | "unauthenticated";
  sessionUser: SessionUser | null;
}): RevalidatedSession {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const wasOfflineRef = useRef(!online);
  if (!online) wasOfflineRef.current = true;
  const hasSession = sessionUser !== null;

  useEffect(() => {
    if (!online || hasSession || status === "loading" || !wasOfflineRef.current) return;
    let cancelled = false;
    setPending(true);
    setChecking(true);
    fetchSessionUser().then(
      (u) => {
        if (cancelled) return;
        setUser(u);
        setPending(false);
        setChecking(false);
      },
      () => {
        // Sigue sin salida a internet: identidad local; se reintenta al volver la red otra vez.
        if (!cancelled) setChecking(false);
      },
    );
    return () => {
      cancelled = true;
      setChecking(false);
    };
  }, [online, hasSession, status]);

  return { user: hasSession ? null : user, pending: !hasSession && pending, checking: !hasSession && checking };
}

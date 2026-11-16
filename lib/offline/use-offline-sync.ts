"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { submitOfflineSaleAction } from "@/lib/sales/offline-actions";
import type { QueuedSale } from "./db";
import { listQueue, onQueueEnqueued, purgeSynced } from "./queue-store";
import { fetchSessionUserId } from "./session-user";
import { nextDelayMs, runSync, type SyncSummary } from "./sync";

export interface OfflineSyncState {
  /** Ventas de este usuario aún sin enviar (`pending` o `sending`). */
  pendingCount: number;
  /** Ventas de otros usuarios en este teléfono: esperan a que entre su dueño. */
  otherUserCount: number;
  /** Rechazadas por el servidor; se quedan hasta que owner o manager las descarten. */
  needsAttention: QueuedSale[];
  /** Última vuelta que envió, rechazó o se detuvo (las vueltas sin nada que hacer no la cambian). */
  lastSummary: SyncSummary | null;
  syncing: boolean;
  /** Botón "Enviar ahora" y venta en línea con éxito. También quita la pausa por sesión vencida. */
  syncNow: () => void;
}

type Trigger = "auto" | "resume";

const isUnsent = (s: QueuedSale) => s.state === "pending" || s.state === "sending";

/**
 * Sincroniza la cola sin internet mientras la página está abierta (spec §7).
 * Disparadores: al montar (carga de `/pos`), evento `online`, página visible,
 * venta encolada, `syncNow` y un temporizador 15 s → 30 s → … 5 min mientras
 * queden ventas de este usuario por enviar.
 *
 * `session_expired` y `user_mismatch` pausan los disparadores automáticos
 * (`online`, temporizador, encolado) hasta que cambia `userId`, la página vuelve
 * a estar visible (pudo iniciar sesión en otra pestaña) o se pulsa "Enviar
 * ahora". Reanudar no basta para enviar: cada vuelta confirma antes con el
 * servidor que la sesión real es la del usuario de las ventas, y el servidor
 * vuelve a comprobarlo por venta (`USER_MISMATCH`). Un "Enviar ahora" que llega
 * durante una vuelta que termina en pausa fuerza una vuelta más.
 * `network` y `storage` reintentan con espera creciente; con `storage` se
 * programa el reintento aunque la cola no se pueda leer.
 * Nada de esto borra ni marca como fallida una venta.
 */
export function useOfflineSync(userId: string | null): OfflineSyncState {
  const [pendingCount, setPendingCount] = useState(0);
  const [otherUserCount, setOtherUserCount] = useState(0);
  const [needsAttention, setNeedsAttention] = useState<QueuedSale[]>([]);
  const [lastSummary, setLastSummary] = useState<SyncSummary | null>(null);
  const [syncing, setSyncing] = useState(false);

  const userIdRef = useRef(userId);
  const mountedRef = useRef(false);
  const runningRef = useRef(false);
  const rerunRef = useRef(false);
  /** Un disparador que quita la pausa llegó durante la vuelta en curso. */
  const resumeDuringRunRef = useRef(false);
  /** La última vuelta se detuvo por red o almacenamiento: hay que reintentar. */
  const retryRef = useRef(false);
  const pausedRef = useRef(false);
  const failStreakRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<(t: Trigger) => void>(() => {});

  const clearTimer = () => {
    if (timerRef.current !== null) globalThis.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const refresh = useCallback(async (): Promise<number> => {
    const queue = await listQueue();
    const uid = userIdRef.current;
    const own = queue.filter((s) => isUnsent(s) && uid !== null && s.userId === uid).length;
    const others = queue.filter((s) => isUnsent(s) && (uid === null || s.userId !== uid)).length;
    if (mountedRef.current) {
      setPendingCount(own);
      setOtherUserCount(others);
      setNeedsAttention(queue.filter((s) => s.state === "needs_attention"));
    }
    return own;
  }, []);

  const trigger = useCallback(async (kind: Trigger) => {
    if (!mountedRef.current) return;
    if (kind === "resume") pausedRef.current = false;
    const uid = userIdRef.current;
    if (uid === null || pausedRef.current) {
      clearTimer();
      await refresh();
      return;
    }
    if (runningRef.current) {
      rerunRef.current = true; // la vuelta en curso pasa otra vez al terminar
      if (kind === "resume") resumeDuringRunRef.current = true;
      return;
    }
    runningRef.current = true;
    clearTimer();
    setSyncing(true);
    try {
      for (;;) {
        rerunRef.current = false;
        resumeDuringRunRef.current = false;
        const current = userIdRef.current; // pudo cambiar (otra sesión) durante la vuelta anterior
        if (current === null || pausedRef.current) break;
        const summary = await runSync({
          userId: current,
          submit: submitOfflineSaleAction,
          now: () => new Date(),
          sessionUserId: fetchSessionUserId,
        });
        const stop = summary.stoppedBy;
        if (stop === "session_expired" || stop === "user_mismatch") {
          // "Enviar ahora" durante esta vuelta: el cajero pudo volver a entrar; una vuelta más.
          pausedRef.current = !resumeDuringRunRef.current;
        }
        retryRef.current = stop === "network" || stop === "storage";
        if (retryRef.current) failStreakRef.current += 1;
        else failStreakRef.current = 0;
        if (mountedRef.current && (summary.sent.length > 0 || summary.failed.length > 0 || summary.stoppedBy)) {
          setLastSummary(summary);
        }
        // Otro disparador llegó durante la vuelta (venta encolada, red de vuelta, "Enviar ahora").
        if (!rerunRef.current || !mountedRef.current) break;
      }
      await purgeSynced(new Date());
    } catch {
      // inesperado: se reintenta con espera, la cola no se toca
      failStreakRef.current += 1;
      retryRef.current = true;
    } finally {
      runningRef.current = false;
      if (mountedRef.current) setSyncing(false);
    }

    const own = await refresh();
    if (!mountedRef.current) return;
    clearTimer();
    if ((own > 0 || retryRef.current) && !pausedRef.current && userIdRef.current !== null) {
      // Tras `failStreak` vueltas fallidas seguidas: 15 s, 30 s, 60 s… tope 5 min.
      const delay = nextDelayMs(Math.max(0, failStreakRef.current - 1));
      timerRef.current = globalThis.setTimeout(() => {
        timerRef.current = null;
        triggerRef.current("auto");
      }, delay);
    }
  }, [refresh]);

  useEffect(() => {
    triggerRef.current = (t) => { void trigger(t); };
  }, [trigger]);

  // Montaje y cambio de usuario (iniciar sesión): quita la pausa y envía.
  useEffect(() => {
    mountedRef.current = true;
    userIdRef.current = userId;
    failStreakRef.current = 0;
    void trigger("resume");
  }, [userId, trigger]);

  useEffect(() => {
    const onOnline = () => triggerRef.current("auto");
    const onVisible = () => {
      if (document.visibilityState === "visible") triggerRef.current("resume");
    };
    const offEnqueued = onQueueEnqueued(() => triggerRef.current("auto"));
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mountedRef.current = false;
      clearTimer();
      offEnqueued();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const syncNow = useCallback(() => triggerRef.current("resume"), []);

  return { pendingCount, otherUserCount, needsAttention, lastSummary, syncing, syncNow };
}

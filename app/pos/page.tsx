"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Scanner } from "@/components/inventory/Scanner";
import { ManualCodeEntry } from "@/components/inventory/ManualCodeEntry";
import { SaleCart, type PendingScan } from "@/components/sales/SaleCart";
import { Button } from "@/components/ui/Button";
import { SaleProductSearch } from "@/components/sales/SaleProductSearch";
import { PaymentPicker } from "@/components/sales/PaymentPicker";
import { fetchLocationsAction, lookupCodeAction, type LookupCodeResult } from "@/lib/actions";
import { createSaleAction } from "@/lib/sales/actions";
import { isValidGtin, normalizeCode } from "@/lib/domain/barcode";
import type { VariantMatch } from "@/lib/data/source";
import type { PaymentMethod, SaleChannel } from "@/lib/domain/sale";
import { useSaleDraft } from "@/lib/sales/use-sale-draft";
import { formatPrice } from "@/lib/public/format";
import { saleTotal, validateNewSale } from "@/lib/domain/sale";
import { StaffLoadState } from "@/components/layout/StaffLoadState";
import { LoginLink, SESSION_EXPIRED_TEXT } from "@/components/sales/session-expired";
import { discardQueued, enqueueSale, listQueue } from "@/lib/offline/queue-store";
import { lookupOffline, toDraftMatch } from "@/lib/offline/lookup";
import { OfflineStorageError, onOfflineStorageError } from "@/lib/offline/db";
import { localAvailable } from "@/lib/offline/snapshot-store";
import { localFolio, type SyncSummary } from "@/lib/offline/sync";
import { useOfflineSync } from "@/lib/offline/use-offline-sync";
import { OfflineBanner } from "@/components/sales/OfflineBanner";
import { OfflineQueueSheet } from "@/components/sales/OfflineQueueSheet";
import {
  OFFLINE_IDENTITY_EXPIRED_TEXT, OFFLINE_NOT_FOUND_TEXT, OFFLINE_SNAPSHOT_BLOCKED_TEXT, OFFLINE_SNAPSHOT_TOO_LARGE_TEXT,
  useOfflinePos, useOnline, useRevalidatedSession,
} from "@/lib/offline/use-offline-pos";

type LocationOption = { id: string; name: string };
type Notice = { kind: "ok" | "error"; text: string; login?: boolean };
type ApplyOutcome = { added: number; rejected: string | null; ok: string; title?: string; shortReason?: string };
type StockError = { message: string; signature: string; variantId?: string };

/** Aviso del cobro primero y el posterior después: error si alguno lo es, y conserva el enlace de sesión. */
function combineNotices(first: Notice, second: Notice): Notice {
  const lead = /[.!?]$/.test(first.text) ? first.text : `${first.text}.`;
  return {
    kind: first.kind === "error" || second.kind === "error" ? "error" : "ok",
    text: `${lead} ${second.text}`,
    ...(first.login || second.login ? { login: true } : {}),
  };
}

const NOT_FOUND_REASON = "No encontramos el código. Revisa que esté dado de alta.";
const OFFLINE_SAVE_FAILED_TEXT = "No se pudo guardar la venta en este teléfono. No quedó registrada: intenta de nuevo.";
const OFFLINE_DUPLICATE_TEXT = "Esta venta ya está guardada en este teléfono. Revisa las ventas por enviar.";
const OFFLINE_STORAGE_TEXT =
  "Este teléfono no pudo guardar datos sin internet (modo privado o sin espacio). Las ventas sin internet podrían no guardarse.";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Aviso de la última vuelta de envío (spec §10 y §7). `pendingCount` son las
 * ventas de este teléfono aún sin enviar; sin ellas, una pausa no se avisa.
 */
function syncNoticeFor(summary: SyncSummary, pendingCount: number, online: boolean): Notice | null {
  const parts: string[] = [];
  let kind: Notice["kind"] = "ok";
  let login = false;
  const { sent, failed, stoppedBy } = summary;
  if (sent.length) {
    const nums = sent.map((s) => `#${s.number}`).join(", ");
    parts.push(`${sent.length} ${plural(sent.length, "venta enviada", "ventas enviadas")} (${nums}).`);
    const review = sent.filter((s) => s.review).length;
    if (review) parts.push(`${review} ${plural(review, "quedó", "quedaron")} por aprobar del dueño.`);
  }
  if (failed.length) {
    kind = "error";
    parts.push(`${failed.length} ${plural(failed.length, "venta necesita", "ventas necesitan")} atención. Avisa al dueño.`);
  }
  if (stoppedBy === "session_expired" && pendingCount > 0) {
    kind = "error";
    login = true;
    parts.push(`Inicia sesión para enviar ${pendingCount} ${plural(pendingCount, "venta", "ventas")}.`);
  } else if (stoppedBy === "user_mismatch") {
    kind = "error";
    parts.push("Hay ventas de otro usuario en este teléfono. Se enviarán cuando esa persona inicie sesión.");
  } else if (stoppedBy === "network" && online && pendingCount > 0) {
    kind = "error";
    parts.push("No se pudieron enviar las ventas guardadas. Se reintentará sola.");
  } else if (stoppedBy === "storage" && pendingCount > 0) {
    kind = "error";
    parts.push("No se pudo leer o guardar la cola de este teléfono. Se reintentará sola.");
  }
  if (!parts.length) return null;
  return { kind, text: parts.join(" "), ...(login ? { login: true } : {}) };
}
const LOCATION_KEY = "loloshop:pos:location";

export default function POSPage() {
  const { data: session, status } = useSession();
  const draft = useSaleDraft();
  const { lines } = draft;

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [chosenLocation, setChosenLocation] = useState("");
  const [channel, setChannel] = useState<SaleChannel>("store");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [alias, setAlias] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [stockError, setStockError] = useState<StockError | null>(null);
  // Último aviso del cobro: sigue visible (y se le agrega lo que llegue después) hasta que la cajera actúe.
  const lastOutcomeRef = useRef<Notice | null>(null);
  const [pendingScans, setPendingScans] = useState<PendingScan[]>([]);
  // Códigos con consulta en curso o fallida: una segunda lectura del mismo código no crea otra fila.
  // `extra`: piezas idénticas que llegaron mientras la primera consulta cargaba o esperaba.
  const pendingRef = useRef(new Map<string, { status: "loading" | "error" | "queued" | "rejected"; extra: number; reason?: string }>());
  // Resultados que llegaron con un cobro en curso (o incierto): esperan para no alterar el carrito que se cobra.
  const heldRef = useRef(new Map<string, Extract<LookupCodeResult, { found: true }>>());
  const [cameraReady, setCameraReady] = useState(false);
  const [locationsFailed, setLocationsFailed] = useState(false);
  const [locationsAttempt, setLocationsAttempt] = useState(0);
  const submittingRef = useRef(false);
  // Carrito bloqueado: "uncertain" = no sabemos si la venta se registró; "conflict" = el id ya era otra venta.
  const [lock, setLockState] = useState<"uncertain" | "conflict" | null>(null);
  const lockRef = useRef<"uncertain" | "conflict" | null>(null);
  const [confirmingNew, setConfirmingNew] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [dismissedSummary, setDismissedSummary] = useState<SyncSummary | null>(null);
  // Usuario que hizo el cobro en línea que quedó incierto: si se guarda sin internet, la venta es suya.
  const lockUserRef = useRef<string | null>(null);
  const setLock = useCallback((v: "uncertain" | "conflict" | null) => {
    lockRef.current = v;
    setLockState(v);
  }, []);

  const online = useOnline();
  const sessionId = session?.user?.id ?? null;
  const sessionRole = session?.user?.role ?? null;
  const sessionLocation = session?.user?.locationId ?? null;
  const sessionUser = useMemo(
    () => (sessionId && sessionRole ? { id: sessionId, role: sessionRole, locationId: sessionLocation } : null),
    [sessionId, sessionRole, sessionLocation],
  );
  // next-auth no recupera una sesión que quedó en null sin red: al volver la conexión se pregunta al servidor.
  const revalidated = useRevalidatedSession({ online, status, sessionUser });
  const serverUser = sessionUser ?? revalidated.user;
  const offline = useOfflinePos({
    online,
    sessionUser: serverUser,
    locationId: serverUser?.role === "collaborator" ? (serverUser.locationId ?? "") : chosenLocation,
  });
  // Sin conexión (o mientras se confirma la sesión al volver) manda la identidad local (≤ 12 h).
  const localUser =
    offline.identity && { id: offline.identity.userId, role: offline.identity.role, locationId: offline.identity.locationId };
  const user = online ? (serverUser ?? (revalidated.pending ? localUser : null)) : localUser;
  const hasServerSession = serverUser !== null;
  const role = user?.role;
  const isCollaborator = role === "collaborator";
  const canEditPrice = role === "owner" || role === "manager";
  const locationId = offline.locationId;
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const offlineRef = useRef(offline);
  offlineRef.current = offline;
  const sync = useOfflineSync(user?.id ?? null);
  const { syncNow } = sync;

  // Almacenamiento del teléfono no disponible (modo privado, cuota): se avisa sin tumbar /pos.
  useEffect(() => onOfflineStorageError(() => setStorageFailed(true)), []);

  // Después de enviar ventas, la copia se vuelve a pedir (spec §5).
  useEffect(() => {
    if (sync.lastSummary && sync.lastSummary.sent.length > 0) offlineRef.current.refreshSnapshot();
  }, [sync.lastSummary]);

  useEffect(() => {
    if (!hasServerSession || isCollaborator) return;
    let cancelled = false;
    setLocationsFailed(false);
    fetchLocationsAction()
      .then((res) => {
        if (cancelled) return;
        if (res == null) {
          setLocationsFailed(true);
          setNotice({ kind: "error", text: SESSION_EXPIRED_TEXT, login: true });
          return;
        }
        const list = res;
        setLocations(list.map((l) => ({ id: l.id, name: l.name })));
        let saved = "";
        try {
          saved = sessionStorage.getItem(LOCATION_KEY) ?? "";
        } catch {
          /* sin storage */
        }
        const pick = list.find((l) => l.id === saved) ?? list[0];
        if (pick) setChosenLocation(pick.id);
      })
      .catch(() => {
        if (cancelled) return;
        setLocationsFailed(true);
        setNotice({ kind: "error", text: "No pudimos cargar las tiendas. Revisa tu conexión." });
      });
    return () => {
      cancelled = true;
    };
  }, [hasServerSession, isCollaborator, locationsAttempt]);

  const chooseLocation = (id: string) => {
    setChosenLocation(id);
    try {
      sessionStorage.setItem(LOCATION_KEY, id);
    } catch {
      /* sin storage */
    }
  };

  const { add, quantityOf, clearAvailability } = draft;
  const locationRef = useRef(locationId);
  locationRef.current = locationId;

  const syncPending = () =>
    setPendingScans(Array.from(pendingRef.current, ([c, p]) => ({ code: c, status: p.status, extra: p.extra, reason: p.reason })));

  const setPending = useCallback(
    (code: string, status: "loading" | "error" | "queued" | "rejected" | null, reason?: string) => {
      if (status) {
        const prev = pendingRef.current.get(code);
        // Las piezas extra sobreviven a loading -> queued -> error -> reintento; solo descartar la fila las quita.
        // Una fila rechazada ya cerró su lectura: releer el código empieza de cero.
        const extra = prev && prev.status !== "rejected" ? prev.extra : 0;
        pendingRef.current.set(code, { status, extra, ...(status === "rejected" ? { reason } : {}) });
      } else pendingRef.current.delete(code);
      syncPending();
    },
    [],
  );

  // Otra tienda: las existencias conocidas y las lecturas en espera ya no aplican.
  useEffect(() => {
    clearAvailability();
    for (const code of heldRef.current.keys()) setPending(code, null);
    heldRef.current.clear();
    // Los rechazos de la otra tienda tampoco aplican aquí.
    for (const [code, p] of Array.from(pendingRef.current)) if (p.status === "rejected") pendingRef.current.delete(code);
    syncPending();
  }, [locationId, clearAvailability, setPending]);

  /** Agrega `pieces` piezas de la prenda al carrito (cada una valida existencias) y devuelve el resultado sin pintar el aviso. */
  const applyFound = useCallback(
    (result: Extract<LookupCodeResult, { found: true }>, pieces = 1): ApplyOutcome => {
      const variant = result.product.variants.find((v) => v.id === result.variantId);
      if (!variant) return { added: 0, rejected: null, ok: "" };
      let added = 0;
      let rejected: string | null = null;
      let shortReason: string | undefined;
      for (let i = 0; i < pieces; i++) {
        const r = add({ product: result.product, variant }, result.stock);
        if (r.ok) added += 1;
        else {
          rejected = `Sin existencias de la talla ${r.size} en esta tienda`;
          shortReason = `${pieces - added} sin existencias de la talla ${r.size} en esta tienda`;
        }
      }
      return {
        added,
        rejected,
        shortReason,
        title: result.product.title,
        ok: added ? `Agregado: ${result.product.title} (${variant.size}) · ×${quantityOf(variant.id)}` : "",
      };
    },
    [add, quantityOf],
  );

  /** Un solo aviso para uno o varios resultados: ningún rechazo queda tapado por un "Agregado". */
  const noticeFor = useCallback((outcomes: ApplyOutcome[], detailed: boolean): Notice | null => {
    const rejections = outcomes.filter((o) => o.rejected);
    const added = outcomes.reduce((n, o) => n + o.added, 0);
    if (rejections.length === 0) {
      const last = [...outcomes].reverse().find((o) => o.ok);
      return last ? { kind: "ok", text: last.ok } : null;
    }
    if (!detailed && outcomes.length === 1 && added === 0) return { kind: "error", text: rejections[0].rejected! };
    const lost = rejections.map((o) => `${o.rejected}: ${o.title}.`).join(" ");
    const gained = added ? ` ${added === 1 ? "Se agregó 1 prenda." : `Se agregaron ${added} prendas.`}` : "";
    return { kind: "error", text: `${lost}${gained}` };
  }, []);

  /** Talla elegida en "Sin código": entra al carrito igual que una lectura, con su existencia conocida. */
  const addFromSearch = useCallback(
    (match: VariantMatch, stock: { available: number; sold: boolean }) => {
      if (submittingRef.current || lockRef.current) {
        // Igual que una lectura: la talla espera y entra al carrito de la siguiente venta cuando el cobro termine.
        const key = match.variant.sku;
        const pending = pendingRef.current.get(key);
        if (pending && (pending.status === "loading" || pending.status === "queued")) {
          pending.extra += 1;
          syncPending();
        } else {
          heldRef.current.set(key, { found: true, product: match.product, variantId: match.variant.id, stock });
          setPending(key, "queued");
        }
        setNotice({ kind: "error", text: "Hay un cobro en curso: la talla queda en espera y entra a la siguiente venta." });
        return;
      }
      lastOutcomeRef.current = null;
      setNotice(
        noticeFor([applyFound({ found: true, product: match.product, variantId: match.variant.id, stock })], false),
      );
    },
    [applyFound, noticeFor, setPending],
  );

  /** Aviso de algo que llegó solo (consulta que terminó): no pisa el del cobro, se le agrega. */
  const notify = useCallback((n: Notice) => {
    const base = lastOutcomeRef.current;
    if (!base) {
      setNotice(n);
      return;
    }
    // Se acumula: dos consultas tardías no se pisan entre sí.
    const next = combineNotices(base, n);
    lastOutcomeRef.current = next;
    setNotice(next);
  }, []);

  /** Aplica al carrito las lecturas que esperaban. Solo si ya no hay cobro en curso ni incierto. */
  const flushHeld = useCallback((): Notice | null => {
    if (submittingRef.current || lockRef.current) return null;
    const items = Array.from(heldRef.current.entries());
    heldRef.current.clear();
    const outcomes: ApplyOutcome[] = [];
    for (const [code, result] of items) {
      const pieces = 1 + (pendingRef.current.get(code)?.extra ?? 0);
      setPending(code, null);
      const outcome = applyFound(result, pieces);
      outcomes.push(outcome);
      // Nada entró al carrito: el motivo queda en una fila que no se tapa con el siguiente aviso.
      if (outcome.rejected) setPending(code, "rejected", outcome.added === 0 ? outcome.rejected : outcome.shortReason);
    }
    return noticeFor(outcomes, true);
  }, [applyFound, noticeFor, setPending]);

  /** Resultado encontrado (del servidor o de la copia local): entra al carrito o espera al cobro en curso. */
  const takeFound = useCallback(
    (code: string, result: Extract<LookupCodeResult, { found: true }>) => {
      const variant = result.product.variants.find((v) => v.id === result.variantId);
      if (!variant) {
        setPending(code, "rejected", NOT_FOUND_REASON);
        notify({ kind: "error", text: `No encontramos el código ${code}. Revisa que esté dado de alta.` });
      } else if (submittingRef.current || lockRef.current) {
        // Con un cobro en curso (o con resultado incierto) el carrito no se toca: espera.
        heldRef.current.set(code, result);
        setPending(code, "queued");
      } else {
        const pieces = 1 + (pendingRef.current.get(code)?.extra ?? 0);
        setPending(code, null);
        const outcome = applyFound(result, pieces);
        const next = noticeFor([outcome], pieces > 1);
        if (next) notify(next);
        if (outcome.rejected) setPending(code, "rejected", outcome.added === 0 ? outcome.rejected : outcome.shortReason);
      }
    },
    [applyFound, noticeFor, notify, setPending],
  );

  /**
   * Busca en la copia local de la tienda (spec §5). Devuelve false si no hay
   * copia vigente y hay conexión: la página sigue con el aviso de red de siempre.
   */
  const lookupLocal = useCallback(
    async (code: string, store: string): Promise<boolean> => {
      const { snapshot, canSellOffline, blockReason } = offlineRef.current;
      if (!canSellOffline || !snapshot || snapshot.locationId !== store) {
        if (onlineRef.current) return false;
        const text = blockReason === "too_large" ? OFFLINE_SNAPSHOT_TOO_LARGE_TEXT : OFFLINE_SNAPSHOT_BLOCKED_TEXT;
        setPending(code, "rejected", text);
        notify({ kind: "error", text });
        return true;
      }
      const queue = await listQueue();
      if (store !== locationRef.current) {
        setPending(code, null);
        return true;
      }
      const hit = lookupOffline(code, snapshot, queue);
      if (!hit.found) {
        setPending(code, "rejected", OFFLINE_NOT_FOUND_TEXT);
        notify({ kind: "error", text: OFFLINE_NOT_FOUND_TEXT });
        return true;
      }
      const { product, variant } = toDraftMatch(hit.variant);
      takeFound(code, { found: true, product, variantId: variant.id, stock: { available: hit.available, sold: false } });
      return true;
    },
    [notify, setPending, takeFound],
  );

  const runLookup = useCallback(
    async (code: string, store: string) => {
      setPending(code, "loading");
      if (!onlineRef.current) {
        await lookupLocal(code, store);
        return;
      }
      try {
        const result = await lookupCodeAction(code, store);
        // Cambió la tienda mientras llegaba la consulta: su resultado ya no corresponde.
        if (store !== locationRef.current) {
          setPending(code, null);
          return;
        }
        if (!result) {
          setPending(code, null);
          notify({ kind: "error", text: SESSION_EXPIRED_TEXT, login: true });
        } else if (result.found) {
          takeFound(code, result);
        } else if (result.error) {
          // Falla de la consulta: la fila queda para reintentar, sin perder ni duplicar la lectura.
          setPending(code, "error");
          notify({ kind: "error", text: result.error, login: result.error === SESSION_EXPIRED_TEXT });
        } else {
          setPending(code, "rejected", NOT_FOUND_REASON);
          notify({ kind: "error", text: `No encontramos el código ${code}. Revisa que esté dado de alta.` });
        }
      } catch {
        if (store !== locationRef.current) {
          setPending(code, null);
          return;
        }
        // Falla de red con conexión aparente (wifi sin salida): la copia local responde si está vigente.
        if (await lookupLocal(code, store)) return;
        setPending(code, "error");
        notify({ kind: "error", text: "No se pudo buscar el código. Revisa tu conexión e intenta de nuevo." });
      }
    },
    [lookupLocal, notify, setPending, takeFound],
  );

  const handleScan = useCallback(
    (raw: string) => {
      const code = normalizeCode(raw);
      if (!code) return;
      if (!locationId) {
        setNotice({ kind: "error", text: "Elige la tienda de la venta." });
        return;
      }
      // Mientras haya una consulta en curso de este código no se abre otra. Si quedó en error, releer es reintentar.
      const state = pendingRef.current.get(code);
      if (state && (state.status === "loading" || state.status === "queued")) {
        // Otra pieza idéntica: queda en espera junto a la primera y se suma al llegar.
        state.extra += 1;
        syncPending();
        lastOutcomeRef.current = null;
        setNotice({ kind: "ok", text: `Otra pieza de ${code} en espera (×${1 + state.extra}).` });
        return;
      }
      lastOutcomeRef.current = null;
      setNotice(null);
      void runLookup(code, locationId);
    },
    [locationId, runLookup],
  );

  /** Quita las filas de lecturas fallidas: no deben pasar a la venta siguiente. */
  const clearErrorRows = useCallback(() => {
    for (const [code, p] of Array.from(pendingRef.current)) if (p.status === "error" || p.status === "rejected") pendingRef.current.delete(code);
    syncPending();
  }, []);

  const discardScan = useCallback(
    (code: string) => {
      const st = pendingRef.current.get(code)?.status;
      if (st === "error" || st === "rejected") setPending(code, null);
    },
    [setPending],
  );

  const retryScan = useCallback(
    (code: string) => {
      if (!locationId || pendingRef.current.get(code)?.status === "loading") return;
      lastOutcomeRef.current = null;
      setNotice(null);
      void runLookup(code, locationId);
    },
    [locationId, runLookup],
  );

  const signature = lines.map((l) => `${l.variantId}:${l.quantity}`).join(",");
  const activeStockError = stockError && stockError.signature === signature ? stockError : null;
  // El mensaje va junto a la prenda que no alcanzó; si no se sabe cuál, junto a la única línea o arriba.
  const stockLineId =
    activeStockError?.variantId && lines.some((l) => l.variantId === activeStockError.variantId)
      ? activeStockError.variantId
      : lines.length === 1
        ? lines[0].variantId
        : null;
  const lineErrors: Record<string, string> =
    activeStockError && stockLineId ? { [stockLineId]: activeStockError.message } : {};
  // Lo que el servidor compara en un reintento: tienda, canal, método y renglones (precio en centavos).
  const requestSignature = [
    locationId,
    channel,
    method,
    ...[...lines]
      .sort((a, b) => (a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0))
      .map((l) => `${l.variantId}:${l.quantity}:${Math.round(l.unitPrice * 100)}`),
  ].join("|");

  /** Lecturas que fallaron durante el cobro: no pasan a la venta siguiente, se avisan. */
  const lostCodesText = () => {
    const failedCodes = Array.from(pendingRef.current)
      .filter(([, p]) => p.status === "error" || p.status === "rejected")
      .map(([c, p]) => (p.status === "rejected" ? `${c} (${p.reason})` : p.extra ? `${c} (×${1 + p.extra})` : c));
    return failedCodes.length
      ? ` No se agregaron: ${failedCodes.join(", ")}. Escanéalos de nuevo si van en otra venta.`
      : "";
  };

  /** La venta quedó registrada (en el servidor o en la cola): el carrito empieza de cero. */
  const finishSale = () => {
    setAlias("");
    setLock(null);
    lockUserRef.current = null;
    clearErrorRows();
    draft.reset();
  };

  /**
   * Guarda el carrito en la cola sin internet con `clientRequestId` (spec §6).
   * Valida con `validateNewSale`, vuelve a revisar el stock local con la cola y
   * usa la copia del cajero actual (su `snapshotToken`). Si `enqueueSale`
   * rechaza, la venta NO quedó guardada.
   */
  const queueSale = async (
    clientRequestId: string,
    sellerId: string,
  ): Promise<{ ok: true; folio: string } | { ok: false; text: string }> => {
    const { snapshot, canSellOffline, blockReason } = offlineRef.current;
    if (!canSellOffline || !snapshot || snapshot.locationId !== locationId) {
      return { ok: false, text: blockReason === "too_large" ? OFFLINE_SNAPSHOT_TOO_LARGE_TEXT : OFFLINE_SNAPSHOT_BLOCKED_TEXT };
    }
    const trimmedAlias = alias.trim();
    const checked = validateNewSale({
      clientRequestId,
      locationId,
      channel,
      paymentMethod: method,
      ...(channel === "whatsapp" && method === "spay_transfer" && trimmedAlias ? { customerAlias: trimmedAlias } : {}),
      lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })),
    });
    if (!checked.ok) return { ok: false, text: checked.message };
    const sale = checked.value;
    const queue = await listQueue();
    for (const l of lines) {
      if (localAvailable(snapshot, queue, l.variantId) < l.quantity) {
        return {
          ok: false,
          text: `No alcanzan las piezas de ${l.productTitle} (${l.variantTitle}) en la copia de esta tienda. Revisa las cantidades.`,
        };
      }
    }
    try {
      await enqueueSale({
        clientRequestId: sale.clientRequestId,
        userId: sellerId,
        locationId: sale.locationId,
        channel: sale.channel,
        paymentMethod: sale.paymentMethod,
        ...(sale.customerAlias !== undefined ? { customerAlias: sale.customerAlias } : {}),
        lines: lines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          sku: l.sku,
          productTitle: l.productTitle,
          variantTitle: l.variantTitle,
        })),
        total: saleTotal(sale.lines),
        soldAt: new Date().toISOString(),
        snapshotAt: snapshot.generatedAt,
        snapshotToken: snapshot.snapshotToken,
      });
    } catch (err) {
      const duplicate = err instanceof OfflineStorageError && err.code === "duplicate";
      return { ok: false, text: duplicate ? OFFLINE_DUPLICATE_TEXT : OFFLINE_SAVE_FAILED_TEXT };
    }
    return { ok: true, folio: localFolio(clientRequestId) };
  };

  const savedOfflineNotice = (folio: string): Notice => ({
    kind: "ok",
    text: `Venta guardada sin internet (${folio}). Se enviará sola.${lostCodesText()}`,
  });

  /** Después de cobrar o encolar: las lecturas en espera entran y el aviso del cobro queda primero. */
  const afterCharge = (outcome: Notice | null) => {
    submittingRef.current = false;
    setSubmitting(false);
    // Éxito o rechazo definitivo: las lecturas en espera entran al carrito vigente. Si quedó incierto, siguen esperando.
    // El aviso del cobro va primero y no se pisa con el de las lecturas en espera.
    const flushed = flushHeld();
    const shown = outcome && flushed ? combineNotices(outcome, flushed) : (outcome ?? flushed);
    if (flushed && shown) setNotice(shown);
    // Lo que llegue después (una consulta que seguía en curso) se agrega a este aviso.
    lastOutcomeRef.current = shown;
  };

  const charge = async () => {
    if (submittingRef.current || lines.length === 0) return;
    if (!locationId) {
      setNotice({ kind: "error", text: "Elige la tienda de la venta." });
      return;
    }
    const chargeUserId = user?.id ?? null;
    if (!chargeUserId) return;
    submittingRef.current = true;
    setSubmitting(true);
    lastOutcomeRef.current = null;
    setNotice(null);
    let outcome: Notice | null = null;
    const say = (n: Notice) => {
      outcome = n;
      setNotice(n);
    };
    setStockError(null);
    const clientRequestId = draft.requestIdFor(requestSignature);
    // Un cobro en línea incierto que se reintenta sin red sigue siendo de quien lo cobró.
    const sellerId = (lockRef.current === "uncertain" && lockUserRef.current) || chargeUserId;
    const lockUncertain = () => {
      if (lockRef.current !== "uncertain") lockUserRef.current = chargeUserId;
      draft.markUncertain();
      setLock("uncertain");
    };
    try {
      if (!onlineRef.current) {
        // Sin conexión: la venta se guarda en este teléfono y se envía sola (spec §6).
        const saved = await queueSale(clientRequestId, sellerId);
        if (saved.ok) {
          say(savedOfflineNotice(saved.folio));
          finishSale();
        } else {
          say({ kind: "error", text: saved.text });
        }
        return;
      }
      const trimmedAlias = alias.trim();
      const result = await createSaleAction({
        clientRequestId,
        locationId,
        channel,
        paymentMethod: method,
        ...(channel === "whatsapp" && method === "spay_transfer" && trimmedAlias
          ? { customerAlias: trimmedAlias }
          : {}),
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })),
      });
      if (!result) {
        // Con la sesión vencida el middleware redirige y Next resuelve la acción con undefined.
        say({ kind: "error", text: SESSION_EXPIRED_TEXT, login: true });
      } else if (result.ok) {
        const lost = lostCodesText();
        say({
          kind: "ok",
          text:
            result.sale.status === "pending_payment"
              ? `Venta #${result.sale.number} registrada. Pago por confirmar.${lost}`
              : lost
                ? `Venta #${result.sale.number} registrada.${lost}`
                : `Venta #${result.sale.number} registrada`,
        });
        finishSale();
        // Hay red y sesión: buen momento para enviar lo que quedó en la cola.
        syncNow();
      } else if (result.code === "PRICE_CHANGED" && result.lines?.length) {
        // El precio cambió con el carrito abierto: se cobra al vigente. El carrito cambió, así que es otro cobro.
        const notes: string[] = [];
        for (const l of result.lines) {
          draft.setPrice(l.variantId, l.price);
          const title = lines.find((x) => x.variantId === l.variantId)?.productTitle ?? "la prenda";
          notes.push(`El precio de ${title} cambió a ${formatPrice(l.price)}.`);
        }
        // Si el intento anterior quedó incierto (red o timeout), quizá ya se registró: se conserva el id.
        // El reintento con el mismo id termina en replay en cuanto ese cobro confirma. Solo una
        // respuesta definitiva permite renovarlo.
        if (!draft.isUncertain()) draft.renewRequestId();
        say({ kind: "error", text: `${notes.join(" ")} Revisa el total y cobra de nuevo.` });
      } else if (result.reason === "request_conflict") {
        // Ese identificador ya es otra venta: el siguiente Cobrar registra una nueva con este carrito.
        draft.renewRequestId();
        // El carrito queda bloqueado: un Cobrar simple no debe volver a cobrar las líneas originales.
        setLock("conflict");
        say({ kind: "error", text: result.message });
      } else if (result.reason === "session_expired") {
        say({ kind: "error", text: result.message, login: true });
      } else if (result.code === "UNAVAILABLE") {
        // Resultado incierto (el servidor respondió y deshizo): se reintenta con el mismo identificador.
        lockUncertain();
        say({ kind: "error", text: result.message });
      } else {
        draft.markRejected(requestSignature);
        if (result.code === "NO_STOCK") {
          setStockError({ message: result.message, signature, variantId: result.variantId });
          // Se registra como resultado (sin pintarlo: ya va junto a la línea) para que, si la cola cambia
          // las líneas, el motivo del rechazo siga en el aviso.
          outcome = { kind: "error", text: result.message };
        } else {
          say({ kind: "error", text: result.message });
        }
      }
    } catch {
      draft.markUncertain();
      // Falla de red y el teléfono dice que no hay conexión: es una venta sin internet con el mismo id
      // (spec §11). Si la petición sí llegó, el envío posterior hace replay.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        const saved = await queueSale(clientRequestId, sellerId);
        if (saved.ok) {
          say(savedOfflineNotice(saved.folio));
          finishSale();
          return;
        }
        lockUncertain();
        say({
          kind: "error",
          text: `No se pudo registrar la venta. ${saved.text}`,
        });
        return;
      }
      lockUncertain();
      say({
        kind: "error",
        text: "No se pudo registrar la venta. Revisa tu conexión y vuelve a pulsar Cobrar: no se duplicará.",
      });
    } finally {
      afterCharge(outcome);
    }
  };

  /** "Guardar sin internet" del bloqueo incierto: encola el carrito bloqueado con su mismo id (spec §11). */
  const saveLockedOffline = async () => {
    if (submittingRef.current || lockRef.current !== "uncertain" || lines.length === 0) return;
    const sellerId = lockUserRef.current ?? user?.id ?? null;
    if (!sellerId) return;
    submittingRef.current = true;
    setSubmitting(true);
    lastOutcomeRef.current = null;
    setNotice(null);
    let outcome: Notice | null = null;
    try {
      const saved = await queueSale(draft.requestIdFor(requestSignature), sellerId);
      if (saved.ok) {
        outcome = savedOfflineNotice(saved.folio);
        finishSale();
      } else {
        outcome = { kind: "error", text: saved.text };
      }
      setNotice(outcome);
    } finally {
      afterCharge(outcome);
    }
  };

  const startNewSale = () => {
    setConfirmingNew(false);
    setLock(null);
    lockUserRef.current = null;
    clearErrorRows();
    setStockError(null);
    setAlias("");
    draft.reset();
    lastOutcomeRef.current = null;
    const flushed = flushHeld();
    setNotice(flushed);
  };

  if (online ? status === "loading" || (!user && revalidated.checking) : !offline.identityChecked) {
    return <StaffLoadState state="loading" retry={() => {}} />;
  }
  if (!user && !online) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center gap-3 p-6 text-center">
        <p role="alert" className="text-base font-semibold text-tinta">
          {OFFLINE_IDENTITY_EXPIRED_TEXT}
        </p>
      </main>
    );
  }
  if (!user) {
    return <StaffLoadState state="session" retry={() => {}} />;
  }
  if (isCollaborator && !user.locationId) {
    return (
      <main className="p-4 text-center">
        Tu usuario no tiene una tienda asignada. Pide al dueño que te la asigne.
      </main>
    );
  }

  const queueCount = sync.pendingCount + sync.otherUserCount;
  const attentionCount = sync.needsAttention.length;
  // Contador de la cola: "N por enviar" (sin red va en la banda) y las que necesitan atención.
  const queueLabel =
    [
      online && queueCount > 0 ? `${queueCount} por enviar` : "",
      attentionCount > 0 ? `${attentionCount} ${plural(attentionCount, "necesita", "necesitan")} atención` : "",
    ]
      .filter(Boolean)
      .join(" · ") || (sync.items.length > 0 && (online || queueCount === 0) ? "Ventas sin internet" : "");
  const syncNotice =
    sync.lastSummary && sync.lastSummary !== dismissedSummary
      ? syncNoticeFor(sync.lastSummary, sync.pendingCount, online)
      : null;
  const canDiscard = role === "owner" || role === "manager";
  const discardSale = async (id: string) => {
    const ok = await discardQueued(id);
    await sync.refresh();
    return ok;
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-tinta">Nueva venta</h1>
        {queueLabel && (
          <button
            type="button"
            onClick={() => setQueueOpen((open) => !open)}
            aria-expanded={queueOpen}
            className={`inline-flex min-h-[44px] items-center rounded-lg border px-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-turquesa-texto ${
              attentionCount > 0 ? "border-agotado bg-white text-agotado" : "border-borde-control bg-niebla text-tinta"
            }`}
          >
            {queueLabel}
          </button>
        )}
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold text-turquesa-texto underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-turquesa-texto"
        >
          Volver al inicio
        </Link>
      </header>

<div aria-live="polite" className="sticky top-[calc(0.5rem+var(--safe-top))] z-30 space-y-2">
            {!online && (
              <OfflineBanner
                snapshotAgeMs={offline.snapshotAgeMs}
                pendingCount={queueCount}
                onOpenQueue={() => setQueueOpen(true)}
              />
            )}
            {!online && storageFailed && (
              <p role="alert" className="rounded-lg border border-agotado bg-white p-3 text-sm font-semibold text-agotado shadow-sm">
                {OFFLINE_STORAGE_TEXT}
              </p>
            )}
            {syncNotice && (
              <div className="flex items-start justify-between gap-2 rounded-lg bg-white shadow-sm">
                <p
                  role={syncNotice.kind === "error" ? "alert" : "status"}
                  className={`flex-1 rounded-lg p-3 text-sm font-semibold ${
                    syncNotice.kind === "error" ? "border border-agotado text-agotado" : "bg-niebla text-tinta"
                  }`}
                >
                  {syncNotice.text}
                  {syncNotice.login && (
                    <>
                      {" "}
                      <LoginLink />
                    </>
                  )}
                </p>
                <Button variant="outline" onClick={() => setDismissedSummary(sync.lastSummary)} aria-label="Cerrar aviso de envío">
                  Cerrar
                </Button>
              </div>
            )}
            {!online && offline.blockReason && offline.snapshotChecked && (
              <p role="alert" className="rounded-lg border border-agotado bg-white p-3 text-sm font-semibold text-agotado shadow-sm">
                {offline.blockReason === "too_large" ? OFFLINE_SNAPSHOT_TOO_LARGE_TEXT : OFFLINE_SNAPSHOT_BLOCKED_TEXT}
              </p>
            )}
            {notice && (
              <p
                role={notice.kind === "error" ? "alert" : "status"}
                className={`rounded-lg p-3 text-sm font-semibold shadow-sm ${
                  notice.kind === "error" ? "border border-agotado bg-white text-agotado" : "bg-niebla text-tinta"
                }`}
              >
                {notice.text}
                {notice.login && (
                  <>
                    {" "}
                    <LoginLink />
                  </>
                )}
              </p>
            )}
          </div>

      {queueOpen && (
        <OfflineQueueSheet
          items={sync.items}
          canDiscard={canDiscard}
          onDiscard={discardSale}
          onSyncNow={syncNow}
          onClose={() => setQueueOpen(false)}
          syncing={sync.syncing}
        />
      )}

      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start">
        <section aria-label="Agregar prendas" className="space-y-4 rounded-2xl border border-borde-control/40 bg-white p-4">
          {!isCollaborator && (
            <div>
              <label htmlFor="tienda" className="block text-sm font-semibold text-tinta">
                Tienda
              </label>
              <select
                id="tienda"
                value={locationId}
                disabled={lock !== null || submitting || !online}
                onChange={(e) => chooseLocation(e.target.value)}
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-borde-control bg-white px-3 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-turquesa-texto"
              >
                {!online && locationId && !locations.some((l) => l.id === locationId) ? (
                  // Sin conexión no hay lista de tiendas: queda fija la de la copia.
                  <option value={locationId}>Tienda guardada en este teléfono</option>
                ) : (
                  locations.length === 0 && (
                    <option value="">{locationsFailed ? "No se cargaron las tiendas" : "Cargando tiendas…"}</option>
                  )
                )}
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              {locationsFailed && (
                <Button variant="outline" onClick={() => setLocationsAttempt((n) => n + 1)} className="mt-2">
                  Reintentar
                </Button>
              )}
            </div>
          )}
          <Scanner
            continuous
            onScan={handleScan}
            validate={isValidGtin}
            autoStart={cameraReady}
            onStarted={() => setCameraReady(true)}
          />
          <ManualCodeEntry
            onSubmit={handleScan}
            onNoBarcode={() => setSearchOpen((open) => !open)}
            noBarcodeLabel="Sin código"
            noBarcodeDisabled={lock !== null || submitting || !locationId}
          />
          {!locationId && (
            <p className="text-sm text-tinta">Elige la tienda de la venta.</p>
          )}
          {searchOpen && locationId && (
            <SaleProductSearch
              locationId={locationId}
              disabled={lock !== null || submitting}
              onAdd={addFromSearch}
              offline={
                online
                  ? undefined
                  : {
                      snapshot: offline.canSellOffline && offline.snapshot?.locationId === locationId ? offline.snapshot : null,
                      blockedText:
                        offline.blockReason === "too_large" ? OFFLINE_SNAPSHOT_TOO_LARGE_TEXT : OFFLINE_SNAPSHOT_BLOCKED_TEXT,
                    }
              }
            />
          )}
        </section>

        <section aria-label="Venta" className="space-y-4">
          {activeStockError && !stockLineId && (
            <p role="alert" className="rounded-lg border border-agotado bg-white p-3 text-sm font-semibold text-agotado">
              {activeStockError.message} Revisa las cantidades de la venta.
            </p>
          )}

          {lock && (
            <div role="alert" className="space-y-3 rounded-2xl border-2 border-agotado bg-white p-4 text-agotado">
              <p className="text-sm font-semibold">
                {lock === "uncertain"
                  ? "No sabemos si la venta se registró. Reintenta el cobro o verifica en Ventas."
                  : "Esta venta quedó bloqueada: verifica en Ventas antes de empezar otra."}
              </p>
              {lock === "uncertain" && !confirmingNew && (
                <div className="space-y-1">
                  <Button variant="outline" disabled={submitting} onClick={() => void saveLockedOffline()}>
                    Guardar sin internet
                  </Button>
                  <p className="text-sm">Se guarda en este teléfono con el mismo cobro y se envía sola: no se duplica.</p>
                </div>
              )}
              {confirmingNew ? (
                <div className="space-y-3">
                  <p className="text-sm">Si la venta sí se registró, no la vuelvas a cobrar.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={submitting} onClick={startNewSale}>Sí, empezar otra venta</Button>
                    <Button variant="outline" onClick={() => setConfirmingNew(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" disabled={submitting} onClick={() => setConfirmingNew(true)}>
                  Ya revisé en Ventas: empezar otra venta
                </Button>
              )}
            </div>
          )}

          <SaleCart
            lines={lines}
            canEditPrice={canEditPrice}
            lineErrors={lineErrors}
            onSetQty={draft.setQty}
            onSetPrice={draft.setPrice}
            onRemove={draft.remove}
            locked={lock !== null || submitting}
            pendingScans={pendingScans}
            onRetry={retryScan}
            onDiscard={discardScan}
          />

          <div className="rounded-2xl border border-borde-control/40 bg-white p-4">
            <PaymentPicker
              channel={channel}
              method={method}
              alias={alias}
              onChannel={setChannel}
              onMethod={setMethod}
              onAlias={setAlias}
              disabled={lock !== null || submitting}
            />
          </div>

          <div className="sticky bottom-0 -mx-4 border-t border-borde-control/40 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
            {lock === "uncertain" ? (
              <Button onClick={() => void charge()} loading={submitting} className="min-h-[52px] w-full text-lg">
                {submitting ? "Cobrando…" : "Reintentar cobro"}
              </Button>
            ) : lock === "conflict" ? null : (
              <Button
                onClick={() => void charge()}
                disabled={lines.length === 0 || pendingScans.some((p) => p.status === "loading" || p.status === "error")}
                loading={submitting}
                aria-describedby={lines.length === 0 ? "cobrar-ayuda" : undefined}
                className="min-h-[52px] w-full text-lg"
              >
                {submitting ? "Cobrando…" : lines.length ? `Cobrar ${formatPrice(saleTotal(lines))}` : "Cobrar"}
              </Button>
            )}
            {lines.length === 0 && !lock && (
              <p id="cobrar-ayuda" className="mt-2 text-center text-sm text-tinta">
                Agrega al menos una prenda para cobrar.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { saleTotal } from "@/lib/domain/sale";
import { StaffLoadState } from "@/components/layout/StaffLoadState";
import { LoginLink, SESSION_EXPIRED_TEXT } from "@/components/sales/session-expired";

type LocationOption = { id: string; name: string };
type Notice = { kind: "ok" | "error"; text: string; login?: boolean };
type ApplyOutcome = { added: number; rejected: string | null; ok: string; title?: string };
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
  const setLock = useCallback((v: "uncertain" | "conflict" | null) => {
    lockRef.current = v;
    setLockState(v);
  }, []);

  const role = session?.user?.role;
  const isCollaborator = role === "collaborator";
  const canEditPrice = role === "owner" || role === "manager";
  const locationId = isCollaborator ? (session?.user?.locationId ?? "") : chosenLocation;

  useEffect(() => {
    if (status !== "authenticated" || isCollaborator) return;
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
  }, [status, isCollaborator, locationsAttempt]);

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
      for (let i = 0; i < pieces; i++) {
        const r = add({ product: result.product, variant }, result.stock);
        if (r.ok) added += 1;
        else rejected = `Sin existencias de la talla ${r.size} en esta tienda`;
      }
      return {
        added,
        rejected,
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
        setNotice({ kind: "error", text: "Hay un cobro en curso: espera a que termine para agregar prendas." });
        return;
      }
      lastOutcomeRef.current = null;
      setNotice(
        noticeFor([applyFound({ found: true, product: match.product, variantId: match.variant.id, stock })], false),
      );
    },
    [applyFound, noticeFor],
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
      if (outcome.added === 0 && outcome.rejected) setPending(code, "rejected", outcome.rejected);
    }
    return noticeFor(outcomes, true);
  }, [applyFound, noticeFor, setPending]);

  const runLookup = useCallback(
    async (code: string, store: string) => {
      setPending(code, "loading");
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
            if (outcome.added === 0 && outcome.rejected) setPending(code, "rejected", outcome.rejected);
          }
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
        setPending(code, "error");
        notify({ kind: "error", text: "No se pudo buscar el código. Revisa tu conexión e intenta de nuevo." });
      }
    },
    [applyFound, noticeFor, notify, setPending],
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

  const charge = async () => {
    if (submittingRef.current || lines.length === 0) return;
    if (!locationId) {
      setNotice({ kind: "error", text: "Elige la tienda de la venta." });
      return;
    }
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
    try {
      const trimmedAlias = alias.trim();
      const result = await createSaleAction({
        clientRequestId: draft.requestIdFor(requestSignature),
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
        // Las lecturas que fallaron durante el cobro no pasan a la venta siguiente: se avisan, no se borran en silencio.
        const failedCodes = Array.from(pendingRef.current)
          .filter(([, p]) => p.status === "error" || p.status === "rejected")
          .map(([c, p]) => (p.status === "rejected" ? `${c} (${p.reason})` : p.extra ? `${c} (×${1 + p.extra})` : c));
        const lost = failedCodes.length
          ? ` No se agregaron: ${failedCodes.join(", ")}. Escanéalos de nuevo si van en otra venta.`
          : "";
        say({
          kind: "ok",
          text:
            result.sale.status === "pending_payment"
              ? `Venta #${result.sale.number} registrada. Pago por confirmar.${lost}`
              : failedCodes.length
                ? `Venta #${result.sale.number} registrada.${lost}`
                : `Venta #${result.sale.number} registrada`,
        });
        setAlias("");
        setLock(null);
        clearErrorRows();
        draft.reset();
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
        // Resultado incierto: se reintenta con el mismo identificador.
        draft.markUncertain();
        setLock("uncertain");
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
      setLock("uncertain");
      say({
        kind: "error",
        text: "No se pudo registrar la venta. Revisa tu conexión y vuelve a pulsar Cobrar: no se duplicará.",
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      // Éxito o rechazo definitivo: las lecturas en espera entran al carrito vigente. Si quedó incierto, siguen esperando.
      // El aviso del cobro va primero y no se pisa con el de las lecturas en espera.
      const flushed = flushHeld();
      const first = outcome as Notice | null;
      const shown = first && flushed ? combineNotices(first, flushed) : (first ?? flushed);
      if (flushed && shown) setNotice(shown);
      // Lo que llegue después (una consulta que seguía en curso) se agrega a este aviso.
      lastOutcomeRef.current = shown;
    }
  };

  const startNewSale = () => {
    setConfirmingNew(false);
    setLock(null);
    clearErrorRows();
    setStockError(null);
    setAlias("");
    draft.reset();
    lastOutcomeRef.current = null;
    const flushed = flushHeld();
    setNotice(flushed);
  };

  if (status === "loading") {
    return <StaffLoadState state="loading" retry={() => {}} />;
  }
  if (!session?.user) {
    return <StaffLoadState state="session" retry={() => {}} />;
  }
  if (isCollaborator && !session.user.locationId) {
    return (
      <main className="p-4 text-center">
        Tu usuario no tiene una tienda asignada. Pide al dueño que te la asigne.
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-tinta">Nueva venta</h1>
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold text-turquesa-texto underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-turquesa-texto"
        >
          Volver al inicio
        </Link>
      </header>

<div aria-live="polite" className="sticky top-2 z-30 space-y-2">
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

      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start">
        <section aria-label="Agregar prendas" className="space-y-4 rounded-2xl border border-borde-control/40 bg-white p-4">
          {!isCollaborator && (
            <div>
              <label htmlFor="tienda" className="block text-sm font-semibold text-tinta">
                Tienda
              </label>
              <select
                id="tienda"
                value={chosenLocation}
                disabled={lock !== null}
                onChange={(e) => chooseLocation(e.target.value)}
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-borde-control bg-white px-3 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-turquesa-texto"
              >
                {locations.length === 0 && (
                  <option value="">{locationsFailed ? "No se cargaron las tiendas" : "Cargando tiendas…"}</option>
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

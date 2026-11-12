"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Scanner } from "@/components/inventory/Scanner";
import { ManualCodeEntry } from "@/components/inventory/ManualCodeEntry";
import { SaleCart, type PendingScan } from "@/components/sales/SaleCart";
import { Button } from "@/components/ui/Button";
import { PaymentPicker } from "@/components/sales/PaymentPicker";
import { fetchLocationsAction, lookupCodeAction } from "@/lib/actions";
import { createSaleAction } from "@/lib/sales/actions";
import { isValidGtin, normalizeCode } from "@/lib/domain/barcode";
import type { PaymentMethod, SaleChannel } from "@/lib/domain/sale";
import { useSaleDraft } from "@/lib/sales/use-sale-draft";
import { formatPrice } from "@/lib/public/format";
import { saleTotal } from "@/lib/domain/sale";
import { StaffLoadState } from "@/components/layout/StaffLoadState";
import { LoginLink, SESSION_EXPIRED_TEXT } from "@/components/sales/session-expired";

type LocationOption = { id: string; name: string };
type Notice = { kind: "ok" | "error"; text: string; login?: boolean };
type StockError = { message: string; signature: string; variantId?: string };

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
  const [pendingScans, setPendingScans] = useState<PendingScan[]>([]);
  // Códigos con consulta en curso o fallida: una segunda lectura del mismo código no crea otra fila.
  const pendingRef = useRef(new Map<string, "loading" | "error">());
  const [cameraReady, setCameraReady] = useState(false);
  const [locationsFailed, setLocationsFailed] = useState(false);
  const [locationsAttempt, setLocationsAttempt] = useState(0);
  const submittingRef = useRef(false);

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

  const { add, quantityOf } = draft;
  const setPending = useCallback((code: string, status: "loading" | "error" | null) => {
    if (status) pendingRef.current.set(code, status);
    else pendingRef.current.delete(code);
    setPendingScans(Array.from(pendingRef.current, ([c, st]) => ({ code: c, status: st })));
  }, []);

  const runLookup = useCallback(
    async (code: string, store: string) => {
      setPending(code, "loading");
      try {
        const result = await lookupCodeAction(code, store);
        if (!result) {
          setPending(code, null);
          setNotice({ kind: "error", text: SESSION_EXPIRED_TEXT, login: true });
        } else if (result.found) {
          setPending(code, null);
          const variant = result.product.variants.find((v) => v.id === result.variantId);
          if (!variant) {
            setNotice({ kind: "error", text: `No encontramos el código ${code}. Revisa que esté dado de alta.` });
            return;
          }
          const added = add({ product: result.product, variant }, result.stock);
          if (added.ok) {
            setNotice({
              kind: "ok",
              text: `Agregado: ${result.product.title} (${variant.size}) · ×${quantityOf(variant.id)}`,
            });
          } else {
            setNotice({ kind: "error", text: `Sin existencias de la talla ${added.size} en esta tienda` });
          }
        } else if (result.error) {
          // Falla de la consulta: la fila queda para reintentar, sin perder ni duplicar la lectura.
          setPending(code, "error");
          setNotice({ kind: "error", text: result.error, login: result.error === SESSION_EXPIRED_TEXT });
        } else {
          setPending(code, null);
          setNotice({ kind: "error", text: `No encontramos el código ${code}. Revisa que esté dado de alta.` });
        }
      } catch {
        setPending(code, "error");
        setNotice({ kind: "error", text: "No se pudo buscar el código. Revisa tu conexión e intenta de nuevo." });
      }
    },
    [add, quantityOf, setPending],
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
      if (pendingRef.current.get(code) === "loading") return;
      setNotice(null);
      void runLookup(code, locationId);
    },
    [locationId, runLookup],
  );

  const retryScan = useCallback(
    (code: string) => {
      if (!locationId || pendingRef.current.get(code) === "loading") return;
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
    setNotice(null);
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
        setNotice({ kind: "error", text: SESSION_EXPIRED_TEXT, login: true });
      } else if (result.ok) {
        setNotice({
          kind: "ok",
          text:
            result.sale.status === "pending_payment"
              ? `Venta #${result.sale.number} registrada. Pago por confirmar.`
              : `Venta #${result.sale.number} registrada`,
        });
        setAlias("");
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
        setNotice({ kind: "error", text: `${notes.join(" ")} Revisa el total y cobra de nuevo.` });
      } else if (result.reason === "request_conflict") {
        // Ese identificador ya es otra venta: el siguiente Cobrar registra una nueva con este carrito.
        draft.renewRequestId();
        setNotice({ kind: "error", text: result.message });
      } else if (result.reason === "session_expired") {
        setNotice({ kind: "error", text: result.message, login: true });
      } else if (result.code === "UNAVAILABLE") {
        // Resultado incierto: se reintenta con el mismo identificador.
        draft.markUncertain();
        setNotice({ kind: "error", text: result.message });
      } else {
        draft.markRejected(requestSignature);
        if (result.code === "NO_STOCK") {
          setStockError({ message: result.message, signature, variantId: result.variantId });
        } else {
          setNotice({ kind: "error", text: result.message });
        }
      }
    } catch {
      draft.markUncertain();
      setNotice({
        kind: "error",
        text: "No se pudo registrar la venta. Revisa tu conexión y vuelve a pulsar Cobrar: no se duplicará.",
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
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
        <h1 className="text-lg font-bold text-on-surface">Nueva venta</h1>
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Volver al inicio
        </Link>
      </header>

<div aria-live="polite" className="sticky top-2 z-30 space-y-2">
            {notice && (
              <p
                role={notice.kind === "error" ? "alert" : "status"}
                className={`rounded-lg p-3 text-sm font-semibold shadow-sm ${
                  notice.kind === "error" ? "bg-error-container text-on-error-container" : "bg-primary/10 text-on-primary-container"
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
        <section aria-label="Agregar prendas" className="space-y-4 rounded-2xl border border-outline-variant bg-white p-4">
          {!isCollaborator && (
            <div>
              <label htmlFor="tienda" className="block text-sm font-semibold text-on-surface">
                Tienda
              </label>
              <select
                id="tienda"
                value={chosenLocation}
                onChange={(e) => chooseLocation(e.target.value)}
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-outline bg-white px-3 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                <button
                  type="button"
                  onClick={() => setLocationsAttempt((n) => n + 1)}
                  className="mt-2 min-h-11 rounded-xl border border-outline px-4 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Reintentar
                </button>
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
          <ManualCodeEntry onSubmit={handleScan} onNoBarcode={() => setNotice({ kind: "error", text: "Una prenda sin código no se puede vender aquí: dala de alta primero en Escanear." })} />
        </section>

        <section aria-label="Venta" className="space-y-4">
          {activeStockError && !stockLineId && (
            <p role="alert" className="rounded-lg bg-error-container p-3 text-sm font-semibold text-on-error-container">
              {activeStockError.message} Revisa las cantidades de la venta.
            </p>
          )}

          <SaleCart
            lines={lines}
            canEditPrice={canEditPrice}
            lineErrors={lineErrors}
            onSetQty={draft.setQty}
            onSetPrice={draft.setPrice}
            onRemove={draft.remove}
            pendingScans={pendingScans}
            onRetry={retryScan}
          />

          <div className="rounded-2xl border border-outline-variant bg-white p-4">
            <PaymentPicker
              channel={channel}
              method={method}
              alias={alias}
              onChannel={setChannel}
              onMethod={setMethod}
              onAlias={setAlias}
            />
          </div>

          <div className="sticky bottom-0 -mx-4 border-t border-outline-variant bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
            <Button
              onClick={() => void charge()}
              disabled={lines.length === 0}
              loading={submitting}
              aria-describedby={lines.length === 0 ? "cobrar-ayuda" : undefined}
              className="min-h-[52px] w-full text-lg"
            >
              {submitting ? "Cobrando…" : lines.length ? `Cobrar ${formatPrice(saleTotal(lines))}` : "Cobrar"}
            </Button>
            {lines.length === 0 && (
              <p id="cobrar-ayuda" className="mt-2 text-center text-sm text-on-surface-variant">
                Agrega al menos una prenda para cobrar.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

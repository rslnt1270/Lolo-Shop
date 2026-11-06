"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Scanner } from "@/components/inventory/Scanner";
import { ManualCodeEntry } from "@/components/inventory/ManualCodeEntry";
import { SaleCart } from "@/components/sales/SaleCart";
import { PaymentPicker } from "@/components/sales/PaymentPicker";
import { fetchLocationsAction, lookupCodeAction } from "@/lib/actions";
import { createSaleAction } from "@/lib/sales/actions";
import { isValidGtin } from "@/lib/domain/barcode";
import type { PaymentMethod, SaleChannel } from "@/lib/domain/sale";
import { useSaleDraft } from "@/lib/sales/use-sale-draft";

type LocationOption = { id: string; name: string };
type Notice = { kind: "ok" | "error"; text: string };
type StockError = { message: string; signature: string };

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
  const [searching, setSearching] = useState(false);
  const [scannerKey, setScannerKey] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const submittingRef = useRef(false);

  const role = session?.user?.role;
  const isCollaborator = role === "collaborator";
  const canEditPrice = role === "owner" || role === "manager";
  const locationId = isCollaborator ? (session?.user?.locationId ?? "") : chosenLocation;

  useEffect(() => {
    if (status !== "authenticated" || isCollaborator) return;
    let cancelled = false;
    fetchLocationsAction()
      .then((list) => {
        if (cancelled) return;
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
        if (!cancelled) setNotice({ kind: "error", text: "No se pudieron cargar las tiendas. Recarga la página." });
      });
    return () => {
      cancelled = true;
    };
  }, [status, isCollaborator]);

  const chooseLocation = (id: string) => {
    setChosenLocation(id);
    try {
      sessionStorage.setItem(LOCATION_KEY, id);
    } catch {
      /* sin storage */
    }
  };

  const { add } = draft;
  const handleScan = useCallback(
    async (code: string) => {
      setNotice(null);
      setSearching(true);
      try {
        const result = await lookupCodeAction(code);
        if (result.found) {
          const variant = result.product.variants.find((v) => v.id === result.variantId);
          if (variant) {
            add({ product: result.product, variant });
            setNotice({ kind: "ok", text: `Agregado: ${result.product.title} (${variant.title})` });
          }
        } else {
          setNotice({
            kind: "error",
            text: result.error ?? `No encontramos el código ${result.code}. Revisa que esté dado de alta.`,
          });
        }
      } catch {
        setNotice({ kind: "error", text: "No se pudo buscar el código. Revisa tu conexión e intenta de nuevo." });
      } finally {
        setSearching(false);
        setScannerKey((k) => k + 1);
      }
    },
    [add],
  );

  const signature = lines.map((l) => `${l.variantId}:${l.quantity}`).join(",");
  const activeStockError = stockError && stockError.signature === signature ? stockError.message : null;
  const lineErrors: Record<string, string> =
    activeStockError && lines.length === 1 ? { [lines[0].variantId]: activeStockError } : {};

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
        clientRequestId: draft.clientRequestId,
        locationId,
        channel,
        paymentMethod: method,
        ...(channel === "whatsapp" && method === "spay_transfer" && trimmedAlias
          ? { customerAlias: trimmedAlias }
          : {}),
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })),
      });
      if (result.ok) {
        setNotice({ kind: "ok", text: `Venta #${result.sale.number} registrada` });
        setAlias("");
        draft.reset();
      } else if (result.code === "NO_STOCK") {
        setStockError({ message: result.message, signature });
      } else {
        setNotice({ kind: "error", text: result.message });
      }
    } catch {
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
    return <main className="p-4 text-center">Cargando...</main>;
  }
  if (!session?.user) {
    return <main className="p-4 text-center">Inicia sesión para vender.</main>;
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
        <h1 className="text-2xl font-bold text-on-surface">Nueva venta</h1>
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Volver al inicio
        </Link>
      </header>

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
                {locations.length === 0 && <option value="">Cargando tiendas…</option>}
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Scanner
            key={scannerKey}
            onScan={handleScan}
            validate={isValidGtin}
            autoStart={cameraReady}
            onStarted={() => setCameraReady(true)}
          />
          <ManualCodeEntry onSubmit={handleScan} onNoBarcode={() => setNotice({ kind: "error", text: "Una prenda sin código no se puede vender aquí: dala de alta primero en Escanear." })} />
        </section>

        <section aria-label="Venta" className="space-y-4">
          <div aria-live="polite">
            {searching && <p className="rounded-lg bg-surface-container-low p-3 text-sm">Buscando…</p>}
            {notice && !searching && (
              <p
                role={notice.kind === "error" ? "alert" : "status"}
                className={`rounded-lg p-3 text-sm font-semibold ${
                  notice.kind === "error" ? "bg-error-container text-on-error-container" : "bg-primary/10 text-on-primary-container"
                }`}
              >
                {notice.text}
              </p>
            )}
          </div>

          {activeStockError && lines.length > 1 && (
            <p role="alert" className="rounded-lg bg-error-container p-3 text-sm font-semibold text-on-error-container">
              {activeStockError} Revisa las cantidades de la venta.
            </p>
          )}

          <SaleCart
            lines={lines}
            canEditPrice={canEditPrice}
            lineErrors={lineErrors}
            onSetQty={draft.setQty}
            onSetPrice={draft.setPrice}
            onRemove={draft.remove}
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

          <div className="sticky bottom-0 -mx-4 border-t border-outline-variant bg-white/95 p-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
            <button
              type="button"
              onClick={() => void charge()}
              disabled={lines.length === 0 || submitting}
              aria-describedby={lines.length === 0 ? "cobrar-ayuda" : undefined}
              className="min-h-[52px] w-full rounded-2xl bg-primary px-4 text-lg font-bold text-on-primary hover:bg-on-primary-fixed-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:bg-outline-variant disabled:text-on-surface-variant"
            >
              {submitting ? "Cobrando…" : "Cobrar"}
            </button>
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

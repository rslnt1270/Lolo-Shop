"use client";
import { formatPrice } from "@/lib/public/format";
import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { Scanner } from "@/components/inventory/Scanner";
import { ManualCodeEntry } from "@/components/inventory/ManualCodeEntry";
import type { EntryMode } from "@/lib/domain/new-product";
import type { Product, Role } from "@/lib/domain/types";
import type { ProductSearchHit } from "@/lib/data/source";
import { NewProductForm, type CreatedInfo } from "@/components/products/NewProductForm";
import { ExistingProductSearch } from "@/components/products/ExistingProductSearch";
import { AddSizeForm } from "@/components/products/AddSizeForm";
import { SumToMyStore } from "@/components/inventory/SumToMyStore";
import { TransferStock } from "@/components/inventory/TransferStock";
import { useOnline } from "@/lib/offline/use-offline-pos";
import { sortSizes } from "@/lib/domain/sizes";
import { SavedCheck } from "@/components/products/SavedCheck";
import { lookupCodeAction, type LookupCodeResult } from "@/lib/actions";
import { useWorkLocation } from "@/lib/client/use-work-location";
import { WorkLocationPicker } from "@/components/layout/WorkLocationPicker";
import { LoginLink, SESSION_EXPIRED_TEXT } from "@/components/sales/session-expired";
import { isValidGtin } from "@/lib/domain/barcode";

type Found = Extract<LookupCodeResult, { found: true }>;
/** Tallas activas del producto (para "Agregar talla" desde la tarjeta). */
function toSearchHit(product: Product): ProductSearchHit {
  const sizes = product.variants.filter((v) => v.isActive !== false).map((v) => v.size || v.title);
  return {
    productId: product.id,
    title: product.title,
    brand: product.brand,
    publicCode: product.publicCode ?? null,
    imageUrl: product.imageUrl,
    sizes: sortSizes([...new Set(sizes)]),
  };
}

/** Piezas por talla en la tienda (suma las etiquetas de una misma talla), en orden de exhibición. */
function stockBySize(product: Product, locationId: string): { size: string; available: number }[] {
  const by = new Map<string, number>();
  for (const v of product.variants) {
    if (v.isActive === false) continue;
    const size = v.size || v.title;
    const here = v.inventory.find((l) => l.locationId === locationId)?.available ?? 0;
    by.set(size, (by.get(size) ?? 0) + here);
  }
  return sortSizes([...by.keys()]).map((size) => ({ size, available: by.get(size) ?? 0 }));
}

export default function EscanearPage() {
  const { data: session, status } = useSession();
  const [found, setFound] = useState<Found | null>(null);
  // El alta por lote recuerda el modo elegido entre un artículo y el siguiente.
  const [entryMode, setEntryMode] = useState<EntryMode>("stock");
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  // undefined = sin formulario; null = alta sin código; string = alta con código.
  const [newCode, setNewCode] = useState<string | null | undefined>(undefined);
  // Código nuevo: primero "¿Es otra talla…?" ("ask"); "new" abre el alta.
  const [altaStep, setAltaStep] = useState<"ask" | "new">("ask");
  // Producto elegido para "Agregar talla" y el código de la talla nueva.
  const [addSize, setAddSize] = useState<{ product: ProductSearchHit; code: string | null } | null>(null);
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [lastCreated, setLastCreated] = useState<CreatedInfo | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  // Todos los roles eligen en qué tienda están (la asignada solo es la sugerencia inicial).
  const work = useWorkLocation({
    assigned: session?.user?.locationId ?? null,
    enabled: status === "authenticated",
  });
  const { locations, locationId } = work;
  const online = useOnline();

  // Sube cada vez que la prenda en pantalla se descarta o cambia: una consulta tardía de antes se ignora.
  const viewSeqRef = useRef(0);
  const viewRef = useRef({ scannedCode, locationId });
  viewRef.current = { scannedCode, locationId };

  // Si cambia la tienda de trabajo con una prenda en pantalla, se descarta: sus cifras eran de la otra tienda.
  const lastLocationRef = useRef(locationId);
  useEffect(() => {
    const previous = lastLocationRef.current;
    lastLocationRef.current = locationId;
    // La primera elección (de "" a una tienda, al cargar la lista) no descarta nada.
    if (!previous || previous === locationId) return;
    viewSeqRef.current += 1;
    setScannedCode(null);
    setFound(null);
    setNewCode(undefined);
    setLookupError("");
    setAltaStep("ask");
    setAddSize(null);
  }, [locationId]);

  /** Tras un traspaso, vuelve a consultar la prenda para mostrar cifras al día (sin ocultar el mensaje). */
  const refreshFound = async () => {
    if (!scannedCode || !locationId) return;
    const seq = viewSeqRef.current;
    const code = scannedCode;
    const loc = locationId;
    try {
      const result = await lookupCodeAction(code, loc);
      // Si mientras tanto tocó "Escanear otro", escaneó otra prenda o cambió de tienda, no se restaura.
      const stale =
        seq !== viewSeqRef.current || viewRef.current.scannedCode !== code || viewRef.current.locationId !== loc;
      if (!stale && result.found) setFound(result);
    } catch {
      /* el mensaje del traspaso ya se mostró; las cifras se actualizan al volver a escanear */
    }
  };

  const reset = () => {
    viewSeqRef.current += 1;
    setScannedCode(null);
    setFound(null);
    setNewCode(undefined);
    setLookupError("");
    setAltaStep("ask");
    setAddSize(null);
  };

  const handleScan = useCallback(async (code: string) => {
    viewSeqRef.current += 1;
    setScannedCode(code);
    setMessage("");
    setIsError(false);
    setLookupError("");
    setFound(null);
    setNewCode(undefined);
    setAltaStep("ask");
    setAddSize(null);
    setSearching(true);
    try {
      const result = await (locationId ? lookupCodeAction(code, locationId) : lookupCodeAction(code));
      if (result.found) {
        setFound(result);
      } else if (result.error) {
        setLookupError(result.error);
      } else {
        setNewCode(result.code || code);
      }
    } catch (err) {
      console.error(err);
      setLookupError("No se pudo buscar el código. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setSearching(false);
    }
  }, [locationId]);

  if (status === "loading") {
    return <main className="p-4 text-center">Cargando...</main>;
  }

  if (!session?.user) {
    return <main className="p-4 text-center">Inicia sesión para escanear productos.</main>;
  }

  const variant = found?.product.variants.find((v) => v.id === found.variantId) ?? found?.product.variants[0];
  const stockHere = variant ? (variant.inventory.find((l) => l.locationId === locationId)?.available ?? 0) : null;
  const showScanner = !scannedCode && newCode === undefined;
  const sizesHere = found && locationId ? stockBySize(found.product, locationId) : [];
  // El servidor solo manda las filas de tu tienda: sin fila aquí, la prenda no está en tu tienda.
  const notInMyStore = !!variant && !!locationId && !variant.inventory.some((l) => l.locationId === locationId);
  // (notInMyStore tiene precedencia: "sold" cuenta todas las tiendas y no se revela.) Prenda ya vendida y sin piezas en esta tienda: se ofrece "Agregar nuevamente" (mismo producto).
  const soldOut = !notInMyStore && !!found?.stock?.sold && found.stock.available === 0;
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Escanear Producto</h1>
        {createdCount > 0 && (
          <span className="rounded-full bg-niebla px-3 py-1 text-sm font-semibold text-turquesa-texto">
            {createdCount} {createdCount === 1 ? "alta" : "altas"} en esta sesión
          </span>
        )}
      </div>

      <div>
        <WorkLocationPicker
          value={locationId}
          locations={locations}
          onChange={work.choose}
          disabled={work.status !== "ready"}
        />
        {work.status === "error" && (
          <div role="alert" className="mt-2 space-y-2 text-sm text-agotado">
            <p>No se pudieron cargar las tiendas.</p>
            <Button variant="outline" onClick={work.retry}>
              Reintentar
            </Button>
          </div>
        )}
        {work.status === "session" && (
          <p role="alert" className="mt-2 text-sm text-agotado">
            {SESSION_EXPIRED_TEXT} <LoginLink />
          </p>
        )}
      </div>

      {showScanner && (
        <>
          <Scanner
            onScan={handleScan}
            validate={isValidGtin}
            autoStart={cameraReady}
            onStarted={() => setCameraReady(true)}
          />
          <ManualCodeEntry onSubmit={handleScan} onNoBarcode={() => setNewCode(null)} />
        </>
      )}

      {searching && (
        <p role="status" className="rounded-xl border bg-white p-4 text-center text-sm text-gray-600">
          Buscando…
        </p>
      )}

      {lookupError && !searching && (
        <div role="alert" className="space-y-2 rounded-xl border border-agotado bg-white p-4 text-sm text-agotado">
          <p>{lookupError}</p>
          <div className="flex gap-2">
            {scannedCode && (
              <Button variant="danger" onClick={() => void handleScan(scannedCode)} className="flex-1">
                Reintentar
              </Button>
            )}
            <Button variant="outline" onClick={reset} className="flex-1">
              Escanear otro
            </Button>
          </div>
        </div>
      )}

      {addSize && !searching && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          {!locationId ? (
            <p className="text-sm text-gray-600">Elige una tienda arriba para agregar la talla.</p>
          ) : (
            <AddSizeForm
              product={addSize.product}
              scannedCode={addSize.code}
              locationId={locationId}
              onDone={(text) => {
                setIsError(false);
                setMessage(`${text} Escanea la siguiente etiqueta.`);
                reset();
              }}
              onCancel={() => {
                reset();
                setMessage("");
              }}
              onChangeProduct={newCode ? () => setAddSize(null) : undefined}
            />
          )}
        </div>
      )}

      {found && !searching && !addSize && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm text-gray-500">Código escaneado: {scannedCode}</p>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{found.product.title}</h2>
              <p className="text-sm text-gray-600">
                Talla {variant?.size || variant?.title} - {found.product.brand}
              </p>
              {variant && <p className="mt-1 font-mono text-sm">Precio: {formatPrice(Number(variant.price))}</p>}
            </div>
            {locationId ? (
              <>
                {sizesHere.length > 0 && (
                  <ul aria-label="Tallas en tu tienda" className="flex flex-wrap gap-2">
                    {sizesHere.map((s) => (
                      <li
                        key={s.size}
                        className={`rounded-full border px-3 py-1 text-sm ${
                          s.size === (variant?.size || variant?.title) ? "border-turquesa-texto font-semibold text-turquesa-texto" : "border-gray-300 text-gray-700"
                        }`}
                      >
                        {`${s.size}: ${s.available} pzas`}
                      </li>
                    ))}
                  </ul>
                )}
                {stockHere !== null && (
                  <p className="text-sm text-gray-700">
                    En esta tienda: <span className="font-semibold">{stockHere} pzas</span>
                  </p>
                )}
                {soldOut ? (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-700">Esta prenda ya se vendió. Puedes agregar piezas al mismo producto.</p>
                    <SumToMyStore
                      variantId={found.variantId}
                      locationId={locationId}
                      label="Agregar nuevamente"
                      onDone={(available) => {
                        setIsError(false);
                        setMessage(`Piezas sumadas: ${found.product.title}. Ahora hay ${available} en esta tienda.`);
                        reset();
                      }}
                    />
                  </div>
                ) : notInMyStore ? (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-700">Esta prenda no está en tu tienda</p>
                    <SumToMyStore
                      variantId={found.variantId}
                      locationId={locationId}
                      onDone={(available) => {
                        setIsError(false);
                        setMessage(`Piezas sumadas: ${found.product.title}. Ahora hay ${available} en esta tienda.`);
                        reset();
                      }}
                    />
                  </div>
                ) : (
                  <SumToMyStore
                    variantId={found.variantId}
                    locationId={locationId}
                    onDone={(available) => {
                      setIsError(false);
                      setMessage(`Piezas sumadas: ${found.product.title}. Ahora hay ${available} en esta tienda.`);
                      reset();
                    }}
                  />
                )}
                {variant && (
                  <details className="rounded-lg border border-gray-200 p-3">
                    <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-semibold text-turquesa-texto">
                      Traspasar a otra tienda
                    </summary>
                    <div className="pt-2">
                      <TransferStock
                        variantId={variant.id}
                        title={found.product.title}
                        size={variant.size || variant.title}
                        inventory={variant.inventory}
                        locations={locations}
                        defaultFrom={locationId}
                        online={online}
                        onDone={() => void refreshFound()}
                      />
                    </div>
                  </details>
                )}
                <Button variant="outline" onClick={() => setAddSize({ product: toSearchHit(found.product), code: null })} className="w-full">
                  Agregar talla
                </Button>
              </>
            ) : (
              <p className="text-sm text-gray-600">Elige una tienda arriba para registrar el movimiento.</p>
            )}
            <button
              onClick={() => {
                reset();
                setMessage("");
              }}
              className="min-h-[44px] w-full text-sm text-gray-500 hover:text-gray-800"
            >
              Cancelar y escanear otro
            </button>
          </div>
        </div>
      )}

      {newCode !== undefined && !searching && !found && !addSize && newCode !== null && altaStep === "ask" && (
        <ExistingProductSearch
          onPick={(hit) => setAddSize({ product: hit, code: newCode })}
          onNew={() => setAltaStep("new")}
        />
      )}

      {newCode !== undefined && !searching && !found && !addSize && (newCode === null || altaStep === "new") && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          {!locationId ? (
            <p className="text-sm text-gray-600">Elige una tienda arriba para dar de alta el producto.</p>
          ) : (
            <NewProductForm
              scannedCode={newCode}
              locationId={locationId}
              locationName={work.locationName ?? undefined}
              initialMode={entryMode}
              onModeChange={setEntryMode}
              onSuccess={(info) => {
                setIsError(false);
                setMessage(`${info.message} Escanea la siguiente etiqueta.`);
                setLastCreated(info);
                setCreatedCount((n) => n + 1);
                reset();
              }}
              onDuplicate={() => {
                if (newCode) void handleScan(newCode);
              }}
              onStockAdded={(available) => {
                setIsError(false);
                setMessage(`Piezas sumadas en tu tienda. Ahora hay ${available}. Escanea la siguiente etiqueta.`);
                reset();
              }}
              onCancel={() => {
                reset();
                setMessage("");
              }}
            />
          )}
        </div>
      )}

      {message && (
        <div
          role={isError ? "alert" : "status"}
          className={`rounded p-3 ${isError ? "border border-agotado bg-white text-agotado" : "border border-ok bg-white text-ok"}`}
        >
          {message}
        </div>
      )}

      {lastCreated && showScanner && (
        <div className="flex items-center gap-3 rounded-xl border bg-white p-3">
          {lastCreated.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lastCreated.imageUrl} alt={lastCreated.title} className="h-16 w-16 rounded-lg border object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border bg-gray-50 text-xs text-gray-400">
              Sin foto
            </div>
          )}
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-semibold">{lastCreated.title}</p>
            <p className="font-mono text-gray-600">SKU: {lastCreated.sku}</p>
            <p className="flex items-center gap-2 font-medium text-gray-800">
              <SavedCheck key={createdCount} />
              {lastCreated.catalogStatus}
            </p>
            {lastCreated.noBarcode && (
              <Link href="/etiquetas" className="inline-flex min-h-[44px] items-center font-medium text-turquesa-texto underline">
                Imprimir etiqueta
              </Link>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

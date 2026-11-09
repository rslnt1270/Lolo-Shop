"use client";
import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Scanner } from "@/components/inventory/Scanner";
import { ManualCodeEntry } from "@/components/inventory/ManualCodeEntry";
import type { EntryMode } from "@/lib/domain/new-product";
import { NewProductForm, type CreatedInfo } from "@/components/products/NewProductForm";
import {
  lookupCodeAction,
  adjustInventoryAction,
  fetchLocationsAction,
  type LookupCodeResult,
} from "@/lib/actions";
import { isValidGtin } from "@/lib/domain/barcode";

type Found = Extract<LookupCodeResult, { found: true }>;
type LocationOption = { id: string; name: string };

const LOCATION_KEY = "loloshop:escanear:location";

export default function EscanearPage() {
  const { data: session, status } = useSession();
  const [found, setFound] = useState<Found | null>(null);
  // El alta por lote recuerda el modo elegido entre un artículo y el siguiente.
  const [entryMode, setEntryMode] = useState<EntryMode>("stock");
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  // undefined = sin formulario; null = alta sin código; string = alta con código.
  const [newCode, setNewCode] = useState<string | null | undefined>(undefined);
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [lastCreated, setLastCreated] = useState<CreatedInfo | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [chosenLocation, setChosenLocation] = useState("");

  const role = session?.user?.role;
  const isCollaborator = role === "collaborator";
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
        if (!cancelled) {
          setIsError(true);
          setMessage("No se pudieron cargar las tiendas. Recarga la página.");
        }
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

  const reset = () => {
    setScannedCode(null);
    setFound(null);
    setNewCode(undefined);
    setLookupError("");
    setQuantity(1);
  };

  const handleScan = useCallback(async (code: string) => {
    setScannedCode(code);
    setMessage("");
    setIsError(false);
    setLookupError("");
    setFound(null);
    setNewCode(undefined);
    setSearching(true);
    try {
      const result = await lookupCodeAction(code);
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
  }, []);

  const handleMovement = async (type: "in" | "out") => {
    if (!found || !locationId) {
      setIsError(true);
      setMessage("Error: elige una tienda para registrar el movimiento.");
      return;
    }
    const qty = Math.floor(quantity);
    if (!Number.isFinite(qty) || qty < 1) {
      setIsError(true);
      setMessage("Error: La cantidad debe ser un número entero mayor o igual a 1.");
      return;
    }
    const delta = type === "in" ? qty : -qty;
    try {
      await adjustInventoryAction(found.variantId, locationId, delta);
      setIsError(false);
      setMessage(`Movimiento exitoso: ${delta > 0 ? "+" : ""}${delta} ${found.product.title}`);
      reset();
    } catch {
      setIsError(true);
      setMessage("Error al actualizar inventario.");
    }
  };

  if (status === "loading") {
    return <main className="p-4 text-center">Cargando...</main>;
  }

  if (!session?.user) {
    return <main className="p-4 text-center">Inicia sesión para escanear productos.</main>;
  }

  if (isCollaborator && !session.user.locationId) {
    return <main className="p-4 text-center">Tu usuario no tiene una tienda asignada. Pide al dueño que te la asigne.</main>;
  }

  const variant = found?.product.variants.find((v) => v.id === found.variantId) ?? found?.product.variants[0];
  const showScanner = !scannedCode && newCode === undefined;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Escanear Producto</h1>
        {createdCount > 0 && (
          <span className="rounded-full bg-loloteal/10 px-3 py-1 text-sm font-semibold text-loloteal">
            {createdCount} {createdCount === 1 ? "alta" : "altas"} en esta sesión
          </span>
        )}
      </div>

      {!isCollaborator && (
        <div>
          <label htmlFor="tienda" className="block text-sm font-medium text-gray-700">
            Tienda
          </label>
          <select
            id="tienda"
            value={chosenLocation}
            onChange={(e) => chooseLocation(e.target.value)}
            className="mt-1 block min-h-[44px] w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
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
        <div role="alert" className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{lookupError}</p>
          <div className="flex gap-2">
            {scannedCode && (
              <button
                type="button"
                onClick={() => void handleScan(scannedCode)}
                className="min-h-[44px] flex-1 rounded-lg bg-red-600 px-4 font-medium text-white"
              >
                Reintentar
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="min-h-[44px] flex-1 rounded-lg border border-red-300 bg-white px-4 font-medium"
            >
              Escanear otro
            </button>
          </div>
        </div>
      )}

      {found && !searching && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm text-gray-500">Código escaneado: {scannedCode}</p>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{found.product.title}</h2>
              <p className="text-sm text-gray-600">
                {variant?.title} - {found.product.brand}
              </p>
              {variant && <p className="mt-1 font-mono text-sm">Precio: ${Number(variant.price)}</p>}
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="cantidad" className="text-sm font-medium">
                Cantidad:
              </label>
              <input
                id="cantidad"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="min-h-[44px] w-24 rounded border p-1"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleMovement("out")}
                className="min-h-[44px] flex-1 rounded bg-loloteal px-4 py-2 font-semibold text-white hover:bg-opacity-90"
              >
                Registrar Salida
              </button>
              <button
                onClick={() => handleMovement("in")}
                className="min-h-[44px] flex-1 rounded border border-loloteal px-4 py-2 font-semibold text-loloteal hover:bg-loloteal/10"
              >
                Registrar Entrada
              </button>
            </div>
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

      {newCode !== undefined && !searching && !found && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          {!locationId ? (
            <p className="text-sm text-gray-600">Elige una tienda arriba para dar de alta el producto.</p>
          ) : (
            <NewProductForm
              scannedCode={newCode}
              locationId={locationId}
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
          className={`rounded p-3 ${isError ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}
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
            {lastCreated.noBarcode && (
              <Link href="/etiquetas" className="inline-flex min-h-[44px] items-center font-medium text-loloteal underline">
                Imprimir etiqueta
              </Link>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

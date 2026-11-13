"use client";
import { useId, useState } from "react";
import { AlertCircle, AlertTriangle, Barcode, Minus, Plus, PlusCircle } from "lucide-react";
import { addVariantAction } from "@/lib/actions";
import type { ProductSearchHit } from "@/lib/data/source";
import { MAX_SIZE_LENGTH, validateSizeRow } from "@/lib/domain/new-product";
import { normalizeSize } from "@/lib/domain/sizes";
import { withSession } from "@/lib/client/with-session";
import { ActionErrorText } from "@/components/sales/session-expired";
import { Button } from "@/components/ui/Button";

interface AddSizeFormProps {
  product: ProductSearchHit;
  /** Código escaneado para la talla nueva; null = "Sin código" (se genera SKU interno). */
  scannedCode: string | null;
  locationId: string;
  onDone(message: string): void;
  onCancel(): void;
  /** Volver a la búsqueda para elegir otro producto. */
  onChangeProduct?: () => void;
}

const inputClass =
  "block min-h-[44px] w-full rounded-full border border-gray-300 bg-white px-4 text-base text-gray-900 focus:border-turquesa-texto focus:outline-none focus:ring-2 focus:ring-turquesa-texto";

/**
 * "Agregar talla": suma una talla (talla, precio y piezas) a un producto ya
 * registrado con el código escaneado. El colaborador fija el precio de la
 * talla nueva igual que en el alta.
 */
export function AddSizeForm({ product, scannedCode, locationId, onDone, onCancel, onChangeProduct }: AddSizeFormProps) {
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [pieces, setPieces] = useState("1");
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [pending, setPending] = useState(false);
  const sizeId = useId();
  const priceId = useId();
  const piecesId = useId();

  const typed = size.trim() ? normalizeSize(size) : null;
  const sameSizeWithOtherCode = typed !== null && scannedCode !== null && product.sizes.includes(typed);

  const step = (delta: number) => {
    const n = Number(pieces);
    setPieces(String(Math.max(0, (Number.isInteger(n) && n >= 0 ? n : 0) + delta)));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError("");
    setSessionExpired(false);
    const input = {
      productId: product.productId,
      size,
      barcode: scannedCode,
      price: parseFloat(price),
      initialStock: Number(pieces),
      locationId,
    };
    try {
      validateSizeRow({ size: input.size, barcode: input.barcode, price: input.price, initialStock: input.initialStock });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revisa los datos de la talla.");
      return;
    }
    setPending(true);
    try {
      const r = withSession(await addVariantAction(input));
      if (r.ok) {
        onDone(`Talla ${normalizeSize(size)} agregada a ${product.title}.`);
      } else {
        setSessionExpired(r.code === "SESSION");
        setError(r.message);
      }
    } catch {
      setError("No se pudo agregar la talla. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Agregar talla</h2>

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
        <div className="flex gap-3">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt={product.title} className="h-20 w-20 shrink-0 rounded-xl border object-cover" />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border bg-white text-xs text-gray-500">
              Sin foto
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-600">{product.brand}</p>
            <p className="font-semibold text-gray-900">{product.title}</p>
            {product.publicCode && (
              <p className="mt-1 inline-block rounded-md border bg-white px-2 font-mono text-xs text-gray-700">
                Código público {product.publicCode}
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-2">
          <p className="flex flex-wrap items-center gap-1 text-sm text-gray-700">
            <span>Tallas registradas:</span>
            {product.sizes.length === 0 && <span className="text-gray-500">ninguna activa</span>}
            {product.sizes.map((s) => (
              <span key={s} className="rounded-full border border-gray-500 px-2 font-mono text-xs">{s}</span>
            ))}
          </p>
          {onChangeProduct && (
            <button
              type="button"
              onClick={onChangeProduct}
              className="min-h-[44px] px-2 text-sm font-semibold text-turquesa-texto"
            >
              Cambiar producto
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-full border border-gray-200 px-4 py-2">
        <span className="flex items-center gap-2 text-sm text-gray-700">
          <Barcode aria-hidden="true" className="h-5 w-5" />
          Código escaneado
        </span>
        <span data-testid="codigo-nueva-talla" className="rounded-md bg-gray-100 px-2 py-1 font-mono text-sm text-gray-900">
          {scannedCode ?? "Sin código"}
        </span>
      </div>

      <div>
        <label htmlFor={sizeId} className="block text-sm font-medium uppercase tracking-wide text-gray-700">Talla</label>
        <input
          id={sizeId}
          type="text"
          autoCapitalize="characters"
          maxLength={MAX_SIZE_LENGTH}
          value={size}
          onChange={(e) => setSize(e.target.value)}
          placeholder="Ej. L, 28, CH"
          className={`${inputClass} mt-1 uppercase`}
        />
      </div>

      {sameSizeWithOtherCode && !error && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Aviso:</strong>{" "}
            <span>{`Ya existe la talla ${typed} con otro código. Se guardará como otra etiqueta de la misma talla.`}</span>
          </span>
        </p>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-agotado/40 bg-red-50 p-3 text-sm font-medium text-agotado">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span><ActionErrorText message={error} session={sessionExpired} /></span>
        </p>
      )}

      <div>
        <label htmlFor={priceId} className="block text-sm font-medium uppercase tracking-wide text-gray-700">Precio de venta</label>
        <div className="relative mt-1">
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-gray-500">$</span>
          <input
            id={priceId}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            className={`${inputClass} pl-8 pr-14 font-mono`}
          />
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-4 flex items-center font-mono text-sm text-gray-500">MXN</span>
        </div>
      </div>

      <div>
        <label htmlFor={piecesId} className="block text-sm font-medium uppercase tracking-wide text-gray-700">Piezas</label>
        <div className="mt-1 flex items-center rounded-full border border-gray-300 p-1">
          <button type="button" aria-label="Quitar una pieza" onClick={() => step(-1)} className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100">
            <Minus aria-hidden="true" className="h-5 w-5" />
          </button>
          <input
            id={piecesId}
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={pieces}
            onChange={(e) => setPieces(e.target.value)}
            className="h-11 min-w-0 flex-1 text-center font-mono text-base text-gray-900 focus:outline-none"
          />
          <button type="button" aria-label="Sumar una pieza" onClick={() => step(1)} className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100">
            <Plus aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="sticky bottom-[var(--bottom-nav-offset)] md:bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-gray-100 bg-white px-4 pb-[max(0.5rem,var(--sticky-safe-pb))] pt-2">
        <Button
          type="submit"
          disabled={pending} className="w-full">
          <PlusCircle aria-hidden="true" className="h-5 w-5" />
          {pending ? "Guardando…" : "Agregar talla"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={pending} className="w-full">
          Cancelar
        </Button>
      </div>
    </form>
  );
}

"use client";
import { useEffect, useId, useState, type ReactNode } from "react";
import { HelpCircle, Plus, Search } from "lucide-react";
import { searchProductsAction } from "@/lib/actions";
import type { ProductSearchHit } from "@/lib/data/source";
import { LoginLink, SESSION_EXPIRED_TEXT } from "@/components/sales/session-expired";
import { Button } from "@/components/ui/Button";

interface ExistingProductSearchProps {
  /** Eligió un producto: se abre "Agregar talla" con el código escaneado. Sin esto no hay botón "+". */
  onPick?(hit: ProductSearchHit): void;
  /** "No, es un producto nuevo": se abre el alta con la sección Tallas. */
  onNew?(): void;
  /** Título de la sección (por defecto, la pregunta del alta). */
  heading?: string;
  placeholder?: string;
  /** Etiqueta accesible del botón "+" de cada resultado. */
  pickLabel?: (hit: ProductSearchHit) => string;
  /** Oculta "No, es un producto nuevo". */
  hideNewButton?: boolean;
  /** Contenido extra bajo cada resultado (por ejemplo, tallas con existencias). */
  renderHitExtra?: (hit: ProductSearchHit) => ReactNode;
}

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

type Status = "idle" | "loading" | "done" | "error" | "session";

/**
 * Antes del alta de un código nuevo: "¿Es otra talla de un producto ya
 * registrado?". Busca por título, marca o código público; cada resultado
 * muestra la foto de frente y las tallas existentes.
 */
export function ExistingProductSearch({
  onPick,
  onNew,
  heading = "¿Es otra talla de un producto ya registrado?",
  placeholder = "Busca por título, marca o código público",
  pickLabel = (h) => `Agregar talla a ${h.title}`,
  hideNewButton = false,
  renderHitExtra,
}: ExistingProductSearchProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductSearchHit[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const headingId = useId();
  const inputId = useId();

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setHits([]);
      setStatus("idle");
      return;
    }
    let alive = true;
    setStatus("loading");
    const t = setTimeout(() => {
      searchProductsAction(q)
        .then((res) => {
          if (!alive) return;
          if (res === null) {
            setStatus("session");
            setHits([]);
            return;
          }
          setHits(res);
          setStatus("done");
        })
        .catch(() => {
          if (alive) setStatus("error");
        });
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 id={headingId} className="flex items-start gap-2 text-base font-semibold text-gray-900">
        <HelpCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-turquesa-texto" />
        {heading}
      </h2>

      <div className="relative">
        <label htmlFor={inputId} className="sr-only">Buscar producto registrado</label>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
        <input
          id={inputId}
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="block min-h-[44px] w-full rounded-full border border-gray-300 bg-white py-2 pl-10 pr-4 text-base text-gray-900 focus:border-turquesa-texto focus:outline-none focus:ring-2 focus:ring-turquesa-texto"
        />
      </div>

      <div aria-live="polite" className="text-sm text-gray-600">
        {status === "loading" && <p>Buscando…</p>}
        {status === "done" && hits.length === 0 && <p>No encontramos productos con «{query.trim()}».</p>}
        {status === "error" && <p className="text-agotado">No se pudo buscar. Revisa tu conexión e intenta de nuevo.</p>}
        {status === "session" && (
          <p className="text-agotado">{SESSION_EXPIRED_TEXT} <LoginLink /></p>
        )}
      </div>

      {hits.length > 0 && (
        <ul className="space-y-2">
          {hits.map((h) => (
            <li key={h.productId} className="rounded-xl border border-gray-200 bg-gray-50 p-2">
              <div className="flex items-center gap-3">
              {h.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.imageUrl} alt={h.title} className="h-14 w-14 shrink-0 rounded-lg border object-cover" />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border bg-white text-xs text-gray-500">
                  Sin foto
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-gray-900">{h.title}</p>
                <p className="truncate text-sm text-gray-600">
                  {h.brand}
                  {h.publicCode && <span className="ml-2 font-mono text-xs text-gray-500">{h.publicCode}</span>}
                </p>
                {h.sizes.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {h.sizes.map((size) => (
                      <span key={size} className="rounded-full border border-gray-400 px-2 font-mono text-xs text-gray-800">
                        {size}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {onPick && (
                <button
                  type="button"
                  aria-label={pickLabel(h)}
                  onClick={() => onPick(h)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-turquesa-texto hover:bg-white active:bg-gray-100"
                >
                  <Plus aria-hidden="true" className="h-6 w-6" />
                </button>
              )}
              </div>
              {renderHitExtra?.(h)}
            </li>
          ))}
        </ul>
      )}

      {onNew && !hideNewButton && (
        <Button variant="outline"
          onClick={onNew} className="w-full">
          No, es un producto nuevo
        </Button>
      )}
    </section>
  );
}

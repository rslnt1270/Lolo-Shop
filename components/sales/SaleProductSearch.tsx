"use client";
import { useEffect, useId, useState } from "react";
import { Search } from "lucide-react";
import { ExistingProductSearch } from "@/components/products/ExistingProductSearch";
import { Button } from "@/components/ui/Button";
import { listVariantStockAtAction, lookupCodeAction, type VariantStockRow } from "@/lib/actions";
import type { OfflineSnapshot, VariantMatch } from "@/lib/data/source";
import { LoginLink, SESSION_EXPIRED_TEXT } from "@/components/sales/session-expired";
import { listQueue } from "@/lib/offline/queue-store";
import { searchOffline, toDraftMatch, type OfflineSearchHit } from "@/lib/offline/lookup";
import { OFFLINE_NOT_FOUND_TEXT } from "@/lib/offline/use-offline-pos";

interface SaleProductSearchProps {
  locationId: string;
  /** Cobro en curso o carrito bloqueado: no se puede elegir talla. */
  disabled?: boolean;
  onAdd(match: VariantMatch, stock: { available: number; sold: boolean }): void;
  /**
   * Sin internet: busca solo en la copia local de la tienda (`snapshot`, null si
   * no hay una vigente; entonces se muestra `blockedText`).
   */
  offline?: { snapshot: OfflineSnapshot | null; blockedText: string };
}

/**
 * "Sin código" en /pos: busca solo productos registrados (tipo, marca, color, título o
 * código interno). Cada resultado lista sus tallas con las piezas de la tienda de la venta;
 * elegir una talla con existencias la agrega al carrito. Nunca acepta texto libre como producto.
 */
export function SaleProductSearch({ locationId, disabled = false, onAdd, offline }: SaleProductSearchProps) {
  if (offline) {
    return offline.snapshot ? (
      <OfflineProductSearch key={locationId} snapshot={offline.snapshot} disabled={disabled} onAdd={onAdd} />
    ) : (
      <p role="alert" className="rounded-lg border border-agotado bg-white p-3 text-sm font-semibold text-agotado">
        {offline.blockedText}
      </p>
    );
  }
  return <OnlineProductSearch locationId={locationId} disabled={disabled} onAdd={onAdd} />;
}

function OnlineProductSearch({ locationId, disabled, onAdd }: Required<Pick<SaleProductSearchProps, "locationId" | "disabled" | "onAdd">>) {
  const [problem, setProblem] = useState<{ text: string; login?: boolean } | null>(null);

  // Otra tienda: un aviso de la búsqueda anterior ya no aplica.
  useEffect(() => {
    setProblem(null);
  }, [locationId]);

  const pick = async (row: VariantStockRow) => {
    setProblem(null);
    try {
      const res = await lookupCodeAction(row.sku, locationId);
      if (!res) {
        setProblem({ text: SESSION_EXPIRED_TEXT, login: true });
      } else if (res.found && res.variantId === row.variantId) {
        const variant = res.product.variants.find((v) => v.id === res.variantId);
        if (variant) {
          onAdd({ product: res.product, variant }, res.stock ?? { available: row.available, sold: false });
          return;
        }
        setProblem({ text: "No pudimos agregar esa talla. Intenta de nuevo." });
      } else if (!res.found && res.error) {
        setProblem({ text: res.error, login: res.error === SESSION_EXPIRED_TEXT });
      } else {
        setProblem({ text: "Esa talla ya no está disponible. Vuelve a buscar el producto." });
      }
    } catch {
      setProblem({ text: "No se pudo agregar la talla. Revisa tu conexión e intenta de nuevo." });
    }
  };

  return (
    <div className="space-y-2">
      {/* key: al cambiar de tienda la búsqueda empieza de cero. */}
      <ExistingProductSearch
        key={locationId}
        heading="Sin código"
        placeholder="Busca por tipo, marca, color o código interno"
        hideNewButton
        renderHitExtra={(h) => (
          <HitSizes productId={h.productId} locationId={locationId} disabled={disabled} onPick={pick} />
        )}
      />
      {problem && (
        <p role="alert" className="rounded-lg border border-agotado bg-white p-3 text-sm font-semibold text-agotado">
          {problem.text}
          {problem.login && (
            <>
              {" "}
              <LoginLink />
            </>
          )}
        </p>
      )}
    </div>
  );
}

function HitSizes({
  productId,
  locationId,
  disabled,
  onPick,
}: {
  productId: string;
  locationId: string;
  disabled: boolean;
  onPick(row: VariantStockRow): void;
}) {
  const [rows, setRows] = useState<VariantStockRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    listVariantStockAtAction(productId, locationId)
      .then((res) => {
        if (!alive) return;
        if (res === null) setFailed(true);
        else setRows(res);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [productId, locationId]);

  if (failed) return <p className="mt-2 text-sm text-agotado">No se pudieron cargar las tallas.</p>;
  if (rows === null) return <p className="mt-2 text-sm text-gray-600">Cargando tallas…</p>;
  if (rows.length === 0) return <p className="mt-2 text-sm text-gray-600">Sin tallas en esta tienda.</p>;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {rows.map((r) => {
        const out = r.available < 1;
        return (
          <Button
            key={r.variantId}
            variant="outline"
            disabled={disabled || out}
            onClick={() => onPick(r)}
            className="min-h-[44px]"
          >
            <span className="font-mono font-semibold">{r.size}</span>{" "}
            <span className="text-sm font-normal">{out ? "Sin existencias" : `${r.available} ${r.available === 1 ? "disponible" : "disponibles"}`}</span>
          </Button>
        );
      })}
    </div>
  );
}

/**
 * "Sin código" sin internet (spec §10): busca en la copia local por título o
 * código interno; las piezas descuentan las ventas de la cola aún sin enviar.
 */
function OfflineProductSearch({
  snapshot,
  disabled,
  onAdd,
}: {
  snapshot: OfflineSnapshot;
  disabled: boolean;
  onAdd(match: VariantMatch, stock: { available: number; sold: boolean }): void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<OfflineSearchHit[] | null>(null);
  const headingId = useId();
  const inputId = useId();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits(null);
      return;
    }
    let alive = true;
    void listQueue().then((queue) => {
      if (alive) setHits(searchOffline(q, snapshot, queue));
    });
    return () => {
      alive = false;
    };
  }, [query, snapshot]);

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 id={headingId} className="text-base font-semibold text-gray-900">
        Sin código
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
          placeholder="Busca por tipo, marca, color o código interno"
          className="block min-h-[44px] w-full rounded-full border border-gray-300 bg-white py-2 pl-10 pr-4 text-base text-gray-900 focus:border-turquesa-texto focus:outline-none focus:ring-2 focus:ring-turquesa-texto"
        />
      </div>
      <div aria-live="polite" className="text-sm text-gray-600">
        {hits !== null && hits.length === 0 && <p>{OFFLINE_NOT_FOUND_TEXT}</p>}
      </div>
      {hits !== null && hits.length > 0 && (
        <ul className="space-y-2">
          {hits.map((h) => (
            <li key={h.productId} className="rounded-xl border border-gray-200 bg-gray-50 p-2">
              <p className="truncate font-semibold text-gray-900">{h.title}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {h.sizes.map((s) => {
                  const out = s.available < 1;
                  return (
                    <Button
                      key={s.variant.variantId}
                      variant="outline"
                      disabled={disabled || out}
                      onClick={() => onAdd(toDraftMatch(s.variant), { available: s.available, sold: false })}
                      className="min-h-[44px]"
                    >
                      <span className="font-mono font-semibold">{s.size}</span>{" "}
                      <span className="text-sm font-normal">
                        {out ? "Sin existencias" : `${s.available} ${s.available === 1 ? "disponible" : "disponibles"}`}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";
import { useEffect, useState } from "react";
import { ExistingProductSearch } from "@/components/products/ExistingProductSearch";
import { Button } from "@/components/ui/Button";
import { listVariantStockAtAction, lookupCodeAction, type VariantStockRow } from "@/lib/actions";
import type { VariantMatch } from "@/lib/data/source";
import { LoginLink, SESSION_EXPIRED_TEXT } from "@/components/sales/session-expired";

interface SaleProductSearchProps {
  locationId: string;
  /** Cobro en curso o carrito bloqueado: no se puede elegir talla. */
  disabled?: boolean;
  onAdd(match: VariantMatch, stock: { available: number; sold: boolean }): void;
}

/**
 * "Sin código" en /pos: busca solo productos registrados (tipo, marca, color, título o
 * código interno). Cada resultado lista sus tallas con las piezas de la tienda de la venta;
 * elegir una talla con existencias la agrega al carrito. Nunca acepta texto libre como producto.
 */
export function SaleProductSearch({ locationId, disabled = false, onAdd }: SaleProductSearchProps) {
  const [problem, setProblem] = useState<{ text: string; login?: boolean } | null>(null);

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
        <p role="alert" className="rounded-lg bg-error-container p-3 text-sm font-semibold text-on-error-container">
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

  if (failed) return <p className="mt-2 text-sm text-[#9A3B2E]">No se pudieron cargar las tallas.</p>;
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
            <span className="text-sm font-normal">{out ? "Sin existencias" : `${r.available} disponibles`}</span>
          </Button>
        );
      })}
    </div>
  );
}

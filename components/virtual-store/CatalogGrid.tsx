"use client";

import type { PublicProduct } from "@/lib/data/public-projection";

import { formatPrice } from "@/lib/public/format";
import { FavoriteButton } from "@/components/favorites/FavoriteButton";
import { useFavorites } from "@/components/favorites/useFavorites";
import { Button } from "@/components/ui/Button";

const MAX_CHIPS = 6;

/** Precio de la tarjeta: "Desde $X" si las tallas difieren; null si no hay precio (nunca se inventa). */
function priceLabel(p: PublicProduct): string | null {
  if (p.price === null) return null;
  const prices = new Set(p.sizes.map((s) => s.price));
  return prices.size > 1 ? `Desde ${formatPrice(p.price)}` : formatPrice(p.price);
}

interface Props {
  products: PublicProduct[];
  onSelect: (p: PublicProduct) => void;
}

/** Cuadrícula de 2 columnas (375 px): foto de frente, marca, nombre y precio. Foto y textos abren la prenda; abajo, favorito (principal) y "Ver prenda" (contorno). */
export function CatalogGrid({ products, onSelect }: Props) {
  const favorites = useFavorites();
  return (
    <ul aria-label="Prendas" className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {products.map((p) => (
        <li key={p.id} id={`p-${p.id}`}>
          <button
            type="button"
            onClick={() => onSelect(p)}
            className="flex min-h-11 min-w-11 w-full flex-col text-left transition-opacity active:opacity-80"
          >
            <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-[14px] border border-gray-200 bg-gray-100">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" width={320} height={320} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[11px] font-medium text-gray-500">Foto de frente</span>
              )}
            </span>
            <span className="pt-2">
              <span className="mb-1 block font-mono text-[11px] uppercase leading-none tracking-wider text-gray-500">
                {p.brand}
              </span>
              <span className="line-clamp-2 block text-sm font-semibold leading-snug text-gray-900">{p.title}</span>
              {priceLabel(p) && (
                <span className="mt-1.5 block text-sm font-bold text-gray-900">{priceLabel(p)}</span>
              )}
              <span className="mt-1.5 flex flex-wrap gap-1">
                {p.sizes.slice(0, MAX_CHIPS).map((s) => (
                  // Informativos: el objetivo táctil es toda la tarjeta.
                  <span
                    key={s.size}
                    data-testid="size-chip"
                    role="img"
                    aria-label={s.available ? s.size : `${s.size}, agotada`}
                    className={`rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-none ${
                      s.available
                        ? "border-gray-300 text-gray-700"
                        : "border-gray-200 text-gray-400 line-through decoration-2"
                    }`}
                  >
                    {s.size}
                  </span>
                ))}
                {p.sizes.length > MAX_CHIPS && (
                  <span className="px-1 py-0.5 font-mono text-[11px] leading-none text-gray-500">
                    +{p.sizes.length - MAX_CHIPS}
                  </span>
                )}
              </span>
            </span>
          </button>
          <div data-testid="card-actions" className="flex flex-col gap-2 pt-2 sm:flex-row">
            <FavoriteButton
              className="sm:flex-1"
              productId={p.id}
              title={p.title}
              saved={favorites.isSaved(p.id)}
              disabled={!favorites.storageOk}
              onToggle={() => favorites.toggle(p.id)}
            />
            <Button
              variant="outline"
              className="w-full sm:flex-1"
              aria-label={`Ver prenda ${p.title}`}
              onClick={() => onSelect(p)}
            >
              Ver prenda
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

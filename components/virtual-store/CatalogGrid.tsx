"use client";

import type { PublicProduct } from "@/lib/data/public-projection";

interface Props {
  products: PublicProduct[];
  onSelect: (p: PublicProduct) => void;
}

/** Cuadrícula de 2 columnas (375 px): foto de frente, marca, nombre y precio. Toda la tarjeta es el botón. */
export function CatalogGrid({ products, onSelect }: Props) {
  return (
    <ul aria-label="Prendas" className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {products.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onSelect(p)}
            className="flex min-h-[44px] w-full flex-col text-left transition-opacity active:opacity-80"
          >
            <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-[14px] border border-gray-200 bg-gray-100">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[11px] font-medium text-gray-500">Foto de frente</span>
              )}
            </span>
            <span className="pt-2">
              <span className="mb-1 block font-mono text-[11px] uppercase leading-none tracking-wider text-gray-500">
                {p.brand}
              </span>
              <span className="line-clamp-2 block text-sm font-semibold leading-snug text-gray-900">{p.title}</span>
              {p.price !== null && (
                <span className="mt-1.5 block text-sm font-bold text-gray-900">${p.price}</span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

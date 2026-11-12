"use client";
import type { Location, Product } from "@/lib/domain/types";
import { ProductPhotoButton } from "./ProductPhotoButton";
import { PublishControl } from "./PublishControl";

interface Props {
  product: Product;
  locations: Pick<Location, "id" | "type" | "isPublic">[];
  onChanged: () => void;
  /** Abre la ficha completa del producto. */
  onOpenSheet: () => void;
}

/** Fila de la lista "Por publicar": ver y descargar las fotos, reemplazarlas y publicar (owner y manager). */
export function PendingPublicationRow({ product, locations, onChanged, onOpenSheet }: Props) {
  const photos = [
    { side: "frente", url: product.imageUrl },
    { side: "atrás", url: product.backImageUrl },
  ];

  return (
    <li className="space-y-3 rounded-lg border p-4 shadow-sm">
      <div className="flex gap-3">
        {photos.map(({ side, url }) =>
          url ? (
            <a
              key={side}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir foto de ${side} de ${product.title}`}
              className="block h-24 w-24 shrink-0 overflow-hidden rounded-lg border focus:outline-none focus-visible:ring-2 focus-visible:ring-turquesa-texto"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </a>
          ) : null,
        )}
        <div className="min-w-0">
          <h3 className="font-semibold">{product.title}</h3>
          <p className="text-sm text-gray-600">{product.brand} · {product.category}</p>
          {product.publicCode && (
            <p className="text-sm text-gray-700">
              Código <span className="font-mono font-semibold tracking-wider text-gray-900">{product.publicCode}</span>
            </p>
          )}
        </div>
      </div>

      {/* Los huecos de elegibilidad (p. ej. "Falta la descripción.") los muestra PublishControl. */}
      <div className="flex flex-wrap items-center gap-x-4">
        <ProductPhotoButton productId={product.id} productTitle={product.title} hasImage={!!product.imageUrl} onUpdated={onChanged} />
        <ProductPhotoButton productId={product.id} productTitle={product.title} side="back" hasImage={!!product.backImageUrl} onUpdated={onChanged} />
        <button
          type="button"
          onClick={onOpenSheet}
          aria-label={`Abrir la ficha de ${product.title}`}
          className="min-h-[44px] rounded-lg px-2 text-sm font-semibold text-turquesa-texto underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-turquesa-texto"
        >
          Ver ficha
        </button>
      </div>

      <PublishControl product={product} locations={locations} onChanged={onChanged} />
    </li>
  );
}

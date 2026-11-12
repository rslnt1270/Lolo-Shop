"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, Heart } from "lucide-react";
import type { PublicProduct } from "@/lib/data/public-projection";
import { formatPrice } from "@/lib/public/format";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/button-classes";
import { useFavorites } from "./useFavorites";

interface Props {
  products: PublicProduct[];
  loadError?: boolean;
}

const LEYENDA =
  "Tus favoritos se guardan solo en este navegador. Si cambias de dispositivo o borras los datos del navegador, se pierden.";

function priceLabel(p: PublicProduct): string | null {
  if (p.price === null) return null;
  const prices = new Set(p.sizes.map((s) => s.price));
  return prices.size > 1 ? `Desde ${formatPrice(p.price)}` : formatPrice(p.price);
}

function ConfirmRemove({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  const groupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    groupRef.current?.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
  }, []);
  return (
    <div ref={groupRef} role="group" aria-label="Confirmar" className="mt-3 border-t border-borde-control/30 pt-3">
      <p className="mb-2 text-sm font-bold text-tinta">¿Quitar de favoritos?</p>
      <div className="flex gap-2">
        <Button variant="danger" className="flex-1" onClick={onYes}>
          Sí, quitar
        </Button>
        <Button data-cancel="" variant="outline" className="flex-1" onClick={onNo}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export default function FavoritesClient({ products, loadError = false }: Props) {
  const fav = useFavorites();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const byId = new Map(products.map((p) => [p.id, p]));
  // Con error de carga no se sabe qué sigue publicado: no se marca nada como "Ya no disponible".
  const rows = loadError ? [] : fav.ids;

  const remove = (id: string) => {
    fav.toggle(id);
    setConfirmId(null);
  };

  return (
    <main className="mx-auto min-h-pantalla w-full max-w-2xl bg-white px-4 pb-10 text-tinta">
      <header className="flex min-h-14 items-center justify-between border-b border-niebla">
        <Link href="/catalogo" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-turquesa-texto">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Catálogo
        </Link>
        <span className="text-lg font-extrabold text-tinta">LoloShop</span>
        <span className="w-16" aria-hidden="true" />
      </header>

      <h1 className="mt-6 text-3xl font-extrabold text-turquesa-titular">Favoritos</h1>
      <p className="mt-4 rounded-2xl border border-borde-control/30 bg-niebla p-4 text-sm leading-relaxed text-tinta">
        {LEYENDA}
      </p>

      {!fav.storageOk && fav.ready && (
        <p role="status" className="mt-3 text-sm text-agotado">
          Tu navegador no permite guardar favoritos.
        </p>
      )}

      {loadError && (
        <p role="alert" className="mt-4 text-sm font-semibold text-agotado">
          No pudimos cargar tus favoritos. Intenta de nuevo.
        </p>
      )}

      {!fav.ready ? (
        <div aria-hidden="true" className="mt-4 space-y-3">
          <div className="h-32 rounded-2xl bg-niebla" />
          <div className="h-32 rounded-2xl bg-niebla" />
        </div>
      ) : rows.length === 0 && !loadError ? (
        <div className="mt-6 flex flex-col items-center rounded-2xl border-2 border-dashed border-borde-control/50 p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-niebla text-turquesa-texto">
            <Heart className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-3 text-lg font-bold text-tinta">Aún no guardas prendas</h2>
          <p className="mt-1 text-sm text-tinta/80">Explora el catálogo y guarda tus piezas favoritas para verlas aquí.</p>
          <Link href="/catalogo" className={`${buttonClasses("primary")} mt-5 w-full`}>
            Ir al catálogo
          </Link>
        </div>
      ) : (
        <ul aria-label="Prendas guardadas" className="mt-4 space-y-3">
          {rows.map((id) => {
            const p = byId.get(id);
            return (
              <li key={id} className="rounded-2xl border border-borde-control/30 bg-niebla p-3">
                {p ? (
                  <div className="flex gap-3">
                    <span className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
                      {p.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" width={96} height={96} loading="lazy" className="h-full w-full object-cover" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[11px] uppercase leading-none tracking-wider text-tinta/70">{p.brand}</p>
                      <p className="mt-1 line-clamp-2 text-base font-bold text-tinta">{p.title}</p>
                      {priceLabel(p) && <p className="mt-1 font-mono text-sm font-bold text-turquesa-texto">{priceLabel(p)}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-white text-agotado">
                      <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <p className="flex items-center gap-1 text-sm font-bold text-agotado">Ya no disponible</p>
                  </div>
                )}
                {confirmId === id ? (
                  <ConfirmRemove onYes={() => remove(id)} onNo={() => setConfirmId(null)} />
                ) : (
                  <div className="mt-3 flex gap-2">
                    {p && (
                      <Link href={`/catalogo#p-${id}`} aria-label={`Ver prenda ${p.title}`} className={`${buttonClasses("outline")} flex-1`}>
                        Ver prenda
                      </Link>
                    )}
                    <Button
                      variant="danger"
                      className={p ? "" : "flex-1"}
                      aria-label={p ? `Quitar ${p.title} de favoritos` : "Quitar prenda que ya no está disponible de favoritos"}
                      onClick={() => setConfirmId(id)}
                    >
                      Quitar
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

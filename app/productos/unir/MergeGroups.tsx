"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { sizeClashes, type DuplicateGroup } from "@/lib/domain/size-duplicates";
import type { Product } from "@/lib/domain/types";
import { sortSizes } from "@/lib/domain/sizes";
import { mergeProductsAction } from "@/lib/products/actions";

interface Props {
  groups: DuplicateGroup[];
  locations: { id: string; name: string }[];
  /** Renglones de venta por producto. */
  saleCounts: Record<string, number>;
  isOwner: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const NUM_WORD: Record<number, string> = { 2: "dos", 3: "tres", 4: "cuatro", 5: "cinco" };
const clashText = (c: { size: string; count: number }) => `${NUM_WORD[c.count] ?? c.count} tallas ${c.size}`;

function sizesOf(p: Product): string[] {
  return sortSizes([...new Set(p.variants.filter((v) => v.isActive !== false).map((v) => v.size))]);
}

function piecesByLocation(p: Product, locations: { id: string; name: string }[]) {
  return locations.map((l) => ({
    name: l.name,
    pieces: p.variants
      .filter((v) => v.isActive !== false)
      .reduce((sum, v) => sum + (v.inventory.find((i) => i.locationId === l.id)?.available ?? 0), 0),
  }));
}

function Group({ group, locations, saleCounts }: { group: DuplicateGroup; locations: Props["locations"]; saleCounts: Props["saleCounts"] }) {
  const router = useRouter();
  const [targetId, setTargetId] = useState(group.suggestedTargetId);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const target = group.products.find((p) => p.id === targetId) ?? group.products[0];
  const sources = group.products.filter((p) => p.id !== target.id);
  const movingVariants = sources.reduce((n, p) => n + p.variants.filter((v) => v.isActive !== false).length, 0);
  const clashes = sizeClashes(group.products);
  const movingSales = sources.reduce((n, p) => n + (saleCounts[p.id] ?? 0), 0);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await mergeProductsAction({ targetId: target.id, sourceIds: sources.map((p) => p.id) });
      if (res.ok) {
        setDone(`Listo: ${plural(res.movedVariants, "talla", "tallas")} y ${plural(res.movedSaleLines, "venta", "ventas")} ahora están en «${target.title}».`);
        setConfirming(false);
        router.refresh();
      } else {
        setError(res.message);
      }
    } catch {
      setError("No se pudo unir. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <p role="status" className="rounded-lg bg-loloteal/10 p-3 text-sm font-semibold text-loloteal">
        {done}
      </p>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 p-3">
      <fieldset className="space-y-2" disabled={busy}>
        <legend className="text-sm font-semibold text-gray-800">Elige el producto que se queda</legend>
        {group.products.map((p) => {
          const chosen = p.id === target.id;
          const sizes = sizesOf(p);
          const sold = saleCounts[p.id] ?? 0;
          return (
            <label
              key={p.id}
              data-testid={`merge-item-${p.id}`}
              className={`flex min-h-[44px] cursor-pointer gap-3 rounded-lg border p-2 motion-reduce:transition-none ${chosen ? "border-loloteal bg-loloteal/5" : "border-gray-200"}`}
            >
              <input
                type="radio"
                name={`target-${group.key}`}
                checked={chosen}
                onChange={() => {
                  setTargetId(p.id);
                  setConfirming(false);
                }}
                aria-label={`Se queda: ${p.title}`}
                className="mt-1 h-5 w-5 shrink-0 accent-loloteal"
              />
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt={`Foto de ${p.title}`} className="h-16 w-16 shrink-0 rounded object-cover" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-gray-100 text-xs text-gray-600">Sin foto</div>
              )}
              <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                <p className="font-semibold text-gray-900">{p.title}</p>
                <p className="text-gray-800">{sizes.length === 1 ? `Talla ${sizes[0]}` : `Tallas ${sizes.join(", ")}`}</p>
                <p className="flex flex-wrap gap-x-3 text-gray-700">
                  {piecesByLocation(p, locations).map((l) => (
                    <span key={l.name}>{l.name}: {l.pieces}</span>
                  ))}
                </p>
                <p className="flex flex-wrap gap-x-3 text-gray-700">
                  <span>{sold === 0 ? "Sin ventas" : plural(sold, "venta", "ventas")}</span>
                  {p.imageUrl && p.backImageUrl ? <span>Con las dos fotos</span> : <span>Faltan fotos</span>}
                </p>
                <p className="flex gap-2 text-xs font-semibold">
                  {chosen && <span className="rounded bg-loloteal px-2 py-0.5 text-white">Se queda</span>}
                  {p.id === group.suggestedTargetId && <span className="text-gray-700">Sugerido</span>}
                </p>
              </div>
            </label>
          );
        })}
      </fieldset>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-[#9A3B2E]">
          {error}
        </p>
      )}

      {confirming ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-900">
            Se moverán {plural(movingVariants, "talla", "tallas")} y {plural(movingSales, "venta", "ventas")} a «{target.title}». Las demás fichas se desactivan y su código sigue funcionando.
          </p>
          {clashes.length > 0 && (
            <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              Quedarán {clashes.map(clashText).join(" y ")}.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={busy}
              className="min-h-[44px] rounded-lg bg-loloteal px-3 text-sm font-semibold text-white active:bg-loloteal-dark disabled:opacity-60"
            >
              {busy ? "Uniendo…" : "Confirmar unión"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          className="min-h-[44px] w-full rounded-lg bg-loloteal px-4 text-sm font-semibold text-white active:bg-loloteal-dark"
        >
          Unir {group.products.length} productos
        </button>
      )}
    </section>
  );
}

export function MergeGroups({ groups, locations, saleCounts, isOwner }: Props) {
  if (!isOwner) {
    return <p className="rounded-lg bg-gray-100 p-3 text-sm font-semibold text-gray-800">Solo el dueño puede unir productos.</p>;
  }
  if (groups.length === 0) {
    return <p className="text-sm text-gray-700">No encontramos productos duplicados por talla.</p>;
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Group key={g.key} group={g} locations={locations} saleCounts={saleCounts} />
      ))}
    </div>
  );
}

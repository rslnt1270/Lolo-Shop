"use client";
import { useState } from "react";
import type { Location, Product } from "@/lib/domain/types";
import { Button } from "@/components/ui/Button";
import { ELIGIBILITY_GAP_TEXT, catalogEligibility, hasStockInPublicStore } from "@/lib/domain/catalog-eligibility";
import { publicStoreIds } from "@/lib/data/public-projection";
import { setProductPublishedAction } from "@/lib/products/actions";
import { withSession } from "@/lib/client/with-session";
import { ActionErrorText } from "@/components/sales/session-expired";

interface Props {
  product: Product;
  locations: Pick<Location, "id" | "type" | "isPublic">[];
  /** Se llama tras publicar o quitar, para que la lista recargue. */
  onChanged: () => void;
}

export const PUBLISH_CONFIRM_TEXT =
  "¿Publicar en el sitio? Revisa que las fotos no muestren personas, precios ni datos de clientes.";

/** Estado de publicación, huecos de elegibilidad y botones. La UI decide el botón; el servidor decide permiso y elegibilidad. */
export function PublishControl({ product, locations, onChanged }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; session?: boolean } | null>(null);

  const published = product.isPublished === true;
  const inactive = product.isActive === false;
  const { eligible, gaps } = catalogEligibility({
    imageUrl: product.imageUrl,
    backImageUrl: product.backImageUrl,
    description: product.description,
    hasStockInPublicStore: hasStockInPublicStore(product, publicStoreIds(locations)),
  });

  const run = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = withSession(await setProductPublishedAction(product.id, next));
      if (res.ok) {
        setConfirming(false);
        onChanged();
      } else {
        setError({ text: res.message, session: res.code === "SESSION" });
      }
    } catch {
      setError({ text: "No se pudo guardar. Revisa tu conexión e intenta de nuevo." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-gray-900">
        {published
          ? eligible
            ? "Publicado en el sitio"
            : `Publicado, pero no aparece en el sitio: ${gaps.map((g) => ELIGIBILITY_GAP_TEXT[g]).join(" ")}`
          : "No publicado"}
      </p>

      {!published && !eligible && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-gray-700">
          {gaps.map((g) => (
            <li key={g}>{ELIGIBILITY_GAP_TEXT[g]}</li>
          ))}
        </ul>
      )}

      {published ? (
        <Button variant="outline" onClick={() => void run(false)} loading={busy}>
          Quitar del sitio
        </Button>
      ) : inactive ? (
        <p className="text-sm text-gray-700">Reactívalo para publicarlo.</p>
      ) : confirming ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-800">{PUBLISH_CONFIRM_TEXT}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void run(true)} loading={busy}>
              Sí, publicar
            </Button>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setConfirming(true)} disabled={!eligible}>
          Publicar
        </Button>
      )}

      <div aria-live="polite">
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">
            <ActionErrorText message={error.text} session={error.session} />
          </p>
        )}
      </div>
    </div>
  );
}

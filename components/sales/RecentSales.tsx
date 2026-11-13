"use client";
import { useState } from "react";
import type { DashboardData } from "@/lib/data/sales-source";
import { CHANNEL_LABEL, METHOD_LABEL } from "@/lib/sales/format";
import { formatPrice } from "@/lib/public/format";
import { CancelSalePanel } from "./CancelSalePanel";
import { Button } from "@/components/ui/Button";

type Recent = NonNullable<DashboardData["recentSales"]>[number];

type Props = {
  sales: Recent[];
  locationNames: Record<string, string>;
  namesReady?: boolean;
  /** Tras anular: recargar el tablero. */
  onChanged: () => void;
};

const hourFormat = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function RecentRow({ sale, locationNames, namesReady = true, onChanged }: Omit<Props, "sales"> & { sale: Recent }) {
  const [open, setOpen] = useState(false);
  const pending = sale.status === "pending_payment";
  return (
    <li className="rounded-[14px] border border-borde-control bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-tinta">
          Venta #{sale.number}
          <span className="ml-2 font-normal text-tinta">{locationNames[sale.locationId] ?? (namesReady ? "Tienda sin nombre" : "…")}</span>
        </p>
        <p className="flex-none font-data-mono tabular-nums text-sm font-bold text-tinta">{formatPrice(sale.total)}</p>
      </div>
      <p className="mt-0.5 text-xs text-tinta">
        {METHOD_LABEL[sale.paymentMethod]}, {CHANNEL_LABEL[sale.channel]}, {hourFormat.format(new Date(sale.createdAt))}
        {pending && <span className="ml-2 font-bold text-tinta">Pago pendiente</span>}
      </p>
      <div className="mt-2">
        <Button
          variant="danger"
          aria-expanded={open}
          aria-label={`Anular venta #${sale.number}`}
          onClick={() => setOpen((v) => !v)}
        >
          Anular
        </Button>
      </div>
      {open && <CancelSalePanel saleId={sale.saleId} onCancelled={onChanged} />}
    </li>
  );
}

/** "Ventas de hoy" del dueño: el único lugar para anular una venta ya pagada. */
export function RecentSales({ sales, ...rest }: Props) {
  if (sales.length === 0) return <p className="text-sm text-tinta">Todavía no hay ventas hoy.</p>;
  return (
    <ul className="space-y-2">
      {sales.map((s) => (
        <RecentRow key={s.saleId} sale={s} {...rest} />
      ))}
    </ul>
  );
}

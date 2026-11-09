"use client";
import { useState } from "react";
import type { DashboardData } from "@/lib/data/sales-source";
import { CHANNEL_LABEL, METHOD_LABEL, formatMoney } from "@/lib/sales/format";
import { CancelSalePanel } from "./CancelSalePanel";
import { saleButton } from "./styles";

type Recent = NonNullable<DashboardData["recentSales"]>[number];

type Props = {
  sales: Recent[];
  locationNames: Record<string, string>;
  /** Tras anular: recargar el tablero. */
  onChanged: () => void;
};

const hourFormat = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function RecentRow({ sale, locationNames, onChanged }: Omit<Props, "sales"> & { sale: Recent }) {
  const [open, setOpen] = useState(false);
  const pending = sale.status === "pending_payment";
  return (
    <li className="rounded-[14px] border border-[rgba(18,33,31,0.12)] bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-[#12211F]">
          Venta #{sale.number}
          <span className="ml-2 font-normal text-[#3A4D4A]">{locationNames[sale.locationId] ?? "Tienda sin nombre"}</span>
        </p>
        <p className="flex-none font-mono text-sm font-bold text-[#12211F]">{formatMoney(sale.total)}</p>
      </div>
      <p className="mt-0.5 text-xs text-[#3A4D4A]">
        {METHOD_LABEL[sale.paymentMethod]}, {CHANNEL_LABEL[sale.channel]}, {hourFormat.format(new Date(sale.createdAt))}
        {pending && <span className="ml-2 font-bold text-[#8A5A12]">Pago pendiente</span>}
      </p>
      <div className="mt-2">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`Anular venta #${sale.number}`}
          onClick={() => setOpen((v) => !v)}
          className={`${saleButton} border border-[#C23A2B] bg-white text-[#9B2C20] hover:bg-[#FFE7E2]`}
        >
          Anular
        </button>
      </div>
      {open && <CancelSalePanel saleId={sale.saleId} onCancelled={onChanged} />}
    </li>
  );
}

/** "Ventas de hoy" del dueño: el único lugar para anular una venta ya pagada. */
export function RecentSales({ sales, ...rest }: Props) {
  if (sales.length === 0) return <p className="text-sm text-[#3A4D4A]">Todavía no hay ventas hoy.</p>;
  return (
    <ul className="space-y-2">
      {sales.map((s) => (
        <RecentRow key={s.saleId} sale={s} {...rest} />
      ))}
    </ul>
  );
}

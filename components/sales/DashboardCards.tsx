import type { DashboardData } from "@/lib/data/sales-source";
import { CHANNEL_LABEL, METHOD_LABEL, shortDate } from "@/lib/sales/format";
import { formatPrice } from "@/lib/public/format";

const card = "rounded-[14px] border border-borde-control bg-white";

function Stat({
  label,
  value,
  testId,
  tone,
  className = "",
}: {
  label: string;
  value: string;
  testId: string;
  tone?: "teal";
  className?: string;
}) {
  return (
    <div className={`${card} p-3 ${className}`}>
      <p className="text-xs text-tinta">{label}</p>
      <p
        data-testid={testId}
        className={`mt-1 font-data-mono tabular-nums text-lg font-extrabold leading-tight ${tone === "teal" ? "text-turquesa-texto" : "text-tinta"}`}
      >
        {value}
      </p>
    </div>
  );
}

function DayBars({ days }: { days: DashboardData["byDay"] }) {
  if (days.length === 0) return <p className="text-sm text-tinta">Sin ventas en este periodo.</p>;
  const max = Math.max(...days.map((d) => d.total), 0);
  const best = max > 0 ? days.find((d) => d.total === max) : undefined;
  return (
    <div>
      <ul aria-label="Ventas por día" className="flex h-32 items-end gap-1">
        {days.map((d) => (
          <li
            key={d.date}
            aria-label={`${shortDate(d.date)}: ${formatPrice(d.total)}, ${d.count} ${d.count === 1 ? "venta" : "ventas"}`}
            title={`${shortDate(d.date)}: ${formatPrice(d.total)}`}
            className="flex h-full min-w-0 max-w-10 flex-1 items-end"
          >
            <span
              aria-hidden="true"
              className="block w-full rounded-t-[4px] bg-turquesa"
              style={{ height: `${max > 0 ? Math.max((d.total / max) * 100, 2) : 2}%` }}
            />
          </li>
        ))}
      </ul>
      <div className="mt-1 flex justify-between font-data-mono tabular-nums text-xs text-tinta" aria-hidden="true">
        <span>{shortDate(days[0].date)}</span>
        {days.length > 1 && <span>{shortDate(days[days.length - 1].date)}</span>}
      </div>
      {best && (
        <p className="mt-2 font-data-mono tabular-nums text-xs text-tinta">
          Mejor día: {shortDate(best.date)} {formatPrice(best.total)}
        </p>
      )}
    </div>
  );
}

type Row = { key: string; label: string; total: number; hint?: string };

function Breakdown({ title, rows }: { title: string; rows: Row[] }) {
  const max = Math.max(...rows.map((r) => r.total), 0);
  return (
    <section className={`${card} p-3`}>
      <h2 className="text-sm font-bold text-tinta">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-tinta">Sin datos.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-tinta">
                  {r.label}
                  {r.hint && <span className="ml-1 text-xs text-tinta">{r.hint}</span>}
                </span>
                <span className="flex-none font-data-mono tabular-nums text-xs font-bold text-tinta">{formatPrice(r.total)}</span>
              </div>
              <div aria-hidden="true" className="mt-1 h-1.5 rounded-full bg-niebla">
                <div className="h-full rounded-full bg-turquesa" style={{ width: `${max > 0 ? (r.total / max) * 100 : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Props = { data: DashboardData; locationNames: Record<string, string>; namesReady?: boolean };

export function DashboardCards({ data, locationNames, namesReady = true }: Props) {
  const units = (n: number) => `${n} ${n === 1 ? "pieza" : "piezas"}`;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        <Stat label="Vendido" value={formatPrice(data.soldTotal)} testId="card-vendido" tone="teal" className="col-span-2" />
        <Stat label="Cobrado" value={formatPrice(data.collectedTotal)} testId="card-cobrado" />
        <Stat label="Ventas" value={String(data.salesCount)} testId="card-ventas" />
      </div>

      <section className={`${card} p-3`}>
        <h2 className="mb-3 text-sm font-bold text-tinta">Vendido por día</h2>
        <DayBars days={data.byDay} />
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Breakdown
          title="Por tienda"
          rows={data.byLocation.map((r) => ({
            key: r.locationId,
            label: locationNames[r.locationId] ?? (namesReady ? "Tienda sin nombre" : "…"),
            total: r.total,
          }))}
        />
        <Breakdown title="Por canal" rows={data.byChannel.map((r) => ({ key: r.channel, label: CHANNEL_LABEL[r.channel], total: r.total }))} />
        <Breakdown
          title="Por método de pago"
          rows={data.byPaymentMethod.map((r) => ({ key: r.method, label: METHOD_LABEL[r.method], total: r.total }))}
        />
        <Breakdown
          title="Por marca"
          rows={data.byBrand.map((r) => ({ key: r.brandId ?? "none", label: r.name, total: r.total, hint: units(r.units) }))}
        />
        <Breakdown
          title="Por departamento"
          rows={data.byDepartment.map((r) => ({ key: r.departmentId ?? "none", label: r.name, total: r.total, hint: units(r.units) }))}
        />
      </div>
    </div>
  );
}

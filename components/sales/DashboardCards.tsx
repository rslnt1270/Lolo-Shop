import type { DashboardData } from "@/lib/data/sales-source";
import { CHANNEL_LABEL, METHOD_LABEL, formatMoney, shortDate } from "@/lib/sales/format";

const card = "rounded-[14px] border border-[rgba(18,33,31,0.12)] bg-white";

function Stat({ label, value, testId, tone }: { label: string; value: string; testId: string; tone?: "teal" }) {
  return (
    <div className={`${card} p-3`}>
      <p className="text-xs text-[#3A4D4A]">{label}</p>
      <p
        data-testid={testId}
        className={`mt-1 break-words text-lg font-extrabold leading-tight ${tone === "teal" ? "text-[#147E7E]" : "text-[#12211F]"}`}
      >
        {value}
      </p>
    </div>
  );
}

function DayBars({ days }: { days: DashboardData["byDay"] }) {
  if (days.length === 0) return <p className="text-sm text-[#3A4D4A]">Sin ventas en este periodo.</p>;
  const max = Math.max(...days.map((d) => d.total), 0);
  return (
    <div>
      <ul aria-label="Ventas por día" className="flex h-32 items-end gap-1">
        {days.map((d) => (
          <li
            key={d.date}
            aria-label={`${shortDate(d.date)}: ${formatMoney(d.total)}, ${d.count} ${d.count === 1 ? "venta" : "ventas"}`}
            title={`${shortDate(d.date)}: ${formatMoney(d.total)}`}
            className="flex h-full min-w-0 max-w-10 flex-1 items-end"
          >
            <span
              aria-hidden="true"
              className="block w-full rounded-t-[4px] bg-[#147E7E]"
              style={{ height: `${max > 0 ? Math.max((d.total / max) * 100, 2) : 2}%` }}
            />
          </li>
        ))}
      </ul>
      <div className="mt-1 flex justify-between font-mono text-xs text-[#3A4D4A]" aria-hidden="true">
        <span>{shortDate(days[0].date)}</span>
        {days.length > 1 && <span>{shortDate(days[days.length - 1].date)}</span>}
      </div>
    </div>
  );
}

type Row = { key: string; label: string; total: number; hint?: string };

function Breakdown({ title, rows }: { title: string; rows: Row[] }) {
  const max = Math.max(...rows.map((r) => r.total), 0);
  return (
    <section className={`${card} p-3`}>
      <h2 className="text-sm font-bold text-[#12211F]">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-[#3A4D4A]">Sin datos.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-[#12211F]">
                  {r.label}
                  {r.hint && <span className="ml-1 text-xs text-[#3A4D4A]">{r.hint}</span>}
                </span>
                <span className="flex-none font-mono text-xs font-bold text-[#12211F]">{formatMoney(r.total)}</span>
              </div>
              <div aria-hidden="true" className="mt-1 h-1.5 rounded-full bg-[#E6F2F1]">
                <div className="h-full rounded-full bg-[#147E7E]" style={{ width: `${max > 0 ? (r.total / max) * 100 : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Props = { data: DashboardData; locationNames: Record<string, string> };

export function DashboardCards({ data, locationNames }: Props) {
  const units = (n: number) => `${n} ${n === 1 ? "pieza" : "piezas"}`;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Vendido" value={formatMoney(data.soldTotal)} testId="card-vendido" tone="teal" />
        <Stat label="Cobrado" value={formatMoney(data.collectedTotal)} testId="card-cobrado" />
        <Stat label="Ventas" value={String(data.salesCount)} testId="card-ventas" />
      </div>

      <section className={`${card} p-3`}>
        <h2 className="mb-3 text-sm font-bold text-[#12211F]">Vendido por día</h2>
        <DayBars days={data.byDay} />
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Breakdown
          title="Por tienda"
          rows={data.byLocation.map((r) => ({
            key: r.locationId,
            label: locationNames[r.locationId] ?? "Tienda sin nombre",
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

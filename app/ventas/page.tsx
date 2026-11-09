"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ShoppingCart } from "lucide-react";
import type { DashboardData, DashboardQuery } from "@/lib/data/sales-source";
import { fetchLocationsAction } from "@/lib/actions";
import { getDashboardAction, getLowStockThresholdAction } from "@/lib/sales/dashboard-actions";
import { DashboardCards } from "@/components/sales/DashboardCards";
import { PendingPayments } from "@/components/sales/PendingPayments";
import { RecentSales } from "@/components/sales/RecentSales";
import { LowStockTable } from "@/components/sales/LowStockTable";
import { RangePicker, presetRange, type RangePreset } from "@/components/sales/RangePicker";
import { shortDate } from "@/lib/sales/format";

type Loaded = { query: DashboardQuery; data: DashboardData };

export default function VentasPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isCollaborator = role === "collaborator";

  const [preset, setPreset] = useState<RangePreset>("today");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [locationNames, setLocationNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // Descarta respuestas de una petición vieja si el usuario cambió el rango mientras cargaba.
  const requestId = useRef(0);
  const rangeRef = useRef<{ from: string; to: string }>(presetRange("today"));

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const [result, th] = await Promise.all([getDashboardAction(rangeRef.current), getLowStockThresholdAction()]);
      if (id !== requestId.current) return;
      setLoaded(result);
      setThreshold(th);
      setError(null);
    } catch {
      if (id === requestId.current) setError("No se pudo cargar el tablero. Intenta de nuevo.");
    }
  }, []);

  useEffect(() => {
    load();
    fetchLocationsAction()
      .then((locs) => setLocationNames(Object.fromEntries(locs.map((l) => [l.id, l.name]))))
      .catch(() => undefined);
  }, [load]);

  function changeRange(next: RangePreset, range: { from: string; to: string }) {
    setPreset(next);
    rangeRef.current = range;
    load();
  }

  const period = useMemo(() => {
    if (!loaded) return "";
    const { from, to } = loaded.query;
    if (isCollaborator) return "Hoy";
    return from === to ? shortDate(from) : `${shortDate(from)} al ${shortDate(to)}`;
  }, [loaded, isCollaborator]);

  const canConfirm = role === "owner" || role === "manager";
  const canCancel = role === "owner";

  return (
    <main className="mx-auto max-w-2xl pb-24 md:pb-8">
      <div className="flex items-center justify-between gap-3 bg-gradient-to-br from-loloteal to-[#147E7E] px-5 pb-8 pt-6 text-white">
        <div>
          <h1 className="text-lg font-extrabold leading-tight">Ventas</h1>
          <p className="mt-0.5 text-sm text-white/90">{isCollaborator ? "Hoy" : period || "Cargando…"}</p>
        </div>
        <Link
          href="/pos"
          className="inline-flex min-h-11 flex-none items-center gap-2 rounded-[11px] bg-white px-4 text-sm font-extrabold text-[#0B5E5E] hover:bg-[#E6F2F1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <ShoppingCart size={18} strokeWidth={2.5} aria-hidden="true" />
          Vender
        </Link>
      </div>

      <div className="-mt-3 space-y-5 rounded-t-2xl bg-[#F4FBFA] px-4 pb-6 pt-4">
        {role && !isCollaborator && (
          <RangePicker preset={preset} from={rangeRef.current.from} to={rangeRef.current.to} onChange={changeRange} />
        )}

        {error && (
          <p role="alert" className="rounded-[11px] bg-[#FFE7E2] p-3 text-sm font-bold text-[#9B2C20]">
            {error}
          </p>
        )}

        {!loaded && !error && (
          <p role="status" className="text-sm text-[#3A4D4A]">
            Cargando ventas…
          </p>
        )}

        {loaded && threshold !== null && (
          <>
            <DashboardCards data={loaded.data} locationNames={locationNames} />

            <section aria-labelledby="pendientes-h">
              <h2 id="pendientes-h" className="mb-2 text-sm font-bold text-[#12211F]">
                Cobros pendientes
              </h2>
              <PendingPayments
                sales={loaded.data.pendingPayments}
                locationNames={locationNames}
                canConfirm={canConfirm}
                canCancel={canCancel}
                onChanged={load}
              />
            </section>

            {canCancel && loaded.data.recentSales && (
              <section aria-labelledby="hoy-h">
                <h2 id="hoy-h" className="mb-2 text-sm font-bold text-[#12211F]">
                  Ventas de hoy
                </h2>
                <RecentSales sales={loaded.data.recentSales} locationNames={locationNames} onChanged={load} />
              </section>
            )}

            <section aria-labelledby="stock-h">
              <h2 id="stock-h" className="mb-2 text-sm font-bold text-[#12211F]">
                Stock bajo
              </h2>
              <LowStockTable
                rows={loaded.data.lowStock}
                threshold={threshold}
                locationNames={locationNames}
                canEditThreshold={role === "owner"}
                onThresholdSaved={load}
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}

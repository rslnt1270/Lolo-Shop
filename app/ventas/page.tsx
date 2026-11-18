"use client";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/button-classes";
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
import { StaffLoadState, type StaffLoadStatus } from "@/components/layout/StaffLoadState";
import { LoginLink, SESSION_EXPIRED_TEXT } from "@/components/sales/session-expired";
import { isSessionResult, withSession } from "@/lib/client/with-session";
import { useWorkLocation } from "@/lib/client/use-work-location";
import { WorkLocationPicker } from "@/components/layout/WorkLocationPicker";

type Loaded = { query: DashboardQuery; data: DashboardData };

export default function VentasPage() {
  const { data: session, status: sessionStatus } = useSession();
  const role = session?.user?.role;
  const isCollaborator = role === "collaborator";
  // El colaborador ve el día de la tienda donde está; dueño y encargado usan su filtro de siempre.
  const work = useWorkLocation({
    assigned: session?.user?.locationId ?? null,
    enabled: sessionStatus === "authenticated" && isCollaborator,
  });
  const workLocation = isCollaborator ? work.locationId : "";

  const [preset, setPreset] = useState<RangePreset>("today");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [locationNames, setLocationNames] = useState<Record<string, string>>({});
  const [namesReady, setNamesReady] = useState(false);
  const [state, setState] = useState<StaffLoadStatus>("loading");
  const [loading, setLoading] = useState(true);
  // Descarta respuestas de una petición vieja si el usuario cambió el rango mientras cargaba.
  const requestId = useRef(0);
  const rangeRef = useRef<{ from: string; to: string }>(presetRange("today"));
  const workLocationRef = useRef(workLocation);
  workLocationRef.current = workLocation;

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const [result, th] = await Promise.all([
        getDashboardAction(
          workLocationRef.current ? { ...rangeRef.current, locationIds: [workLocationRef.current] } : rangeRef.current,
        ).then(withSession),
        getLowStockThresholdAction(),
      ]);
      if (id !== requestId.current) return;
      // Sin valor: con la sesión vencida el middleware redirige y Next resuelve la acción sin valor.
      if (isSessionResult(result) || "error" in result || th === null || th === undefined) {
        setState("session");
      } else {
        setLoaded(result);
        setThreshold(th);
        setState("ready");
      }
    } catch {
      if (id === requestId.current) setState("error");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  // Se pide al saber el rol; el colaborador espera a tener tienda y cambiarla vuelve a pedir.
  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (isCollaborator && !workLocation) return;
    void load();
  }, [sessionStatus, isCollaborator, workLocation, load]);

  useEffect(() => {
    fetchLocationsAction()
      .then((locs) => setLocationNames(Object.fromEntries((locs ?? []).map((l) => [l.id, l.name]))))
      .catch(() => undefined)
      .finally(() => setNamesReady(true));
  }, []);

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

  if (isCollaborator && (work.status === "error" || work.status === "session")) {
    return <StaffLoadState state={work.status} retry={work.retry} />;
  }
  // Colaborador sin tienda elegida: solo el selector, sin cifras.
  const needsStore = isCollaborator && work.status === "ready" && !workLocation;
  const busy = loading && !needsStore;

  // Sin datos todavía: carga, sesión vencida o error a pantalla completa (nunca ceros falsos).
  if (!loaded && state !== "ready" && !needsStore) {
    return <StaffLoadState state={state} retry={load} />;
  }

  return (
    <main className="mx-auto max-w-2xl pb-8">
      <div className="flex items-center justify-between gap-3 bg-turquesa-texto px-5 pb-8 pt-6 text-white">
        <div>
          <h1 className="text-lg font-extrabold leading-tight">Ventas</h1>
          <p className="mt-0.5 text-sm text-white">{isCollaborator ? "Hoy" : period}</p>
        </div>
        <Link href="/pos" className={`${buttonClasses("primary")} flex-none font-extrabold`}>
          <ShoppingCart size={18} strokeWidth={2.5} aria-hidden="true" />
          Vender
        </Link>
      </div>

      <div
        aria-busy={busy}
        className={`-mt-3 space-y-5 rounded-t-2xl bg-niebla px-4 pb-6 pt-4 transition-opacity motion-reduce:transition-none ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        {isCollaborator && (
          <WorkLocationPicker value={workLocation} locations={work.locations} onChange={work.choose} />
        )}

        {role && !isCollaborator && (
          <RangePicker preset={preset} from={rangeRef.current.from} to={rangeRef.current.to} onChange={changeRange} />
        )}

        {state === "session" && (
          <p role="alert" className="rounded-[11px] bg-niebla p-3 text-sm font-bold text-agotado">
            {SESSION_EXPIRED_TEXT} <LoginLink />
          </p>
        )}

        {state === "error" && (
          <div role="alert" className="space-y-2 rounded-[11px] bg-niebla p-3 text-sm font-bold text-agotado">
            <p>No se pudo actualizar. Estas cifras pueden estar desfasadas.</p>
            <Button onClick={() => void load()}>
              Reintentar
            </Button>
          </div>
        )}

        {loaded && threshold !== null && (
          <>
            {role === "owner" && loaded.data.pendingReviewCount > 0 && (
              <Link
                href="/ventas/revision"
                className="flex min-h-11 items-center justify-between gap-2 rounded-[14px] border border-agotado bg-white px-4 py-3 text-sm font-bold text-agotado focus-visible:outline focus-visible:outline-2 focus-visible:outline-turquesa-texto"
              >
                <span>
                  {loaded.data.pendingReviewCount === 1
                    ? "1 venta sin internet por aprobar"
                    : `${loaded.data.pendingReviewCount} ventas sin internet por aprobar`}
                </span>
                <span aria-hidden="true">Revisar</span>
              </Link>
            )}

            <DashboardCards data={loaded.data} locationNames={locationNames} namesReady={namesReady} />

            <section aria-labelledby="pendientes-h">
              <h2 id="pendientes-h" className="mb-2 text-sm font-bold text-tinta">
                Cobros pendientes
              </h2>
              <PendingPayments
                sales={loaded.data.pendingPayments}
                locationNames={locationNames}
                namesReady={namesReady}
                canConfirm={canConfirm}
                canCancel={canCancel}
                onChanged={load}
              />
            </section>

            {canCancel && loaded.data.recentSales && (
              <section aria-labelledby="hoy-h">
                <h2 id="hoy-h" className="mb-2 text-sm font-bold text-tinta">
                  Ventas de hoy
                </h2>
                <RecentSales sales={loaded.data.recentSales} locationNames={locationNames} namesReady={namesReady} onChanged={load} />
              </section>
            )}

            <section aria-labelledby="stock-h">
              <h2 id="stock-h" className="mb-2 text-sm font-bold text-tinta">
                Stock bajo
              </h2>
              <LowStockTable
                rows={loaded.data.lowStock}
                threshold={threshold}
                locationNames={locationNames}
                namesReady={namesReady}
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

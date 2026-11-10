"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowLeftRight, CirclePlus, RotateCcw, ShoppingBag, SlidersHorizontal, Trash2, Search, X } from "lucide-react";
import type { MovementPage, MovementRow } from "@/lib/data/source";
import type { ProductSearchHit } from "@/lib/data/source";
import { MOVEMENT_TYPES, MOVEMENT_TYPE_LABEL, type MovementType } from "@/lib/domain/types";
import { listMovementsAction, movementFilterOptionsAction, type MovementFilterOptions } from "@/lib/inventory/movement-actions";
import { fetchProductsAction, getProductByBarcodeAction, searchProductsAction } from "@/lib/actions";
import { businessTodayMx } from "@/lib/sales/format";
import { LoginLink, SESSION_EXPIRED_TEXT, isSessionExpired } from "@/components/sales/session-expired";
import { Scanner } from "@/components/inventory/Scanner";
import { ManualCodeEntry } from "@/components/inventory/ManualCodeEntry";

const field =
  "min-h-11 w-full rounded-[11px] border border-[rgba(18,33,31,0.25)] bg-white px-3 text-base text-[#12211F] disabled:bg-gray-100 disabled:text-gray-600";
const label = "block text-sm font-medium text-gray-700";

const TYPE_STYLE: Record<MovementType, { icon: typeof Trash2; cls: string }> = {
  SALE: { icon: ShoppingBag, cls: "bg-slate-100 text-slate-800" },
  RESTOCK: { icon: CirclePlus, cls: "bg-emerald-50 text-emerald-800" },
  DAMAGE: { icon: Trash2, cls: "bg-red-50 text-[#9A3B2E]" },
  ADJUSTMENT: { icon: SlidersHorizontal, cls: "bg-blue-50 text-blue-800" },
  TRANSFER: { icon: ArrowLeftRight, cls: "bg-gray-100 text-gray-800" },
  RETURN: { icon: RotateCcw, cls: "bg-amber-50 text-amber-800" },
};

/** "10 nov · 14:10" en hora de México. */
export function formatMexicoTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${get("month").replace(".", "")} · ${get("hour")}:${get("minute")}`;
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

function detail(r: MovementRow): string | null {
  if (r.type === "SALE") return r.saleNumber !== null ? `Folio V-${String(r.saleNumber).padStart(4, "0")}` : null;
  if (!r.notes) return null;
  return r.type === "TRANSFER" ? `Nota: ${r.notes}` : `Motivo: ${r.notes}`;
}

interface Filters {
  locationId: string;
  type: string;
  userId: string;
  from: string;
  to: string;
}

function emptyFilters(): Filters {
  const today = businessTodayMx();
  return { locationId: "", type: "", userId: "", from: today, to: today };
}

type Prenda = { variantId: string; label: string } | null;

export function MovementList() {
  const { data: session } = useSession();
  const isCollaborator = session?.user?.role === "collaborator";

  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [prenda, setPrenda] = useState<Prenda>(null);
  const [options, setOptions] = useState<MovementFilterOptions>({ locations: [], users: [] });
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    movementFilterOptionsAction().then((o) => o && setOptions(o)).catch(() => {});
  }, []);

  const toFilter = useCallback(
    (cursor?: string) => ({
      locationId: filters.locationId || undefined,
      type: filters.type || undefined,
      userId: filters.userId || undefined,
      variantId: prenda?.variantId,
      from: filters.from,
      to: filters.to,
      cursor,
    }),
    [filters, prenda],
  );

  // Cada cambio de filtro vuelve a la primera página; una respuesta vieja se descarta.
  useEffect(() => {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    listMovementsAction(toFilter())
      .then((res) => {
        if (id !== request.current) return;
        if (isSessionExpired(res)) return void setExpired(true);
        setExpired(false);
        if ("error" in (res as object)) {
          setRows([]);
          setNextCursor(null);
          setError((res as { error: string }).error);
          return;
        }
        const page = res as MovementPage;
        setRows(page.rows);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (id !== request.current) return;
        setRows([]);
        setNextCursor(null);
        setError("No se pudo cargar el historial. Revisa tu conexión e intenta de nuevo.");
      })
      .finally(() => {
        if (id === request.current) setLoading(false);
      });
  }, [toFilter]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    const id = request.current;
    setLoadingMore(true);
    try {
      const res = await listMovementsAction(toFilter(nextCursor));
      if (id !== request.current) return;
      if (isSessionExpired(res)) return void setExpired(true);
      if ("error" in (res as object)) return void setError((res as { error: string }).error);
      const page = res as MovementPage;
      setRows((prev) => [...prev, ...page.rows]);
      setNextCursor(page.nextCursor);
    } catch {
      setError("No se pudo cargar más. Intenta de nuevo.");
    } finally {
      setLoadingMore(false);
    }
  }

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const today = businessTodayMx();
  const isToday = filters.from === today && filters.to === today;
  const dirty = !!(filters.locationId || filters.type || filters.userId || prenda || !isToday);

  if (expired) {
    return (
      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-[#9A3B2E]">
        {SESSION_EXPIRED_TEXT} <LoginLink />
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <section aria-label="Filtros" className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mv-tienda" className={label}>Tienda</label>
            <select
              id="mv-tienda"
              className={field}
              disabled={isCollaborator}
              value={isCollaborator ? "" : filters.locationId}
              onChange={(e) => set({ locationId: e.target.value })}
            >
              {isCollaborator ? (
                <option value="">Tu tienda</option>
              ) : (
                <>
                  <option value="">Todas</option>
                  {options.locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </>
              )}
            </select>
          </div>
          <div>
            <label htmlFor="mv-tipo" className={label}>Tipo</label>
            <select id="mv-tipo" className={field} value={filters.type} onChange={(e) => set({ type: e.target.value })}>
              <option value="">Todos</option>
              {MOVEMENT_TYPES.map((t) => (
                <option key={t} value={t}>{MOVEMENT_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </div>
          {!isCollaborator && (
            <div className="col-span-2">
              <label htmlFor="mv-persona" className={label}>Persona</label>
              <select id="mv-persona" className={field} value={filters.userId} onChange={(e) => set({ userId: e.target.value })}>
                <option value="">Todas</option>
                {options.users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="mv-desde" className={label}>Desde</label>
            <input
              id="mv-desde"
              type="date"
              className={field}
              disabled={isCollaborator}
              max={filters.to}
              value={filters.from}
              onChange={(e) => e.target.value && set({ from: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="mv-hasta" className={label}>Hasta</label>
            <input
              id="mv-hasta"
              type="date"
              className={field}
              disabled={isCollaborator}
              min={filters.from}
              value={filters.to}
              onChange={(e) => e.target.value && set({ to: e.target.value })}
            />
          </div>
        </div>
        {isCollaborator && <p className="text-sm text-gray-600">Solo tu tienda y el día de hoy.</p>}
        {error && (
          <p role="alert" className="text-sm font-medium text-[#9A3B2E]">{error}</p>
        )}
        <PrendaFilter value={prenda} onChange={setPrenda} />
        <div className="flex items-center justify-between gap-3 text-sm text-gray-600">
          <p>
            {isToday ? "Mostrando hoy" : `Mostrando del ${filters.from} al ${filters.to}`} · hora de México
          </p>
          {dirty && !isCollaborator && (
            <button
              type="button"
              onClick={() => {
                setFilters(emptyFilters());
                setPrenda(null);
              }}
              className="min-h-11 px-2 font-semibold text-loloteal active:text-loloteal-dark"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </section>

      {loading ? (
        <p role="status" className="py-8 text-center text-sm text-gray-600">Cargando…</p>
      ) : rows.length === 0 ? (
        !error && <p className="py-8 text-center text-sm text-gray-600">No hay movimientos con estos filtros.</p>
      ) : (
        <ul className="divide-y divide-gray-200 border-y border-gray-200">
          {rows.map((r) => {
            const { icon: Icon, cls } = TYPE_STYLE[r.type];
            const d = detail(r);
            return (
              <li key={r.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-gray-600">{formatMexicoTime(r.timestamp)}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium ${cls}`}>
                    <Icon aria-hidden="true" className="h-4 w-4" />
                    {r.typeLabel}
                  </span>
                </div>
                <span className={`text-right font-mono text-lg font-bold ${r.delta < 0 ? "text-[#9A3B2E]" : "text-loloteal"}`}>
                  {signed(r.delta)}
                </span>
                <p className="font-semibold text-[#12211F]">
                  {r.productTitle} · <span className="font-mono">{r.size}</span>
                </p>
                <p className="text-right text-sm text-gray-600">{r.locationName}</p>
                <p className="col-span-2 text-sm text-gray-600">
                  {r.userName}
                  {d && <> · {d}</>}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor && !loading && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="min-h-11 w-full rounded-full border-2 border-loloteal bg-white px-4 font-semibold text-loloteal transition active:bg-gray-100 disabled:opacity-60 motion-reduce:transition-none"
        >
          {loadingMore ? "Cargando…" : "Ver más"}
        </button>
      )}
    </div>
  );
}

/** Filtro de prenda: escanear o escribir un código, o buscar por título/marca/código público y elegir talla. */
function PrendaFilter({ value, onChange }: { value: Prenda; onChange: (p: Prenda) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductSearchHit[]>([]);
  const [sizes, setSizes] = useState<{ title: string; variants: { id: string; size: string }[] } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return void setHits([]);
    let alive = true;
    const t = setTimeout(() => {
      searchProductsAction(q)
        .then((res) => alive && setHits(res ?? []))
        .catch(() => alive && setMessage("No se pudo buscar. Intenta de nuevo."));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  function choose(variantId: string, title: string, size: string) {
    onChange({ variantId, label: `${title} · ${size}` });
    setOpen(false);
    setQuery("");
    setHits([]);
    setSizes(null);
    setMessage(null);
  }

  async function onCode(code: string) {
    setMessage(null);
    try {
      const match = await getProductByBarcodeAction(code);
      if (!match) return void setMessage("No encontramos una prenda con ese código.");
      choose(match.variant.id, match.product.title, match.variant.size);
    } catch {
      setMessage("No se pudo buscar. Intenta de nuevo.");
    }
  }

  async function pickProduct(hit: ProductSearchHit) {
    setMessage(null);
    try {
      const products = await fetchProductsAction();
      const p = products?.find((x) => x.id === hit.productId);
      if (!p) return void setMessage("No se encontró el producto.");
      setSizes({ title: p.title, variants: p.variants.filter((v) => v.isActive !== false).map((v) => ({ id: v.id, size: v.size })) });
    } catch {
      setMessage("No se pudo cargar las tallas. Intenta de nuevo.");
    }
  }

  return (
    <div className="space-y-2">
      {value ? (
        <p className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1 text-sm">
          <span>Prenda: <strong>{value.label}</strong></span>
          <button type="button" aria-label="Quitar filtro de prenda" onClick={() => onChange(null)} className="flex h-11 w-11 items-center justify-center text-gray-600">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </p>
      ) : (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="min-h-11 w-full rounded-full border border-loloteal bg-white px-4 font-semibold text-loloteal active:bg-gray-100"
        >
          Filtrar por prenda
        </button>
      )}

      {open && !value && (
        <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-3">
          <Scanner onScan={onCode} />
          <ManualCodeEntry onSubmit={onCode} onNoBarcode={() => setOpen(false)} />
          <div className="relative">
            <label htmlFor="mv-buscar" className="sr-only">Buscar prenda</label>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
            <input
              id="mv-buscar"
              type="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busca por título, marca o código público"
              className={`${field} rounded-full pl-10`}
            />
          </div>
          {message && <p role="status" className="text-sm text-[#9A3B2E]">{message}</p>}
          {sizes ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold">{sizes.title}: elige la talla</p>
              <div className="flex flex-wrap gap-2">
                {sizes.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => choose(v.id, sizes.title, v.size)}
                    className="min-h-11 min-w-11 rounded-full border border-loloteal px-3 font-mono text-sm text-loloteal active:bg-gray-100"
                  >
                    {v.size}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="space-y-1">
              {hits.map((h) => (
                <li key={h.productId}>
                  <button
                    type="button"
                    onClick={() => pickProduct(h)}
                    className="min-h-11 w-full rounded-xl border border-gray-200 px-3 text-left active:bg-gray-100"
                  >
                    <span className="font-semibold">{h.title}</span>
                    <span className="ml-2 text-sm text-gray-600">{h.brand}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

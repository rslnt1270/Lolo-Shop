"use client";
import { useEffect, useMemo, useState } from "react";
import { StaffLoadState, useStaffData } from "@/components/layout/StaffLoadState";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { Location, Product } from "@/lib/domain/types";
import { filterProducts } from "@/lib/data/filter";
import { SearchFilter } from "@/components/products/SearchFilter";
import { ProductCard } from "@/components/products/ProductCard";
import { ProductPhotoButton } from "@/components/products/ProductPhotoButton";
import { ProductAdminSheet } from "@/components/products/ProductAdminSheet";
import { fetchLocationsAction, fetchProductsAction } from "@/lib/actions";
import { listDepartmentsAction, type DepartmentOption } from "@/lib/catalog/actions";
import { assignDepartmentAction } from "@/lib/products/actions";
import { withSession } from "@/lib/client/with-session";
import { ActionErrorText } from "@/components/sales/session-expired";
import { PRODUCT_CATEGORIES } from "@/lib/domain/new-product";

const CATEGORIES = [...PRODUCT_CATEGORIES];

export default function ProductosPage() {
  const { state, data, retry, setData } = useStaffData<Product[]>(() => fetchProductsAction());
  const products = useMemo(() => data ?? [], [data]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isStaff = role === "owner" || role === "manager";
  const [locations, setLocations] = useState<Pick<Location, "id" | "name">[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [targetDept, setTargetDept] = useState("");
  const [assignMsg, setAssignMsg] = useState<{ ok: boolean; text: string; session?: boolean } | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);

  const reload = () => fetchProductsAction().then((r) => r && setData(r));

  useEffect(() => {
    if (!isStaff) return;
    fetchLocationsAction().then((r) => setLocations(r ?? [])).catch(() => undefined);
    listDepartmentsAction().then((r) => setDepartments(r ?? [])).catch(() => undefined);
  }, [isStaff]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const assign = async () => {
    if (!targetDept || selected.length === 0 || assignBusy) return;
    setAssignBusy(true);
    setAssignMsg(null);
    try {
      const res = withSession(await assignDepartmentAction(selected, targetDept));
      if (res.ok) {
        const name = departments.find((d) => d.id === targetDept)?.name ?? "el departamento";
        setAssignMsg({ ok: true, text: `${res.updated ?? selected.length} productos pasaron a ${name}.` });
        setSelected([]);
        setAssigning(false);
        setTargetDept("");
        await reload();
      } else {
        setAssignMsg({ ok: false, text: res.message, session: res.code === "SESSION" });
      }
    } catch {
      setAssignMsg({ ok: false, text: "No se pudo asignar. Revisa tu conexión e intenta de nuevo." });
    } finally {
      setAssignBusy(false);
    }
  };

  const openProduct = products.find((p) => p.id === openId) ?? null;

  const visible = useMemo(
    () => filterProducts(products, query, category),
    [products, query, category]
  );

  if (state !== "ready") return <StaffLoadState state={state} retry={retry} />;

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-xl font-bold">Productos</h1>
      {role === "owner" && (
        <Link
          href="/productos/unir"
          className="inline-flex min-h-[44px] items-center rounded-lg border border-loloteal px-4 text-sm font-semibold text-loloteal focus:outline-none focus-visible:ring-2 focus-visible:ring-loloteal"
        >
          Unir duplicados por talla
        </Link>
      )}
      <SearchFilter categories={CATEGORIES} onQuery={setQuery} onCategory={setCategory} />
      <div className="grid gap-3">
        {visible.map((p) => (
          <div key={p.id} className="space-y-1">
            <ProductCard product={p} />
            {isStaff && (
              <div className="flex flex-wrap items-center gap-x-4">
                <label className="inline-flex min-h-[44px] items-center gap-2 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={() => toggle(p.id)}
                    aria-label={`Seleccionar ${p.title}`}
                    className="h-5 w-5 rounded border-gray-400 accent-loloteal"
                  />
                  Seleccionar
                </label>
                <button
                  type="button"
                  onClick={() => setOpenId(p.id)}
                  aria-label={`Abrir la ficha de ${p.title}`}
                  className="min-h-[44px] rounded-lg px-2 text-sm font-semibold text-loloteal underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-loloteal"
                >
                  Ver ficha
                </button>
                {p.isActive === false && <span className="text-xs font-semibold text-gray-600">Inactivo</span>}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-2">
              <ProductPhotoButton
                productId={p.id}
                productTitle={p.title}
                hasImage={!!p.imageUrl}
                onUpdated={() => void reload()}
              />
              <ProductPhotoButton
                productId={p.id}
                productTitle={p.title}
                side="back"
                hasImage={!!p.backImageUrl}
                onUpdated={() => void reload()}
              />
              {!(p.imageUrl && p.backImageUrl) && (
                <span className="text-xs text-gray-600">
                  {!p.imageUrl && !p.backImageUrl
                    ? "Faltan las dos fotos para el catálogo"
                    : !p.imageUrl
                      ? "Falta la foto de frente"
                      : "Falta la foto de atrás"}
                </span>
              )}
            </div>
          </div>
        ))}
        {visible.length === 0 && <p className="text-gray-500">Sin resultados.</p>}
      </div>

      <div aria-live="polite">
        {assignMsg && (
          <p
            role={assignMsg.ok ? "status" : "alert"}
            className={`rounded-lg p-3 text-sm font-semibold ${assignMsg.ok ? "bg-loloteal/10 text-loloteal" : "bg-red-50 text-[#9A3B2E]"}`}
          >
            <ActionErrorText message={assignMsg.text} session={assignMsg.session} />
          </p>
        )}
      </div>

      {isStaff && selected.length > 0 && (
        <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-gray-200 bg-white/95 p-3 backdrop-blur">
          {assigning ? (
            <div className="space-y-2">
              <label htmlFor="asignar-depto" className="block text-sm font-semibold text-gray-800">
                Departamento para {selected.length} {selected.length === 1 ? "producto" : "productos"}
              </label>
              <select
                id="asignar-depto"
                value={targetDept}
                onChange={(e) => setTargetDept(e.target.value)}
                className="block min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-loloteal"
              >
                <option value="">Elige el departamento</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAssigning(false)}
                  className="min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void assign()}
                  disabled={!targetDept || assignBusy}
                  className="min-h-[44px] rounded-lg bg-loloteal px-3 text-sm font-semibold text-white active:bg-loloteal-dark disabled:opacity-60"
                >
                  {assignBusy ? "Asignando…" : "Asignar"}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button
                type="button"
                onClick={() => {
                  setAssignMsg(null);
                  setAssigning(true);
                }}
                className="min-h-[44px] rounded-lg bg-loloteal px-4 text-sm font-semibold text-white active:bg-loloteal-dark"
              >
                Asignar departamento ({selected.length})
              </button>
              <button
                type="button"
                onClick={() => setSelected([])}
                className="min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-800"
              >
                Quitar selección
              </button>
            </div>
          )}
        </div>
      )}

      {openProduct && (
        <ProductAdminSheet
          key={openProduct.id}
          product={openProduct}
          locations={locations}
          role={role ?? "collaborator"}
          onClose={() => setOpenId(null)}
          onChanged={() => void reload()}
        />
      )}
    </main>
  );
}

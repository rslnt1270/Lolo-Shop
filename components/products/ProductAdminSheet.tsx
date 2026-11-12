"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { Location, Product, Role, Variant } from "@/lib/domain/types";
import {
  listBrandsAction, listDepartmentsAction, listProductTypesAction,
  type BrandOption, type DepartmentOption, type ProductTypeOption,
} from "@/lib/catalog/actions";
import { isAudience, typesForDepartment, type Audience } from "@/lib/domain/product-taxonomy";
import { ClassificationFields, type ClassificationValue } from "./ClassificationFields";
import {
  listPriceChangesAction,
  setProductActiveAction,
  setVariantActiveAction,
  updateProductAction,
  updateVariantPriceAction,
  type PriceChangeRow,
} from "@/lib/products/actions";
import { formatPriceChange, formatPriceShort } from "@/lib/products/format";
import { COMMA_CENTS_MESSAGE, hasCommaCents, isBigPriceDrop, isBigPriceRise, parsePriceInput } from "@/lib/products/price-input";
import { ProductPhotoButton } from "./ProductPhotoButton";
import { PublishControl } from "./PublishControl";
import { withSession } from "@/lib/client/with-session";
import { ActionErrorText } from "@/components/sales/session-expired";
import { Button } from "@/components/ui/Button";

interface Props {
  product: Product;
  locations: Pick<Location, "id" | "name" | "type" | "isPublic">[];
  /** Rol del JWT: solo decide qué se muestra. El servidor vuelve a validar en cada acción. */
  role: Role;
  onClose: () => void;
  /** Se llama tras guardar algo, para que la lista recargue los productos. */
  onChanged: () => void;
}

type Confirm = { kind: "product" } | { kind: "variant"; variantId: string };
type PriceState = {
  text: string;
  reason: string;
  baseline: number;
  error?: string;
  conflict?: number;
  saved?: boolean;
  saving?: boolean;
  /** El error es de sesión vencida: se muestra con el enlace a /login. */
  session?: boolean;
  /** Precio nuevo pendiente de confirmar porque baja a menos de la mitad del vigente. */
  confirmDrop?: number;
};

const field =
  "block min-h-[44px] w-full rounded-xl border border-borde-control bg-white px-3 text-base text-tinta focus:border-turquesa-texto focus:outline-none focus:ring-2 focus:ring-turquesa-texto";
const labelCls = "mb-1 block text-xs font-medium text-tinta/70";

const isActive = (x: { isActive?: boolean }) => x.isActive !== false;

export function ProductAdminSheet({ product, locations, role, onClose, onChanged }: Props) {
  const canEditData = role === "owner" || role === "manager";
  const canEditPrice = canEditData || role === "collaborator";

  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [title, setTitle] = useState(product.title);
  const [brandId, setBrandId] = useState(product.brandId ?? "");
  const [departmentId, setDepartmentId] = useState(product.departmentId ?? "");
  const [productTypes, setProductTypes] = useState<ProductTypeOption[]>([]);
  const [classification, setClassification] = useState<ClassificationValue>({
    productTypeId: product.productTypeId ?? "",
    style: product.style ?? null,
    audience: isAudience(product.audience) ? product.audience : null,
  });
  const [dataMsg, setDataMsg] = useState<{ ok: boolean; text: string; session?: boolean } | null>(null);
  const [savingData, setSavingData] = useState(false);

  const [prices, setPrices] = useState<Record<string, PriceState>>(() =>
    Object.fromEntries(
      product.variants.map((v) => [v.id, { text: String(v.price), reason: "", baseline: v.price } satisfies PriceState]),
    ),
  );
  const [history, setHistory] = useState<Record<string, PriceChangeRow[]>>({});
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; session?: boolean } | null>(null);

  const loadHistory = useCallback(
    async (variantId: string) => {
      const rows = await listPriceChangesAction(variantId);
      setHistory((h) => ({ ...h, [variantId]: rows ?? [] }));
    },
    [],
  );

  const variantKey = product.variants.map((v) => v.id).join(",");
  useEffect(() => {
    if (!canEditData) return;
    let cancelled = false;
    Promise.all([listBrandsAction(), listDepartmentsAction(), listProductTypesAction()])
      .then(([b, d, t]) => {
        if (cancelled) return;
        setBrands(b ?? []);
        setDepartments(d ?? []);
        setProductTypes(t ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [canEditData]);

  useEffect(() => {
    if (!canEditPrice) return;
    let cancelled = false;
    Promise.all(
      variantKey
        .split(",")
        .filter(Boolean)
        .map(async (id) => [id, (await listPriceChangesAction(id)) ?? []] as const),
    )
      .then((entries) => {
        if (!cancelled) setHistory(Object.fromEntries(entries));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [canEditPrice, variantKey]);

  const patchPrice = (id: string, p: Partial<PriceState>) =>
    setPrices((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));

  const savePrice = async (v: Variant, confirmed = false) => {
    const st = prices[v.id];
    const n = parsePriceInput(st.text);
    if (n === null) {
      patchPrice(v.id, { error: hasCommaCents(st.text) ? COMMA_CENTS_MESSAGE : "Escribe un precio válido.", conflict: undefined, saved: false, confirmDrop: undefined });
      return;
    }
    if (!confirmed && (isBigPriceDrop(st.baseline, n) || isBigPriceRise(st.baseline, n))) {
      patchPrice(v.id, { confirmDrop: n, error: undefined, saved: false });
      return;
    }
    patchPrice(v.id, { saving: true, error: undefined, session: false, conflict: undefined, saved: false, confirmDrop: undefined });
    try {
      const res = withSession(
        await updateVariantPriceAction({
          variantId: v.id,
          newPrice: n,
          expectedPrice: st.baseline,
          ...(st.reason.trim() ? { reason: st.reason.trim() } : {}),
        }),
      );
      if (res.ok) {
        patchPrice(v.id, { saving: false, baseline: res.price, text: String(res.price), reason: "", saved: true });
        onChanged();
        void loadHistory(v.id);
      } else if (res.code === "CONFLICT" && res.currentPrice !== undefined) {
        patchPrice(v.id, { saving: false, conflict: res.currentPrice, baseline: res.currentPrice });
      } else {
        patchPrice(v.id, { saving: false, error: res.message, session: res.code === "SESSION" });
      }
    } catch {
      patchPrice(v.id, { saving: false, error: "No se pudo guardar. Revisa tu conexión e intenta de nuevo." });
    }
  };

  const saveData = async () => {
    const patch: {
      productId: string; title?: string; brandId?: string; departmentId?: string;
      productTypeId?: string; style?: string | null; audience?: Audience | null;
    } = {
      productId: product.id,
    };
    if (title.trim() !== product.title) patch.title = title.trim();
    if (brandId && brandId !== (product.brandId ?? "")) patch.brandId = brandId;
    const classificationChanged =
      departmentId !== (product.departmentId ?? "") ||
      classification.productTypeId !== (product.productTypeId ?? "") ||
      classification.style !== (product.style ?? null) ||
      classification.audience !== (isAudience(product.audience) ? product.audience : null);
    if (classificationChanged) {
      // Departamento, tipo, estilo y «para» viajan juntos: el servidor los valida como un bloque.
      patch.departmentId = departmentId;
      patch.productTypeId = classification.productTypeId;
      patch.style = classification.style;
      patch.audience = classification.audience;
    }
    if (Object.keys(patch).length === 1) {
      setDataMsg({ ok: false, text: "No hay cambios que guardar." });
      return;
    }
    setSavingData(true);
    setDataMsg(null);
    try {
      const res = withSession(await updateProductAction(patch));
      if (res.ok) {
        setDataMsg({ ok: true, text: "Cambios guardados." });
        onChanged();
      } else {
        setDataMsg({ ok: false, text: res.message, session: res.code === "SESSION" });
      }
    } catch {
      setDataMsg({ ok: false, text: "No se pudo guardar. Revisa tu conexión e intenta de nuevo." });
    } finally {
      setSavingData(false);
    }
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    setBusy(true);
    setActionMsg(null);
    try {
      const res = withSession(
        confirm.kind === "product"
          ? await setProductActiveAction(product.id, false)
          : await setVariantActiveAction(confirm.variantId, false),
      );
      if (res.ok) {
        setConfirm(null);
        onChanged();
      } else {
        setConfirm(null);
        setActionMsg({ text: res.message, session: res.code === "SESSION" });
      }
    } catch {
      setConfirm(null);
      setActionMsg({ text: "No se pudo guardar. Revisa tu conexión e intenta de nuevo." });
    } finally {
      setBusy(false);
    }
  };

  const reactivate = async (target: { kind: "product" } | { kind: "variant"; variantId: string }) => {
    setBusy(true);
    setActionMsg(null);
    try {
      const res = withSession(
        target.kind === "product"
          ? await setProductActiveAction(product.id, true)
          : await setVariantActiveAction(target.variantId, true),
      );
      if (res.ok) onChanged();
      else setActionMsg({ text: res.message, session: res.code === "SESSION" });
    } catch {
      setActionMsg({ text: "No se pudo guardar. Revisa tu conexión e intenta de nuevo." });
    } finally {
      setBusy(false);
    }
  };

  const confirmVariant = confirm?.kind === "variant" ? product.variants.find((v) => v.id === confirm.variantId) : undefined;
  const selectedDepartment = departments.find((d) => d.id === departmentId) ?? null;
  const typesForSelected = selectedDepartment ? typesForDepartment(productTypes, selectedDepartment.id) : [];
  const changeDepartment = (id: string) => {
    const dept = departments.find((d) => d.id === id) ?? null;
    const current = productTypes.find((t) => t.id === classification.productTypeId);
    const audience = dept?.slug === "calzado" ? classification.audience : null;
    const typeFits = !current || (dept !== null && current.departmentIds.includes(dept.id));
    setDepartmentId(id);
    setClassification(typeFits ? { ...classification, audience } : { productTypeId: "", style: null, audience });
  };
  const productActive = isActive(product);
  const historyVariants = product.variants.filter((v) => (history[v.id]?.length ?? 0) > 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ficha del producto"
      className="fixed inset-0 z-50 overflow-y-auto bg-white pl-[var(--safe-left)] pr-[var(--safe-right)]"
    >
      <div className="mx-auto flex min-h-full max-w-[480px] flex-col">
        <header className="sticky top-0 z-10 flex h-[calc(3.5rem+var(--safe-top))] items-center gap-2 border-b border-borde-control/30 bg-white px-2 pt-[var(--safe-top)]">
          <button
            type="button"
            onClick={onClose}
            aria-label="Regresar"
            className="flex h-11 w-11 items-center justify-center rounded-full text-tinta active:bg-niebla"
          >
            <ArrowLeft aria-hidden="true" size={22} />
          </button>
          <h2 className="text-base font-bold text-tinta">Ficha del producto</h2>
        </header>

        <div className="flex-1 space-y-6 px-4 py-4 pb-[calc(3rem+var(--safe-bottom))]">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              {product.publicCode ? (
                <span className="rounded border border-borde-control/30 bg-niebla px-2.5 py-1 font-mono text-xs font-semibold tracking-tight text-tinta">
                  Código público: {product.publicCode}
                </span>
              ) : (
                <span />
              )}
              <span
                className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${
                  productActive ? "border-ok bg-white text-ok" : "border-borde-control/30 bg-niebla text-tinta/70"
                }`}
              >
                {productActive ? "Activo" : "Inactivo"}
              </span>
            </div>
            <h3 className="text-lg font-bold text-tinta">{product.title}</h3>
            <div className="flex flex-wrap items-center gap-x-3">
              {canEditData ? (
                product.imageUrl || product.backImageUrl ? (
                  <>
                    <ProductPhotoButton
                      productId={product.id}
                      productTitle={product.title}
                      hasImage={!!product.imageUrl}
                      onUpdated={onChanged}
                    />
                    <ProductPhotoButton
                      productId={product.id}
                      productTitle={product.title}
                      side="back"
                      hasImage={!!product.backImageUrl}
                      onUpdated={onChanged}
                    />
                  </>
                ) : (
                  <ProductPhotoButton
                    productId={product.id}
                    productTitle={product.title}
                    hasImage={!!product.imageUrl}
                    captureBoth
                    onUpdated={onChanged}
                  />
                )
              ) : (
                // Colaborador: solo llena espacios vacíos; cambiar una foto puesta es de owner/manager.
                <>
                  {!product.imageUrl && (
                    <ProductPhotoButton
                      productId={product.id}
                      productTitle={product.title}
                      hasImage={false}
                      onUpdated={onChanged}
                    />
                  )}
                  {!product.backImageUrl && (
                    <ProductPhotoButton
                      productId={product.id}
                      productTitle={product.title}
                      side="back"
                      hasImage={false}
                      onUpdated={onChanged}
                    />
                  )}
                </>
              )}
            </div>
          </section>

          <div aria-live="polite">
            {actionMsg && (
              <p role="alert" className="rounded-lg border border-agotado bg-white p-3 text-sm font-semibold text-agotado">
                <ActionErrorText message={actionMsg.text} session={actionMsg.session} />
              </p>
            )}
          </div>

          {canEditData && (
            <section aria-label="Sitio web" className="space-y-3 rounded-xl border border-gray-200 p-3.5">
              <h3 className="border-b border-gray-200 pb-1 text-sm font-bold text-tinta">Sitio web</h3>
              <PublishControl product={product} locations={locations} onChanged={onChanged} />
            </section>
          )}

          {canEditData && (
            <section aria-label="Datos del producto" className="space-y-3.5 rounded-xl border border-borde-control/30 p-3.5">
              <h3 className="border-b border-borde-control/30 pb-1 text-sm font-bold text-tinta">Datos del producto</h3>
              <div>
                <label htmlFor="ficha-titulo" className={labelCls}>Título</label>
                <input id="ficha-titulo" type="text" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
              </div>
              <div>
                <label htmlFor="ficha-marca" className={labelCls}>Marca</label>
                <select id="ficha-marca" value={brandId} onChange={(e) => setBrandId(e.target.value)} className={field}>
                  {!brandId && <option value="">Elige la marca</option>}
                  {brandId && !brands.some((b) => b.id === brandId) && <option value={brandId}>{product.brand}</option>}
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ficha-depto" className={labelCls}>Departamento</label>
                <select id="ficha-depto" value={departmentId} onChange={(e) => changeDepartment(e.target.value)} className={field}>
                  {!departmentId && <option value="">Sin departamento</option>}
                  {departmentId && !departments.some((d) => d.id === departmentId) && <option value={departmentId}>Actual</option>}
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <ClassificationFields
                idPrefix="ficha"
                departmentSlug={selectedDepartment?.slug ?? null}
                types={typesForSelected}
                value={classification}
                onChange={setClassification}
              />
              <div aria-live="polite">
                {dataMsg && (
                  <p
                    role={dataMsg.ok ? "status" : "alert"}
                    className={`text-sm font-semibold ${dataMsg.ok ? "text-ok" : "text-agotado"}`}
                  >
                    <ActionErrorText message={dataMsg.text} session={dataMsg.session} />
                  </p>
                )}
              </div>
              <Button variant="outline" onClick={() => void saveData()} disabled={savingData} className="w-full">
                {savingData ? "Guardando…" : "Guardar cambios"}
              </Button>
            </section>
          )}

          {canEditPrice && (
            <section aria-label="Precio por talla" className="space-y-3">
              <h3 className="text-sm font-bold text-tinta">Precio por talla</h3>
              {product.variants.map((v) => {
                const st = prices[v.id];
                if (!st) return null;
                const variantActive = isActive(v);
                const bad = st.error || st.conflict !== undefined;
                return (
                  <div
                    key={v.id}
                    className={`space-y-2.5 rounded-xl bg-niebla p-3 ${st.conflict !== undefined ? "border-2 border-agotado/40" : "border border-borde-control/30"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-borde-control/30 bg-white px-1 font-mono text-sm font-bold text-tinta">
                        {v.size || v.title}
                      </span>
                      {canEditData && variantActive ? (
                        <button
                          type="button"
                          aria-label={`Desactivar talla ${v.size || v.title}`}
                          onClick={() => setConfirm({ kind: "variant", variantId: v.id })}
                          disabled={busy}
                          className="min-h-[44px] px-2 text-xs text-tinta/70 underline disabled:opacity-60"
                        >
                          Desactivar talla
                        </button>
                      ) : canEditData ? (
                        <button
                          type="button"
                          aria-label={`Reactivar talla ${v.size || v.title}`}
                          onClick={() => void reactivate({ kind: "variant", variantId: v.id })}
                          disabled={busy}
                          className="min-h-[44px] px-2 text-xs font-semibold text-turquesa-texto underline disabled:opacity-60"
                        >
                          Reactivar talla
                        </button>
                      ) : null}
                    </div>
                    {st.conflict !== undefined && (
                      <p role="alert" className="rounded-lg border border-agotado bg-white p-2.5 text-xs font-medium leading-tight text-agotado">
                        Alguien cambió este precio. Precio vigente: {formatPriceShort(st.conflict)}. Revisa y guarda de nuevo.
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor={`precio-${v.id}`} className="mb-0.5 block text-[11px] text-tinta/70">Precio (MXN)</label>
                        <input
                          id={`precio-${v.id}`}
                          aria-label={`Precio de la talla ${v.size || v.title}`}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={st.text}
                          aria-invalid={bad ? true : undefined}
                          onChange={(e) => patchPrice(v.id, { text: e.target.value, error: undefined, saved: false, confirmDrop: undefined })}
                          className={`${field} font-mono font-semibold`}
                        />
                      </div>
                      <div>
                        <label htmlFor={`motivo-${v.id}`} className="mb-0.5 block text-[11px] text-tinta/70" aria-hidden="true">Motivo (opcional)</label>
                        <input
                          id={`motivo-${v.id}`}
                          aria-label={`Motivo (opcional) de la talla ${v.size || v.title}`}
                          type="text"
                          maxLength={120}
                          autoComplete="off"
                          placeholder="Ej. Promoción"
                          value={st.reason}
                          onChange={(e) => patchPrice(v.id, { reason: e.target.value, error: undefined })}
                          className={`${field} text-sm`}
                        />
                      </div>
                    </div>
                    {st.error && (
                      <p role="alert" className="text-xs font-semibold text-agotado">
                        <ActionErrorText message={st.error} session={st.session} />
                      </p>
                    )}
                    {st.saved && <p role="status" className="text-xs font-semibold text-ok">Precio guardado.</p>}
                    {st.confirmDrop !== undefined && (
                      <div
                        role="alertdialog"
                        aria-labelledby={`bajar-${v.id}`}
                        className="space-y-2 rounded-lg border border-agotado/40 p-2.5"
                      >
                        <p id={`bajar-${v.id}`} className="text-sm font-semibold text-agotado">
                          ¿{st.confirmDrop < st.baseline ? "Bajar" : "Subir"} de {formatPriceShort(st.baseline)} a {formatPriceShort(st.confirmDrop)}?
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <Button variant="outline"
                            onClick={() => patchPrice(v.id, { confirmDrop: undefined })}
                          >
                            No, revisar
                          </Button>
                          <Button variant="danger"
                            onClick={() => void savePrice(v, true)}
                            disabled={st.saving}
                          >
                            {`Sí, ${st.confirmDrop < st.baseline ? "bajar" : "subir"}`}
                          </Button>
                        </div>
                      </div>
                    )}
                    <Button
                      aria-label={`Guardar precio de la talla ${v.size || v.title}`}
                      onClick={() => void savePrice(v)}
                      disabled={st.saving} className="w-full">
                      {st.saving ? "Guardando…" : "Guardar precio"}
                    </Button>
                  </div>
                );
              })}
              <p className="text-[11px] leading-snug text-tinta/70">El precio es el mismo en todas las tiendas.</p>
            </section>
          )}

          {canEditPrice && (
            <section aria-label="Historial de precios" className="space-y-2.5 rounded-xl border border-borde-control/30 p-3.5">
              <div className="flex items-center justify-between border-b border-borde-control/30 pb-1">
                <h3 className="text-sm font-bold text-tinta">Historial de precios</h3>
                <span className="font-mono text-[11px] text-tinta/70">Últimos 5</span>
              </div>
              {historyVariants.length === 0 ? (
                <p className="text-xs text-tinta/70">Todavía no hay cambios de precio.</p>
              ) : (
                historyVariants.map((v) => (
                  <div key={v.id}>
                    {product.variants.length > 1 && (
                      <p className="mb-1 text-[11px] font-semibold text-tinta/70">Talla {v.size || v.title}</p>
                    )}
                    <ul className="divide-y divide-borde-control/60">
                      {history[v.id].map((c, i) => (
                        <li key={`${c.createdAt}-${i}`} className="py-2 font-mono text-xs text-tinta">
                          {formatPriceChange(c)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </section>
          )}

          <section aria-label="Stock por tienda de lectura" className="space-y-2.5 rounded-xl border border-borde-control/30 p-3.5">
            <div className="flex items-center justify-between border-b border-borde-control/30 pb-1">
              <h3 className="text-sm font-bold text-tinta">Stock por tienda</h3>
              <span className="rounded bg-niebla px-2 py-0.5 text-[11px] font-medium text-tinta/70">Solo lectura</span>
            </div>
            <div className="overflow-x-auto">
              <table aria-label="Stock por tienda" className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-borde-control/30 text-[11px] text-tinta/70">
                    <th scope="col" className="py-2 font-normal">Tienda</th>
                    {product.variants.map((v) => (
                      <th key={v.id} scope="col" className="py-2 text-center font-mono font-semibold">
                        {v.size || v.title}
                      </th>
                    ))}
                    <th scope="col" className="py-2 text-right font-mono font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde-control/40 text-xs">
                  {/* El servidor ya recorta el stock del colaborador a su tienda; aquí solo se omiten las tiendas sin filas. */}
                  {locations.filter((loc) => role !== "collaborator" || product.variants.some((v) => v.inventory.some((l) => l.locationId === loc.id))).map((loc) => {
                    const cells = product.variants.map((v) => v.inventory.find((l) => l.locationId === loc.id)?.available);
                    const total = cells.reduce<number>((sum, n) => sum + (n ?? 0), 0);
                    return (
                      <tr key={loc.id}>
                        <td className="py-2.5 font-medium text-tinta">{loc.name}</td>
                        {cells.map((n, i) => (
                          <td key={product.variants[i].id} className="py-2.5 text-center font-mono">
                            {n === undefined ? "—" : n}
                          </td>
                        ))}
                        <td className="py-2.5 text-right font-mono font-bold text-turquesa-texto">{total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="pt-1 text-[11px] leading-snug text-tinta/70">
              Solo lectura. Para sumar piezas usa Escanear.
            </p>
          </section>

          {canEditData && (
            <section className="pt-2">
              {productActive ? (
                <Button variant="danger"
                  onClick={() => setConfirm({ kind: "product" })}
                  disabled={busy}
                  className="w-full">
                  Desactivar producto
                </Button>
              ) : (
                <Button
                  onClick={() => void reactivate({ kind: "product" })}
                  disabled={busy} className="w-full">
                  Reactivar producto
                </Button>
              )}
            </section>
          )}
        </div>

        {confirm && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 pb-[max(0.75rem,var(--safe-bottom))] pl-[max(0.75rem,var(--safe-left))] pr-[max(0.75rem,var(--safe-right))]">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="ficha-confirm-title"
              aria-describedby="ficha-confirm-desc"
              className="w-full max-w-[351px] space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-xl"
            >
              <div>
                <h3 id="ficha-confirm-title" className="text-base font-bold leading-tight text-tinta">
                  {confirm.kind === "product"
                    ? `¿Desactivar ${product.title}?`
                    : `¿Desactivar la talla ${confirmVariant?.size || confirmVariant?.title}?`}
                </h3>
                <p id="ficha-confirm-desc" className="mt-1.5 text-xs leading-relaxed text-tinta/70">
                  Deja de verse en el catálogo y no se puede vender. El historial se conserva y puedes reactivarlo.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <Button variant="outline"
                  onClick={() => setConfirm(null)}
                >
                  Cancelar
                </Button>
                <Button variant="danger"
                  onClick={() => void runConfirmed()}
                  disabled={busy}
                >
                  Sí, desactivar
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
import type { ProductTypeOption } from "@/lib/catalog/actions";
import {
  AUDIENCES, AUDIENCE_DEPARTMENT_SLUG, AUDIENCE_LABELS, type Audience,
} from "@/lib/domain/product-taxonomy";
import { STYLE_OPTIONS } from "@/lib/domain/product-types-catalog";

export interface ClassificationValue {
  productTypeId: string;
  style: string | null;
  audience: Audience | null;
}

interface Props {
  idPrefix: string;
  /** Slug del departamento elegido; null = aún sin departamento (Tipo desactivado). */
  departmentSlug: string | null;
  /** Tipos que ya admite el departamento elegido. */
  types: ProductTypeOption[];
  value: ClassificationValue;
  onChange: (v: ClassificationValue) => void;
  disabled?: boolean;
}

const selectCls =
  "mt-1 block min-h-[44px] w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 focus:border-loloteal focus:outline-none focus:ring-2 focus:ring-loloteal disabled:opacity-60";
const labelCls = "block text-sm font-medium text-gray-700";

/** Tipo / Estilo / Para: el estilo depende del tipo y «Para» solo existe en Calzado. */
export function ClassificationFields({ idPrefix, departmentSlug, types, value, onChange, disabled }: Props) {
  const selected = types.find((t) => t.id === value.productTypeId);
  const styles = selected ? STYLE_OPTIONS[selected.slug] ?? [] : [];
  const showAudience = departmentSlug === AUDIENCE_DEPARTMENT_SLUG;
  const typeId = `${idPrefix}-tipo`;
  const styleId = `${idPrefix}-estilo`;
  const noDepartment = departmentSlug === null;

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={typeId} className={labelCls}>Tipo</label>
        <select
          id={typeId}
          aria-required="true"
          disabled={disabled || noDepartment}
          value={value.productTypeId}
          onChange={(e) => onChange({ productTypeId: e.target.value, style: null, audience: value.audience })}
          className={selectCls}
        >
          <option value="">{noDepartment ? "Elige primero el departamento" : "Elige el tipo"}</option>
          {value.productTypeId && !selected && <option value={value.productTypeId}>Actual (no disponible)</option>}
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {styles.length > 0 && (
        <div>
          <label htmlFor={styleId} className={labelCls}>Estilo</label>
          <select
            id={styleId}
            disabled={disabled}
            value={value.style ?? ""}
            onChange={(e) => onChange({ ...value, style: e.target.value || null })}
            className={selectCls}
          >
            <option value="">Sin estilo</option>
            {styles.map((s) => (
              <option key={s.slug} value={s.slug}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {showAudience && (
        <fieldset disabled={disabled}>
          <legend className={labelCls}>Para</legend>
          <div className="mt-1 grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
            {AUDIENCES.map((a) => (
              <label
                key={a}
                className={`flex min-h-[44px] cursor-pointer items-center justify-center rounded-md px-2 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-loloteal ${
                  value.audience === a ? "bg-loloteal text-white shadow-sm" : "text-gray-700"
                }`}
              >
                <input
                  type="radio"
                  name={`${idPrefix}-para`}
                  value={a}
                  checked={value.audience === a}
                  onChange={() => onChange({ ...value, audience: a })}
                  className="sr-only"
                />
                {AUDIENCE_LABELS[a]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}

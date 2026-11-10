"use client";

import type { PublicProduct } from "@/lib/data/public-projection";

export type PublicDepartment = NonNullable<PublicProduct["department"]>;

/** Departamentos presentes en los productos, sin repetir y en `sortOrder` (desempate por nombre). */
export function departmentsOf(products: PublicProduct[]): PublicDepartment[] {
  const bySlug = new Map<string, PublicDepartment>();
  for (const p of products) if (p.department) bySlug.set(p.department.slug, p.department);
  return [...bySlug.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));
}

interface Props {
  departments: PublicDepartment[];
  /** Slug activo, o null para "Todo". */
  selected: string | null;
  onSelect: (slug: string | null) => void;
}

const base =
  "inline-flex min-h-[44px] flex-none items-center rounded-full border px-4 text-sm font-semibold transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loloteal";
const on = "border-loloteal bg-loloteal text-white active:bg-loloteal-dark";
const off = "border-gray-300 bg-white text-gray-800 active:bg-gray-100";

/** Chips de departamento: "Todo" + los presentes. Sin conteos; cada uno es un botón con `aria-pressed`. */
export function DepartmentChips({ departments, selected, onSelect }: Props) {
  if (departments.length === 0) return null;
  return (
    <div role="group" aria-label="Departamentos" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
      <button type="button" aria-pressed={selected === null} onClick={() => onSelect(null)} className={`${base} ${selected === null ? on : off}`}>
        Todo
      </button>
      {departments.map((d) => (
        <button
          key={d.slug}
          type="button"
          aria-pressed={selected === d.slug}
          onClick={() => onSelect(d.slug)}
          className={`${base} ${selected === d.slug ? on : off}`}
        >
          {d.name}
        </button>
      ))}
    </div>
  );
}

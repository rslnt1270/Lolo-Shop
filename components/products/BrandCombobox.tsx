"use client";
import { useId, useMemo, useState } from "react";
import { slugify } from "@/lib/domain/slug";
import { normalizeBrandName } from "@/lib/domain/brand";
import type { BrandOption } from "@/lib/catalog/actions";

interface BrandComboboxProps {
  id: string;
  brands: BrandOption[];
  /** Marca elegida (o null si el texto aún no es una marca). */
  value: BrandOption | null;
  onChange: (brand: BrandOption | null) => void;
  /** Crea la marca en el servidor; devuelve la marca o un mensaje de error. */
  onCreate: (name: string) => Promise<{ ok: true; brand: BrandOption } | { ok: false; message: string }>;
  disabled?: boolean;
}

const CREATE = "__create__";

/** Combo accesible (ARIA 1.2, patrón list autocomplete) con creación rápida de marca. */
export function BrandCombobox({ id, brands, value, onChange, onCreate, disabled }: BrandComboboxProps) {
  const listId = useId();
  const [text, setText] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const query = normalizeBrandName(text);
  const slug = slugify(query);

  const options = useMemo(() => {
    const matches = brands.filter((b) => !slug || b.slug.includes(slug) || slugify(b.name).includes(slug));
    const items: { key: string; label: string; brand?: BrandOption }[] = matches.map((b) => ({
      key: b.id,
      label: b.name,
      brand: b,
    }));
    if (query && slug && !brands.some((b) => b.slug === slug)) {
      items.push({ key: CREATE, label: `Crear «${query}»` });
    }
    return items;
  }, [brands, query, slug]);

  const optionId = (i: number) => `${listId}-opt-${i}`;
  const expanded = open && options.length > 0;

  async function choose(i: number) {
    const item = options[i];
    if (!item) return;
    setError("");
    if (item.brand) {
      setText(item.brand.name);
      onChange(item.brand);
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const r = await onCreate(query);
      if (r.ok) {
        setText(r.brand.name);
        onChange(r.brand);
        setOpen(false);
      } else {
        setError(r.message);
      }
    } catch {
      setError("No se pudo crear la marca. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (options.length ? (a + 1) % options.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (options.length ? (a - 1 + options.length) % options.length : 0));
    } else if (e.key === "Enter" && expanded) {
      e.preventDefault();
      void choose(active);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        id={id}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? optionId(active) : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        autoComplete="off"
        disabled={disabled || busy}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
          setError("");
          if (value) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder="Busca o escribe la marca"
        className="mt-1 block min-h-[44px] w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-loloteal focus:outline-none focus:ring-2 focus:ring-loloteal"
      />
      <ul
        id={listId}
        role="listbox"
        hidden={!expanded}
        className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
      >
        {options.map((o, i) => (
          <li
            key={o.key}
            id={optionId(i)}
            role="option"
            aria-selected={value ? o.brand?.id === value.id : i === active}
            // mouseDown evita que el blur del input cierre la lista antes del clic.
            onMouseDown={(e) => {
              e.preventDefault();
              void choose(i);
            }}
            className={`flex min-h-[44px] cursor-pointer items-center px-3 text-sm ${
              i === active ? "bg-loloteal/10 text-gray-900" : "text-gray-800"
            } ${o.key === CREATE ? "font-semibold text-loloteal" : ""}`}
          >
            {o.label}
          </li>
        ))}
      </ul>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

interface Props {
  categories: string[];
  onQuery: (q: string) => void;
  onCategory: (c: string | null) => void;
}

export function SearchFilter({ categories, onQuery, onCategory }: Props) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        className="flex-1 rounded border p-2"
        placeholder="Buscar producto..."
        onChange={(e) => onQuery(e.target.value)}
      />
      <select
        aria-label="Categoría"
        className="rounded border p-2"
        onChange={(e) => onCategory(e.target.value || null)}
      >
        <option value="">Todas</option>
        {categories.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}

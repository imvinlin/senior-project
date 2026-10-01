import { useState } from "react";

import { formatCount } from "@/lib/format";

const SHOW = 8;

export function FilterSidebar({
  facets,
  filters,
  toggleFilter,
  clearFilters,
}: {
  facets: Record<string, Record<string, number>>;
  filters: URLSearchParams;
  toggleFilter: (name: string, value: string) => void;
  clearFilters: () => void;
}) {
  return (
    <aside className="w-72 shrink-0 text-sm">
      <div className="flex items-center justify-between pb-3">
        <h2 className="font-semibold">Filters</h2>
        <button
          type="button"
          className="rounded px-1 text-xs text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent"
          onClick={clearFilters}
        >
          Clear all
        </button>
      </div>
      {Object.entries(facets).map(([facet, counts]) => (
        <FacetGroup
          key={facet}
          name={facet}
          counts={counts}
          picked={filters.getAll(facet)}
          onToggle={(value) => toggleFilter(facet, value)}
        />
      ))}
    </aside>
  );
}

function FacetGroup({
  name,
  counts,
  picked,
  onToggle,
}: {
  name: string;
  counts: Record<string, number>;
  picked: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  // why: a picked value with 0 samples left is gone from counts, but it still needs a row to uncheck it
  const gone: [string, number][] = picked.filter((v) => !Object.hasOwn(counts, v)).map((v) => [v, 0]);
  const rows = [...gone, ...Object.entries(counts)];
  const shown = showAll ? rows : rows.slice(0, SHOW);
  return (
    <section className="border-t border-zinc-200 py-3">
      <button
        type="button"
        className="flex w-full items-center justify-between font-medium capitalize text-zinc-700"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {name}
        <span className="text-xs text-zinc-400">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <ul className="mt-1">
          {shown.map(([value, count]) => (
            <li key={value}>
              <label className="flex cursor-pointer items-center gap-2 py-0.5 text-zinc-700">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={picked.includes(value)}
                  onChange={() => onToggle(value)}
                />
                <span className={`truncate ${name === "species" ? "italic" : ""}`}>{value}</span>
                <span className="ml-auto font-mono text-xs text-zinc-500">{formatCount(count)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {open && rows.length > SHOW && (
        <button
          type="button"
          className="mt-1 rounded px-1 text-xs text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  );
}

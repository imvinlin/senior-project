export function CohortBar({
  chips,
  removeFilter,
  clearFilters,
}: {
  chips: [string, string][];
  removeFilter: (name: string, value: string) => void;
  clearFilters: () => void;
}) {
  return (
    <div className="mt-3 flex min-h-7 flex-wrap items-center gap-2 text-sm">
      {chips.length === 0 && <span className="text-zinc-500">No filters applied</span>}
      {chips.map(([facet, value]) => (
        <span
          key={`${facet}=${value}`}
          className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-zinc-50 py-0.5 pl-2 pr-1"
        >
          <span className="text-zinc-500">{facet}</span>
          {value}
          <button
            type="button"
            aria-label={`Remove ${facet} ${value}`}
            className="rounded px-1 text-zinc-500 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-accent"
            onClick={() => removeFilter(facet, value)}
          >
            ×
          </button>
        </span>
      ))}
      {chips.length > 0 && (
        <button
          type="button"
          className="rounded px-1 text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent"
          onClick={clearFilters}
        >
          Clear all
        </button>
      )}
    </div>
  );
}

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Cohort = { n: number; facets: Record<string, Record<string, number>> };
async function fetchCohort(query: string): Promise<Cohort> {
  const r = await fetch(`/api/cohort?${query}`);
  if (!r.ok) throw new Error(`API answered ${r.status}`);
  return r.json() as Promise<Cohort>;
}


const SMALL_GROUP = 5;

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

function formatShare(count: number, n: number): string {
  const percent = (count / n) * 100;
  return percent < 0.1 ? "<0.1%" : `${percent.toFixed(1)}%`;
}

function pushFilters(params: URLSearchParams) {
  const next = params.toString();
  window.history.pushState(null, "", next ? `?${next}` : window.location.pathname);
}

function useCohort() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    fetchCohort(query)
      .then((c) => {
        if (stale) return;
        setCohort(c);
        setError(null);
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message);
      });
    return () => {
      stale = true;
    };
  }, [query]);

  function setFilter(name: string, value: string) {
    const params = new URLSearchParams(query);
    if (value) params.set(name, value);
    else params.delete(name);
    pushFilters(params);
  }

  function removeFilter(name: string, value: string) {
    const params = new URLSearchParams(query);
    params.delete(name, value);
    pushFilters(params);
  }

  function clearFilters() {
    pushFilters(new URLSearchParams());
  }

  return { cohort, error, filters: searchParams, setFilter, removeFilter, clearFilters };
}

function CohortBar({
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

function SpeciesSupport({ groups, n }: { groups: [string, number][]; n: number }) {
  const small = groups.filter(([, count]) => count < SMALL_GROUP).length;
  return (
    <section className="mt-8 max-w-2xl">
      <h2 className="text-sm font-medium text-zinc-700">Samples per species</h2>
      {groups.length === 0 && (
        <p className="mt-1 text-sm text-zinc-500">No samples match these filters.</p>
      )}
      {small > 0 && (
        <p className="mt-1 text-sm text-amber-700">
          {small} of {groups.length} species {small === 1 ? "has" : "have"} fewer than{" "}
          {SMALL_GROUP} samples.
        </p>
      )}
      <table className="mt-2 w-full text-sm">
        <tbody>
          {groups.map(([name, count]) => (
            <tr key={name} className="border-t border-zinc-200">
              <td className="py-1 italic">{name}</td>
              <td className="py-1 pl-4 text-right font-mono">{formatCount(count)}</td>
              <td className="py-1 pl-4 text-right font-mono text-zinc-500">
                {formatShare(count, n)}
              </td>
              <td className="w-40 py-1 pl-4 text-amber-700">
                {count < SMALL_GROUP && `fewer than ${SMALL_GROUP}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const loading = <main className="p-6 text-zinc-500">Loading...</main>;

function CohortExplorer() {
  const { cohort, error, filters, setFilter, removeFilter, clearFilters } = useCohort();

  if (error) return <main className="p-6 text-red-700">Could not load the cohort: {error}</main>;
  if (!cohort) return loading;
  const picked = filters.getAll("species");
  const groups = Object.entries(cohort.facets.species ?? {}).filter(
    ([name]) => picked.length === 0 || picked.includes(name),
  );
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">CancerLike</h1>
      <p className="mt-1 text-zinc-600">
        <span className="font-mono text-zinc-900">{formatCount(cohort.n)}</span>{" "}
        {cohort.n === 1 ? "sample" : "samples"} in the active cohort
      </p>
      <CohortBar
        chips={[...filters.entries()]}
        removeFilter={removeFilter}
        clearFilters={clearFilters}
      />
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-3">
        {Object.entries(cohort.facets).map(([facet, counts]) => {
          const value = filters.get(facet) ?? "";
          // why: every facet column is 100% filled, so its counts sum to the cohort without this filter
          const total = Object.values(counts).reduce((a, b) => a + b, 0);
          return (
            <label
              key={facet}
              className="flex flex-col gap-1 text-sm font-medium capitalize text-zinc-700"
            >
              {facet}
              <select
                className="w-64 rounded border border-zinc-300 bg-white px-2 py-1.5 text-base font-normal normal-case text-zinc-900 focus:outline-none focus:ring-2 focus:ring-accent"
                value={value}
                onChange={(e) => setFilter(facet, e.target.value)}
              >
                <option value="">All ({formatCount(total)})</option>
                {value && !Object.hasOwn(counts, value) && (
                  <option value={value}>{value} (0)</option>
                )}
                {Object.entries(counts).map(([name, count]) => (
                  <option key={name} value={name}>
                    {name} ({formatCount(count)})
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      <SpeciesSupport groups={groups} n={cohort.n} />
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={loading}>
      <CohortExplorer />
    </Suspense>
  );
}

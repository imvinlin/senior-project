"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Cohort = { n: number; facets: Record<string, Record<string, number>> };
async function fetchCohort(query: string): Promise<Cohort> {
  const r = await fetch(`/api/cohort?${query}`);
  if (!r.ok) throw new Error(`API answered ${r.status}`);
  return r.json() as Promise<Cohort>;
}


function formatCount(n: number): string {
  return n.toLocaleString("en-US");
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
    const next = params.toString();
    window.history.pushState(null, "", next ? `?${next}` : window.location.pathname);
  }

  return { cohort, error, filters: searchParams, setFilter };
}

const loading = <main className="p-6 text-zinc-500">Loading...</main>;

function CohortExplorer() {
  const { cohort, error, filters, setFilter } = useCohort();

  if (error) return <main className="p-6 text-red-700">Could not load the cohort: {error}</main>;
  if (!cohort) return loading;
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">CancerLike</h1>
      <p className="mt-1 text-zinc-600">
        <span className="font-mono text-zinc-900">{formatCount(cohort.n)}</span>{" "}
        {cohort.n === 1 ? "sample" : "samples"} in the active cohort
      </p>
      <div className="mt-6 flex flex-wrap gap-x-4 gap-y-3">
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

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

function useCohortQuery(query: string) {
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

  return { cohort, error };
}

function useCohort() {
  const searchParams = useSearchParams();
  const atlas = useCohortQuery("");
  const active = useCohortQuery(searchParams.toString());

  function setFilter(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    const query = params.toString();
    window.history.pushState(null, "", query ? `?${query}` : window.location.pathname);
  }

  return {
    atlas: atlas.cohort,
    cohort: active.cohort,
    error: atlas.error ?? active.error,
    species: searchParams.get("species") ?? "",
    setFilter,
  };
}

const loading = <main className="p-6 text-zinc-500">Loading...</main>;

function CohortExplorer() {
  const { atlas, cohort, error, species, setFilter } = useCohort();

  if (error) return <main className="p-6 text-red-700">Could not load the cohort: {error}</main>;
  if (!atlas || !cohort) return loading;
  const speciesCounts = atlas.facets.species ?? {};
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">CancerLike</h1>
      <p className="mt-1 text-zinc-600">
        <span className="font-mono text-zinc-900">{formatCount(cohort.n)}</span>{" "}
        {cohort.n === 1 ? "sample" : "samples"} in the active cohort
      </p>
      <label className="mt-6 flex w-fit flex-col gap-1 text-sm font-medium text-zinc-700">
        Species
        <select
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-base font-normal text-zinc-900 focus:outline-none focus:ring-2 focus:ring-accent"
          value={species}
          onChange={(e) => setFilter("species", e.target.value)}
        >
          <option value="">All species ({formatCount(atlas.n)})</option>
          {species && !Object.hasOwn(speciesCounts, species) && (
            <option value={species}>{species} (0)</option>
          )}
          {Object.entries(speciesCounts).map(([name, count]) => (
            <option key={name} value={name}>
              {name} ({formatCount(count)})
            </option>
          ))}
        </select>
      </label>
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

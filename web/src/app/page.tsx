"use client";

import { useEffect, useState } from "react";

type Cohort = { n: number; facets: Record<string, Record<string, number>> };
async function fetchCohort(query: string): Promise<Cohort> {
  const r = await fetch(`/api/cohort${query}`);
  if (!r.ok) throw new Error(`API answered ${r.status}`);
  return r.json() as Promise<Cohort>;
}


function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export default function Home() {
  const [atlas, setAtlas] = useState<Cohort | null>(null);
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [species, setSpecies] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCohort("")
      .then(setAtlas)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    let stale = false;
    const query = species ? `?${new URLSearchParams({ species })}` : "";
    fetchCohort(query)
      .then((c) => {
        if(!stale) setCohort(c);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      stale = true;
    };
  }, [species]);

  if (error) return <main className="p-6 text-red-700">API unreachable: {error}</main>;
  if (!atlas || !cohort) return <main className="p-6 text-zinc-500">Loading...</main>;
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
          onChange={(e) => setSpecies(e.target.value)}
        >
          <option value="">All species ({formatCount(atlas.n)})</option>
          {Object.entries(atlas.facets.species ?? {}).map(([name, count]) => (
            <option key={name} value={name}>
              {name} ({formatCount(count)})
            </option>
          ))}
        </select>
      </label>
    </main>
  );
}

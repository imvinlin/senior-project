"use client";

import { useEffect, useState } from "react";

type Cohort = { n: number; facets: Record<string, Record<string, number>> };
async function fetchCohort(query: string): Promise<Cohort> {
  const r = await fetch(`/api/cohort${query}`);
  if (!r.ok) throw new Error(`API answered ${r.status}`);
  return r.json() as Promise<Cohort>;
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

  if (error) return <main>API unreachable: {error}</main>;
  if (!atlas || !cohort) return <main>Loading...</main>;
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">
        CancerLike: {cohort.n} {cohort.n === 1 ? "sample" : "samples"}
      </h1>
      <label>
        Species{" "}
        <select value={species} onChange={(e) => setSpecies(e.target.value)}>
          <option value="">All species ({atlas.n})</option>
          {Object.entries(atlas.facets.species ?? {}).map(([name, count]) => (
            <option key={name} value={name}>
              {name} ({count})
            </option>
          ))}
        </select>
      </label>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";

type Cohort = { n: number; facets: Record<string, Record<string, number>> };

export default function Home() {
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cohort")
      .then((r) => {
        if (!r.ok) throw new Error(`API answered ${r.status}`);
        return r.json() as Promise<Cohort>;
      })
      .then(setCohort)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <main>API unreachable: {error}</main>;
  if (!cohort) return <main>Loading...</main>;
  return (
    <main>
      <h1>CancerLike: {cohort.n} samples</h1>
      {Object.entries(cohort.facets).map(([facet, counts]) => (
        <section key={facet}>
          <h2>{facet}</h2>
          <ul>
            {Object.entries(counts).map(([value, count]) => (
              <li key={value}>{value}: {count}</li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

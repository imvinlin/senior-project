"use client";

import { useEffect, useState } from "react";

type Health = { ok: boolean; samples: number };

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => {
        if (!r.ok) throw new Error(`API answered ${r.status}`);
        return r.json() as Promise<Health>;
      })
      .then(setHealth)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <main>API unreachable: {error}</main>;
  if (!health) return <main>Loading...</main>;
  return <main>CancerLike: {health.samples} samples loaded</main>;
}

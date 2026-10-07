"use client";

import { Suspense, useState } from "react";

import { CohortShell, loading } from "@/components/CohortShell";
import { PcaPlot, type Loadings, type PcaView } from "@/components/PcaPlot";
import { useApi } from "@/lib/useApi";
import { useCohort } from "@/lib/useCohort";

const SEGMENT = "px-3 py-1 focus:outline-none focus:ring-2 focus:ring-accent";

function PcaExplorer() {
  const state = useCohort();
  const [fit, setFit] = useState<"global" | "cohort">("global");
  const query = state.filters.toString();
  const { data, error, pending } = useApi<PcaView>(`/api/pca${fit === "cohort" ? "/cohort" : ""}?${query}`);
  const loadings = useApi<Loadings>("/api/loadings");
  return (
    <CohortShell state={state}>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <h2 className="text-sm font-medium text-zinc-700">Principal components of bulk expression</h2>
        <div className="inline-flex overflow-hidden rounded border border-zinc-300 text-xs text-zinc-700">
          {(["global", "cohort"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={fit === option}
              className={`${SEGMENT} ${fit === option ? "bg-zinc-100 font-medium" : "bg-white hover:bg-zinc-50"}`}
              onClick={() => setFit(option)}
            >
              {option === "global" ? "Global atlas" : "Fit on this cohort"}
            </button>
          ))}
        </div>
        {pending && <span className="text-xs text-zinc-500">Fitting...</span>}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">Could not load PCA: {error}.</p>}
      {data && state.cohort && (
        <PcaPlot view={data} n={state.cohort.n} loadings={data.loadings ?? loadings.data} />
      )}
    </CohortShell>
  );
}

export default function Pca() {
  return (
    <Suspense fallback={loading}>
      <PcaExplorer />
    </Suspense>
  );
}

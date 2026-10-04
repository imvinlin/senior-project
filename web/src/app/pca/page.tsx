"use client";

import { Suspense } from "react";

import { CohortShell, loading } from "@/components/CohortShell";
import { PcaPlot, type PcaView } from "@/components/PcaPlot";
import { useApi } from "@/lib/useApi";
import { useCohort } from "@/lib/useCohort";

function PcaExplorer() {
  const state = useCohort();
  const { data, error } = useApi<PcaView>(`/api/pca?${state.filters.toString()}`);
  return (
    <CohortShell state={state}>
      <h2 className="mt-8 text-sm font-medium text-zinc-700">Principal components of bulk expression</h2>
      {error && (
        <p className="mt-2 text-sm text-red-700">
          Could not load PCA: {error}
          {error.endsWith("503") && ". Run make prep to compute the coordinates."}
        </p>
      )}
      {data && state.cohort && <PcaPlot view={data} n={state.cohort.n} />}
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

"use client";

import { Suspense } from "react";

import { CohortShell, loading } from "@/components/CohortShell";
import { CoverageTable } from "@/components/CoverageTable";
import { SpeciesSupport } from "@/components/SpeciesSupport";
import { useCohort } from "@/lib/useCohort";

function CohortExplorer() {
  const state = useCohort();
  const { cohort, filters, setFilters } = state;
  const picked = filters.getAll("species");
  const groups = Object.entries(cohort?.facets.species ?? {}).filter(
    ([name]) => picked.length === 0 || picked.includes(name),
  );
  return (
    <CohortShell state={state}>
      <SpeciesSupport groups={groups} n={cohort?.n ?? 0} />
      <CoverageTable query={filters.toString()} setFilters={setFilters} />
    </CohortShell>
  );
}

export default function Home() {
  return (
    <Suspense fallback={loading}>
      <CohortExplorer />
    </Suspense>
  );
}

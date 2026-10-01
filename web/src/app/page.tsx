"use client";

import { Suspense } from "react";

import { CohortBar } from "@/components/CohortBar";
import { CoverageTable } from "@/components/CoverageTable";
import { FilterSidebar } from "@/components/FilterSidebar";
import { SpeciesSupport } from "@/components/SpeciesSupport";
import { formatCount } from "@/lib/format";
import { useCohort } from "@/lib/useCohort";

const loading = <main className="p-6 text-zinc-500">Loading...</main>;

function CohortExplorer() {
  const { cohort, error, filters, setFilters, toggleFilter, removeFilter, clearFilters } =
    useCohort();

  if (error) return <main className="p-6 text-red-700">Could not load the cohort: {error}</main>;
  if (!cohort) return loading;
  const picked = filters.getAll("species");
  const groups = Object.entries(cohort.facets.species ?? {}).filter(
    ([name]) => picked.length === 0 || picked.includes(name),
  );
  return (
    <main className="flex gap-8 p-6">
      <FilterSidebar
        facets={cohort.facets}
        filters={new URLSearchParams(filters.toString())}
        toggleFilter={toggleFilter}
        clearFilters={clearFilters}
      />
      <div className="min-w-0 flex-1">
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
        <SpeciesSupport groups={groups} n={cohort.n} />
        <CoverageTable query={filters.toString()} setFilters={setFilters} />
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

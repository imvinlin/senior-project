import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { CohortBar } from "@/components/CohortBar";
import { FilterSidebar } from "@/components/FilterSidebar";
import { formatCount } from "@/lib/format";
import type { CohortState } from "@/lib/useCohort";

const TABS = [
  { href: "/", label: "Cohort" },
  { href: "/pca", label: "PCA" },
];

export const loading = <main className="p-6 text-zinc-500">Loading...</main>;

export function CohortShell({ state, children }: { state: CohortState; children: ReactNode }) {
  const pathname = usePathname();
  const { cohort, error, filters, toggleFilter, removeFilter, clearFilters } = state;
  const query = filters.toString();

  if (error) return <main className="p-6 text-red-700">Could not load the cohort: {error}</main>;
  if (!cohort) return loading;
  return (
    <main className="p-6">
      <div className="flex items-baseline gap-6">
        <h1 className="text-2xl font-semibold">CancerLike</h1>
        <nav className="flex gap-1 text-sm">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={query ? `${tab.href}?${query}` : tab.href}
              className={`rounded px-2 py-1 ${pathname === tab.href ? "bg-zinc-100 font-medium" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="mt-4 flex gap-8">
        <FilterSidebar
          facets={cohort.facets}
          filters={new URLSearchParams(query)}
          toggleFilter={toggleFilter}
          clearFilters={clearFilters}
        />
        <div className="min-w-0 flex-1">
          <p className="text-zinc-600">
            <span className="font-mono text-zinc-900">{formatCount(cohort.n)}</span>{" "}
            {cohort.n === 1 ? "sample" : "samples"} in the active cohort
          </p>
          <CohortBar
            chips={[...filters.entries()]}
            removeFilter={removeFilter}
            clearFilters={clearFilters}
          />
          {children}
        </div>
      </div>
    </main>
  );
}

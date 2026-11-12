import { useSearchParams } from "next/navigation";

import { useApi } from "@/lib/useApi";

type Cohort = { n: number; facets: Record<string, Record<string, number>> };
export type AssayMode = "bulk" | "single-cell";

function pushFilters(params: URLSearchParams) {
  const next = params.toString();
  window.history.pushState(null, "", next ? `?${next}` : window.location.pathname);
}

export type CohortState = ReturnType<typeof useCohort>;

export function useCohort() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const assay: AssayMode = searchParams.get("assay") === "single-cell" ? "single-cell" : "bulk";
  const { data: cohort, error } = useApi<Cohort>(`/api/cohort?${query}`);

  function setFilters(values: Record<string, string>) {
    const params = new URLSearchParams(query);
    for (const [name, value] of Object.entries(values)) {
      if (value) params.set(name, value);
      else params.delete(name);
    }
    pushFilters(params);
  }

  function toggleFilter(name: string, value: string) {
    const params = new URLSearchParams(query);
    if (params.getAll(name).includes(value)) params.delete(name, value);
    else params.append(name, value);
    pushFilters(params);
  }

  function removeFilter(name: string, value: string) {
    const params = new URLSearchParams(query);
    params.delete(name, value);
    pushFilters(params);
  }

  function clearFilters() {
    const params = new URLSearchParams();
    params.set("assay", assay);
    pushFilters(params);
  }

  function setAssay(value: AssayMode) {
    const params = new URLSearchParams(query);
    params.set("assay", value);
    pushFilters(params);
  }

  return {
    cohort,
    error,
    filters: searchParams,
    assay,
    setAssay,
    setFilters,
    toggleFilter,
    removeFilter,
    clearFilters,
  };
}

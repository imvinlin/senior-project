import { useSearchParams } from "next/navigation";

import { useApi } from "@/lib/useApi";

type Cohort = { n: number; facets: Record<string, Record<string, number>> };

function pushFilters(params: URLSearchParams) {
  const next = params.toString();
  window.history.pushState(null, "", next ? `?${next}` : window.location.pathname);
}

export function useCohort() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const { data: cohort, error } = useApi<Cohort>(`/api/cohort?${query}`);

  function setFilters(values: Record<string, string>) {
    const params = new URLSearchParams(query);
    for (const [name, value] of Object.entries(values)) {
      if (value) params.set(name, value);
      else params.delete(name);
    }
    pushFilters(params);
  }

  function removeFilter(name: string, value: string) {
    const params = new URLSearchParams(query);
    params.delete(name, value);
    pushFilters(params);
  }

  function clearFilters() {
    pushFilters(new URLSearchParams());
  }

  return { cohort, error, filters: searchParams, setFilters, removeFilter, clearFilters };
}

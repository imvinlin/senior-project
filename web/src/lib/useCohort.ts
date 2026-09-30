import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Cohort = { n: number; facets: Record<string, Record<string, number>> };

async function fetchCohort(query: string): Promise<Cohort> {
  const r = await fetch(`/api/cohort?${query}`);
  if (!r.ok) throw new Error(`API answered ${r.status}`);
  return r.json() as Promise<Cohort>;
}

function pushFilters(params: URLSearchParams) {
  const next = params.toString();
  window.history.pushState(null, "", next ? `?${next}` : window.location.pathname);
}

export function useCohort() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    fetchCohort(query)
      .then((c) => {
        if (stale) return;
        setCohort(c);
        setError(null);
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message);
      });
    return () => {
      stale = true;
    };
  }, [query]);

  function setFilter(name: string, value: string) {
    const params = new URLSearchParams(query);
    if (value) params.set(name, value);
    else params.delete(name);
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

  return { cohort, error, filters: searchParams, setFilter, removeFilter, clearFilters };
}

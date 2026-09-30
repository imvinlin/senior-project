import { useEffect, useState } from "react";

export function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`API answered ${r.status}`);
        return r.json() as Promise<T>;
      })
      .then((d) => {
        if (stale) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message);
      });
    return () => {
      stale = true;
    };
  }, [url]);

  return { data, error };
}

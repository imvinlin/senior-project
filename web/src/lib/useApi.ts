import { useEffect, useState } from "react";

export function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    fetch(url)
      .then(async (r) => {
        if (r.ok) return r.json() as Promise<T>;
        const body = (await r.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? `API answered ${r.status}`);
      })
      .then((d) => {
        if (stale) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message);
      })
      .finally(() => {
        if (!stale) setDone(url);
      });
    return () => {
      stale = true;
    };
  }, [url]);

  return { data, error, pending: done !== url };
}

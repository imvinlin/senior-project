import { useEffect, useState } from "react";

export function useApi<T>(url: string, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let stale = false;
    fetch(url)
      .then(async (r) => {
        if (r.ok) return r.json() as Promise<T>;
        const body = (await r.json().catch(() => null)) as { detail?: unknown } | null;
        const detail = body?.detail;
        const message = typeof detail === "string" ? detail : JSON.stringify(detail);
        throw new Error(message || `API answered ${r.status}`);
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
  }, [url, enabled]);

  return {
    data: enabled ? data : null,
    error: enabled ? error : null,
    pending: enabled && done !== url,
  };
}

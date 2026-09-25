import { useEffect, useState } from "react";
export function useRemote(loader, dependencies) {
  const [result, setResult] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    Promise.resolve()
      .then(loader)
      .then((value) => {
        if (alive) setResult(value);
      })
      .catch((err) => {
        if (alive) setError(err.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // Callers provide the resource identity explicitly, not the inline loader function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, refresh]);
  return { result, loading, error, reload: () => setRefresh((n) => n + 1) };
}
export function useDebounced(value, delay = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

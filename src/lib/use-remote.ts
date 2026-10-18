import { useEffect, useState } from 'react';

export type Remote<T> = { data: T | null; error: string | null; loading: boolean };

/**
 * Loads something from the server, and again every `pollMs` while `keepPolling(data)` says so.
 * `load` must keep the same identity between renders (wrap it in useCallback), `keepPolling` too.
 */
export function useRemote<T>(load: () => Promise<T | null>, pollMs?: number, keepPolling?: (data: T) => boolean): Remote<T> {
  const [state, setState] = useState<Remote<T>>({ data: null, error: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    let latest: T | null = null;
    const run = () =>
      load()
        .then((data) => {
          if (cancelled) return;
          latest = data ?? latest;
          setState((prev) => ({ data: data ?? prev.data, error: data ? null : 'Could not load this', loading: false }));
        })
        .catch(() => !cancelled && setState((prev) => ({ ...prev, error: 'Server not reachable', loading: false })));
    void run();
    const timer =
      pollMs && keepPolling
        ? setInterval(() => {
            if (latest !== null && keepPolling(latest)) void run();
          }, pollMs)
        : undefined;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [load, pollMs, keepPolling]);

  return state;
}

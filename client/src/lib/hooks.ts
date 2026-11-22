import { useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { api, ApiError, isQueued, netStore } from './api';
import { useToast } from '../components/toast';

/** GET a path. The query key is the path, so invalidating "/desk" refreshes every desk query. */
export function useApi<T>(path: string | null, opts: Partial<UseQueryOptions<T>> = {}) {
  return useQuery<T>({
    queryKey: [path],
    queryFn: () => api<T>(path!),
    enabled: !!path,
    ...opts,
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return useCallback(
    (...prefixes: string[]) =>
      qc.invalidateQueries({
        predicate: (q) => typeof q.queryKey[0] === 'string' && prefixes.some((p) => (q.queryKey[0] as string).startsWith(p)),
      }),
    [qc],
  );
}

interface ActionOptions<R> {
  success?: string | ((r: R) => string);
  /** Shown when the action was saved offline to sync later. */
  queued?: string;
  invalidate?: string[];
  onSuccess?: (r: R) => void;
  onError?: (e: ApiError) => boolean | void; // return true when handled
}

/** Run a mutation with loading state, toasts, and cache invalidation. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, opts: ActionOptions<R> = {}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const invalidate = useInvalidate();
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setBusy(true);
      try {
        const r = await fn(...args);
        if (isQueued(r)) {
          toast({ tone: 'warn', title: 'Saved on this device', text: opts.queued ?? 'It will sync when the connection is back.' });
        } else if (opts.success) {
          toast({ tone: 'ok', title: typeof opts.success === 'function' ? opts.success(r) : opts.success });
        }
        if (opts.invalidate) await invalidate(...opts.invalidate);
        opts.onSuccess?.(r);
        return r;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(0, e instanceof Error ? e.message : 'Something went wrong.');
        if (!opts.onError?.(err)) toast({ tone: 'bad', title: err.message });
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn, toast, invalidate],
  );
  return [run, busy] as const;
}

export function useNet() {
  return useSyncExternalStore(netStore.subscribe, netStore.get);
}

/** Re-render every `ms` (for live timers). */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);
}

/**
 * API client with offline support for unreliable gym Wi-Fi:
 *  - GET responses are cached per signed-in user, and served from cache when the network is down.
 *  - "Queueable" actions (time in/out, logging stats) are saved to an outbox while offline
 *    with the time they happened, and replayed in order once the server is reachable again.
 */
import { localDateTime } from './format';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------- Connectivity store ----------

type NetState = { online: boolean; pending: number; syncing: boolean };
let net: NetState = { online: navigator.onLine, pending: readOutbox().length, syncing: false };
const listeners = new Set<() => void>();
function setNet(patch: Partial<NetState>) {
  const next = { ...net, ...patch };
  if (next.online === net.online && next.pending === net.pending && next.syncing === net.syncing) return;
  net = next;
  listeners.forEach((l) => l());
}
export const netStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  get: () => net,
};

// ---------- Cache ----------

const CACHE_PREFIX = 'gym:cache:';
let cacheScope = 'anon';
export function setCacheScope(userId: number | null) {
  cacheScope = userId ? `u${userId}` : 'anon';
}
function cacheKey(path: string) {
  return `${CACHE_PREFIX}${cacheScope}:${path}`;
}
function writeCache(path: string, data: unknown) {
  try {
    localStorage.setItem(cacheKey(path), JSON.stringify({ t: Date.now(), data }));
  } catch {
    /* storage full or blocked: caching is best-effort */
  }
}
function readCache<T>(path: string): T | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(path));
    return raw ? (JSON.parse(raw).data as T) : undefined;
  } catch {
    return undefined;
  }
}
/** Remove cached data and queued actions. Called on sign-out so a shared PC keeps nothing behind. */
export function clearLocalData() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('gym:')) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
  setNet({ pending: 0 });
}

// ---------- Core request ----------

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Save to the outbox if the server can't be reached. Label is shown to the user. */
  queue?: string;
}

async function send(path: string, method: string, body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.code);
  return data;
}

const isNetworkError = (err: unknown) => err instanceof TypeError || (err instanceof ApiError && err.status >= 502 && err.status <= 504);

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  try {
    const data = await send(path, method, opts.body);
    setNet({ online: true });
    if (method === 'GET') writeCache(path, data);
    if (readOutbox().length) void flushOutbox();
    return data as T;
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    setNet({ online: false });
    if (method === 'GET') {
      const cached = readCache<T>(path);
      if (cached !== undefined) return cached;
      throw new ApiError(0, "You're offline and this page hasn't been saved on this device yet.", 'OFFLINE');
    }
    if (opts.queue) {
      enqueue({ path, method, body: { ...(opts.body as object), at: localDateTime() }, label: opts.queue });
      return { queued: true } as T;
    }
    throw new ApiError(0, "Can't reach the gym server. Check the Wi-Fi and try again.", 'OFFLINE');
  }
}

export const isQueued = (r: unknown): boolean => !!r && typeof r === 'object' && (r as { queued?: boolean }).queued === true;

// ---------- Outbox ----------

interface OutboxItem {
  id: string;
  path: string;
  method: string;
  body: unknown;
  label: string;
  scope: string;
}
const OUTBOX = 'gym:outbox';
function readOutbox(): OutboxItem[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) ?? '[]');
  } catch {
    return [];
  }
}
function writeOutbox(items: OutboxItem[]) {
  try {
    localStorage.setItem(OUTBOX, JSON.stringify(items));
  } catch {
    /* ignore */
  }
  setNet({ pending: items.filter((i) => i.scope === cacheScope).length });
}
function enqueue(item: Omit<OutboxItem, 'id' | 'scope'>) {
  writeOutbox([...readOutbox(), { ...item, id: crypto.randomUUID?.() ?? String(Date.now()), scope: cacheScope }]);
}
export function pendingItems() {
  return readOutbox().filter((i) => i.scope === cacheScope);
}

type SyncReport = { synced: string[]; failed: { label: string; error: string }[] };
const syncListeners = new Set<(r: SyncReport) => void>();
export function onSynced(fn: (r: SyncReport) => void) {
  syncListeners.add(fn);
  return () => { syncListeners.delete(fn); };
}

let flushing = false;
export async function flushOutbox() {
  if (flushing) return;
  const mine = pendingItems();
  if (!mine.length) return;
  flushing = true;
  setNet({ syncing: true });
  const report: SyncReport = { synced: [], failed: [] };
  try {
    for (const item of mine) {
      try {
        await send(item.path, item.method, item.body);
        report.synced.push(item.label);
      } catch (err) {
        if (isNetworkError(err)) {
          setNet({ online: false });
          break;
        }
        // The server refused it (e.g. already timed in). Drop it and tell the user why.
        report.failed.push({ label: item.label, error: err instanceof Error ? err.message : 'Rejected' });
      }
      writeOutbox(readOutbox().filter((x) => x.id !== item.id));
    }
    if (report.synced.length || report.failed.length) setNet({ online: true });
  } finally {
    flushing = false;
    setNet({ syncing: false });
  }
  if (report.synced.length || report.failed.length) syncListeners.forEach((l) => l(report));
}

window.addEventListener('online', () => {
  setNet({ online: true });
  void flushOutbox();
});
window.addEventListener('offline', () => setNet({ online: false }));
setInterval(() => {
  if (pendingItems().length) void flushOutbox();
}, 20_000);

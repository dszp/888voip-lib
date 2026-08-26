/**
 * Caching, as a contract the caller satisfies rather than a store this library owns.
 *
 * ── Why an interface and not a KVNamespace ─────────────────────────────────────────
 *
 * The MCP server this client came from took a `KVNamespace` directly, which is the one thing
 * in it that was not portable: it bound the client to Workers for a capability — "remember a
 * string for N seconds" — that every runtime has. Two methods over strings is the smallest
 * declaration of what this library actually needs, so a Worker passes KV, Node passes a Map,
 * and a caller who does not want caching passes nothing.
 *
 * Strings rather than parsed values on purpose: KV's typed `get(key, 'json')` is a Workers
 * convenience, and requiring it would put a Workers-shaped method back into the contract.
 */
export interface VoipCache {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/**
 * An in-process cache, for Node scripts and tests.
 *
 * ⚠️ NOT for a Worker. Module state in a Worker lives only as long as the isolate, so this
 * would give one instance a cache and the next none — a rate-limit incident that reproduces
 * only under load. Pass a KV-backed `VoipCache` there.
 *
 * `now` is injected so expiry is testable without a timer.
 */
export function memoryCache(now: () => number = () => Date.now()): VoipCache {
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    async get(key) {
      const hit = store.get(key);
      if (hit === undefined) return null;
      if (hit.expiresAt <= now()) { store.delete(key); return null; }
      return hit.value;
    },
    async put(key, value, ttlSeconds) {
      store.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
    },
  };
}

/**
 * Read through a cache, or call the fetcher when there is none.
 *
 * ⚠️ A rejected fetch writes nothing. Caching a failure would turn a one-second upstream blip
 * into a minute of them, and the caller cannot tell the difference from the outside.
 */
export async function getOrFetch<T>(
  cache: VoipCache | undefined,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  if (cache === undefined) return fetcher();
  const hit = await cache.get(key);
  if (hit !== null) return JSON.parse(hit) as T;
  const value = await fetcher();
  // KV's own minimum is 60s; clamping here means a caller cannot request a TTL that KV would
  // silently raise, so what this asks for and what the store does agree in every backend.
  await cache.put(key, JSON.stringify(value), Math.max(60, ttlSeconds));
  return value;
}

/** A stable key from a path and its params. Sorted, so argument order cannot fragment a cache. */
export function cacheKey(path: string, params: Record<string, unknown> = {}): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== false && !(Array.isArray(v) && v.length === 0))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? [...v].map(String).sort().join(',') : String(v)}`);
  return `v1:${path}${parts.length > 0 ? `?${parts.join('&')}` : ''}`;
}

/**
 * TTLs in seconds, chosen against the per-minute upstream limits rather than against taste.
 *
 * A single order is 5/min, which is the tightest, and 60s is also KV's floor — so the order
 * endpoints sit at the floor and everything slower-moving sits above it.
 */
export const TTL = {
  productsList: 300,
  product: 120,
  categories: 300,
  ordersList: 60,
  order: 60,
  privateWarehouses: 300,
} as const;

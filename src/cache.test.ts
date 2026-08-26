import { describe, it, expect, vi } from 'vitest';
import { cacheKey, getOrFetch, memoryCache, TTL } from './cache';

describe('cacheKey', () => {
  it('is stable regardless of the order params were supplied in', () => {
    expect(cacheKey('products', { b: 2, a: 1 })).toBe(cacheKey('products', { a: 1, b: 2 }));
  });

  it('sorts array values so two equivalent filters share one entry', () => {
    expect(cacheKey('products', { skus: ['b', 'a'] })).toBe(cacheKey('products', { skus: ['a', 'b'] }));
  });

  it('drops undefined, false and empty arrays rather than encoding them', () => {
    expect(cacheKey('orders', { page: 1, privateStock: false, skus: [], x: undefined }))
      .toBe('v1:orders?page=1');
  });

  it('carries a version prefix so a shape change can invalidate every entry at once', () => {
    expect(cacheKey('categories')).toBe('v1:categories');
  });
});

describe('getOrFetch', () => {
  it('calls the fetcher once and serves the second call from the cache', async () => {
    const cache = memoryCache();
    const fetcher = vi.fn(async () => ({ n: 1 }));
    expect(await getOrFetch(cache, 'k', 60, fetcher)).toEqual({ n: 1 });
    expect(await getOrFetch(cache, 'k', 60, fetcher)).toEqual({ n: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('calls the fetcher every time when no cache was supplied', async () => {
    const fetcher = vi.fn(async () => ({ n: 1 }));
    await getOrFetch(undefined, 'k', 60, fetcher);
    await getOrFetch(undefined, 'k', 60, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('re-fetches once the entry has expired', async () => {
    let clock = 0;
    const cache = memoryCache(() => clock);
    const fetcher = vi.fn(async () => ({ n: clock }));
    await getOrFetch(cache, 'k', 60, fetcher);
    clock = 61_000;
    await getOrFetch(cache, 'k', 60, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not let a rejected fetch poison the cache', async () => {
    const cache = memoryCache();
    await expect(getOrFetch(cache, 'k', 60, async () => { throw new Error('upstream down'); }))
      .rejects.toThrow('upstream down');
    expect(await getOrFetch(cache, 'k', 60, async () => ({ n: 2 }))).toEqual({ n: 2 });
  });
});

describe('TTL', () => {
  it('caches a single order at least as long as its 5/min limit implies', () => {
    expect(TTL.order).toBeGreaterThanOrEqual(60);
    expect(TTL.ordersList).toBeGreaterThanOrEqual(60);
  });
});

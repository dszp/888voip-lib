import { describe, it, expect, vi, afterEach } from 'vitest';
import { VoipClient, type VoipClientOptions } from './readClient';
import { memoryCache } from './cache';
import { fakeOrder, stubFetch } from './testkit';

const BASE = 'https://api.example.com';
// `VoipClientOptions['cache']`, not a `Parameters<typeof …prototype.constructor>` expression:
// TS types a class's `prototype.constructor` as `Function`, whose Parameters is `any[]`, so
// that form compiles to `any` at best and errors under this repo's settings.
const client = (cache?: VoipClientOptions['cache']) =>
  new VoipClient(cache === undefined ? { baseUrl: BASE, token: 'tok' } : { baseUrl: BASE, token: 'tok', cache });

afterEach(() => { vi.unstubAllGlobals(); });

describe('getOrders', () => {
  it('returns the page envelope', async () => {
    stubFetch({ '/api/orders?page=1': { body: { total: 1, page: 1, lastPage: 1, orders: [fakeOrder()] } } });
    const page = await client().getOrders();
    expect(page.total).toBe(1);
    expect(page.orders[0]?.orderNumber).toBe(100001);
  });

  it('asks for newest-first only when told to', async () => {
    const spy = stubFetch({ '/api/orders?page=1&orderBy=desc': { body: { total: 0, page: 1, lastPage: 1, orders: [] } } });
    await client().getOrders({ newestFirst: true });
    expect(String(spy.mock.calls[0]![0])).toContain('orderBy=desc');
  });

  it('maps upstream 400 "No orders found." to an empty page, not an error', async () => {
    stubFetch({ '/api/orders?page=1': { status: 400, body: { message: 'No orders found.', response: 'failed' } } });
    await expect(client().getOrders()).resolves.toEqual({ total: 0, page: 1, lastPage: 1, orders: [] });
  });

  it('still throws on a 400 that is not the empty-account case', async () => {
    stubFetch({ '/api/orders?page=1': { status: 400, body: { message: 'Bad page' } } });
    await expect(client().getOrders()).rejects.toMatchObject({ status: 400 });
  });
});

describe('getOrder', () => {
  it('unwraps the order envelope', async () => {
    stubFetch({ '/api/orders/100001': { body: { order: fakeOrder(), response: 'success' } } });
    expect((await client().getOrder('100001'))?.erpOrderNumber).toBe('SO0000001');
  });

  it('returns null on 404 rather than throwing, so a page can render "no longer returned"', async () => {
    stubFetch({ '/api/orders/999': { status: 404, body: 'not found' } });
    await expect(client().getOrder('999')).resolves.toBeNull();
  });

  it('returns null on the 400 "Order not found." that staging actually sends', async () => {
    stubFetch({ '/api/orders/99999999': { status: 400, body: { message: 'Order not found.', response: 'failed' } } });
    await expect(client().getOrder('99999999')).resolves.toBeNull();
  });

  it('still throws on a 400 that is not the not-found case', async () => {
    stubFetch({ '/api/orders/1': { status: 400, body: { message: 'Bad request' } } });
    await expect(client().getOrder('1')).rejects.toMatchObject({ status: 400 });
  });

  it('still throws on a 500, which is not the same fact as "no such order"', async () => {
    stubFetch({ '/api/orders/1': { status: 500, body: 'boom' } });
    await expect(client().getOrder('1')).rejects.toMatchObject({ status: 500 });
  });

  it('accepts an ERP order number as well as a web one', async () => {
    const spy = stubFetch({ '/api/orders/SO0000001': { body: { order: fakeOrder() } } });
    await client().getOrder('SO0000001');
    expect(String(spy.mock.calls[0]![0])).toBe(`${BASE}/api/orders/SO0000001`);
  });
});

describe('caching', () => {
  it('serves a repeated order fetch from the cache', async () => {
    const spy = stubFetch({ '/api/orders/100001': { body: { order: fakeOrder() } } });
    const c = client(memoryCache());
    await c.getOrder('100001');
    await c.getOrder('100001');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not cache a null, so a newly-visible order is not hidden for a minute', async () => {
    const spy = stubFetch({ '/api/orders/999': { status: 400, body: { message: 'Order not found.' } } });
    const c = client(memoryCache());
    await c.getOrder('999');
    await c.getOrder('999');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('getProducts', () => {
  it('normalises every product in the list', async () => {
    stubFetch({ '/api/products': { body: { products: [{
      sku: 'ACME-1', name: 'Acme &amp; Co', price: 1, qty: 1,
      stockByWarehouse: { BUF: 1 }, categories: 'A;A;',
    }] } } });
    const [p] = await client().getProducts();
    expect(p?.name).toBe('Acme & Co');
    expect(p?.categories).toBe('A');
  });

  it('sends array filters in PHP bracket form', async () => {
    const spy = stubFetch({ '/api/products?skus%5B%5D=ACME-1&privateStock=1': { body: { products: [] } } });
    await client().getProducts({ skus: ['ACME-1'], privateStock: true });
    const url = String(spy.mock.calls[0]![0]);
    expect(url).toContain('skus%5B%5D=ACME-1');
    expect(url).toContain('privateStock=1');
  });
});

describe('cache identity', () => {
  it('does not let two servers sharing one cache serve each other\'s orders', async () => {
    // sv-dashboard runs staging and production side by side. Keyed on the path alone, the
    // second client would have answered from the first one's entry.
    const shared = memoryCache();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const host = new URL(String(input)).host;
      return new Response(JSON.stringify({
        order: fakeOrder({ erpOrderNumber: host === 'api.example.com' ? 'SO-LIVE' : 'SO-STAGING' }),
      }), { status: 200 });
    }));
    const live = new VoipClient({ baseUrl: BASE, token: 'tok', cache: shared });
    const staging = new VoipClient({ baseUrl: 'https://staging.example.com', token: 'tok2', cache: shared });
    expect((await live.getOrder('100001'))?.erpOrderNumber).toBe('SO-LIVE');
    expect((await staging.getOrder('100001'))?.erpOrderNumber).toBe('SO-STAGING');
  });

  it('separates two accounts on one host when given a namespace', async () => {
    const shared = memoryCache();
    let n = 0;
    const spy = vi.fn(async () => new Response(
      JSON.stringify({ order: fakeOrder({ erpOrderNumber: `SO-${++n}` }) }), { status: 200 }));
    vi.stubGlobal('fetch', spy);
    const a = new VoipClient({ baseUrl: BASE, token: 'tok', cache: shared, cacheNamespace: 'acct-a' });
    const b = new VoipClient({ baseUrl: BASE, token: 'tok', cache: shared, cacheNamespace: 'acct-b' });
    await a.getOrder('100001');
    await b.getOrder('100001');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('an unexpected 200', () => {
  it('names the missing envelope key instead of failing somewhere downstream', async () => {
    stubFetch({ '/api/orders/100001': { body: { response: 'success' } } });
    await expect(client().getOrder('100001')).rejects.toThrow(/unexpected shape.*"order"/);
  });

  it('leaves nothing in the cache to poison the next call', async () => {
    // The old code stringified `undefined` and handed the literal `undefined` to cache.put,
    // which then blew up one call later, a step removed from the cause.
    const cache = memoryCache();
    stubFetch({ '/api/orders/100001': { body: { response: 'success' } } });
    await expect(client(cache).getOrder('100001')).rejects.toThrow(/unexpected shape/);
    expect(await cache.get('v1:api.example.com/orders/100001')).toBeNull();
  });

  it('catches a dot-segment order id, which the URL normalises into the list endpoint', async () => {
    stubFetch({ '/api/orders/': { body: { total: 0, page: 1, lastPage: 1, orders: [] } } });
    await expect(client().getOrder('.')).rejects.toThrow(/unexpected shape/);
  });

  it('names the missing key on a product list too', async () => {
    stubFetch({ '/api/products': { body: { response: 'success' } } });
    await expect(client().getProducts()).rejects.toThrow(/unexpected shape.*"products"/);
  });
});

describe('getProduct', () => {
  it('encodes a sku that contains URL punctuation', async () => {
    const spy = stubFetch({ '/api/products/ACME%2FPHONE%201': { body: { product: {
      sku: 'ACME/PHONE 1', name: 'Acme', price: 1, qty: 1, stockByWarehouse: {},
    } } } });
    await client().getProduct('ACME/PHONE 1');
    expect(String(spy.mock.calls[0]![0])).toBe(`${BASE}/api/products/ACME%2FPHONE%201`);
  });

  it('asks for private stock only when told to', async () => {
    const spy = stubFetch({ '/api/products/ACME-1?privateStock=1': { body: { product: {
      sku: 'ACME-1', name: 'Acme', price: 0, qty: 0, stockByWarehouse: {},
    } } } });
    await client().getProduct('ACME-1', { privateStock: true });
    expect(String(spy.mock.calls[0]![0])).toContain('privateStock=1');
  });

  it('derives the markdown description without being asked, and leaves the HTML alone', async () => {
    stubFetch({ '/api/products/ACME-1': { body: { product: {
      sku: 'ACME-1', name: 'Acme', price: 1, qty: 1, stockByWarehouse: {},
      description: '<p>Ships with a <strong>5V/2A</strong> supply.</p>',
    } } } });
    const p = await client().getProduct('ACME-1');
    expect(p.descriptionMarkdown).toBe('Ships with a **5V/2A** supply.');
    expect(p.description).toBe('<p>Ships with a <strong>5V/2A</strong> supply.</p>');
  });
});

describe('the remaining list endpoints', () => {
  it('returns categories verbatim, because they are the filter keys', async () => {
    stubFetch({ '/api/categories': { body: { categories: ['Adapters & Connectors', 'Wi-Fi & DECT'] } } });
    await expect(client().getCategories()).resolves.toEqual(['Adapters & Connectors', 'Wi-Fi & DECT']);
  });

  it('unwraps private warehouses from their own envelope key', async () => {
    stubFetch({ '/api/private-warehouses': { body: { warehouses: [{ warehouse: 'BUF', description: 'Buffalo' }] } } });
    await expect(client().getPrivateWarehouses()).resolves.toEqual([{ warehouse: 'BUF', description: 'Buffalo' }]);
  });
});

describe('a line with no serialised units', () => {
  it('carries an entry with no mac at all, which the type must allow', async () => {
    stubFetch({ '/api/orders/100001': { body: { order: fakeOrder() } } });
    const order = await client().getOrder('100001');
    const psu = order?.items.find((i) => i.sku === 'ACME-PSU-1');
    expect(psu?.serialsAndMacs?.[0]?.mac).toBeUndefined();
    // And the entry count is not the unit count: one entry stands for a qty of three.
    expect(psu?.serialsAndMacs).toHaveLength(1);
    expect(psu?.qty).toBe(3);
  });
});

describe('onCacheRead', () => {
  it('reports a miss then a hit for the same read', async () => {
    stubFetch({ '/api/orders/100001': { body: { order: fakeOrder() } } });
    const seen: Array<{ key: string; cached: boolean }> = [];
    const c = new VoipClient({
      baseUrl: BASE, token: 'tok', cache: memoryCache(),
      onCacheRead: (e) => { seen.push(e); },
    });
    await c.getOrder('100001');
    await c.getOrder('100001');
    expect(seen.map((e) => e.cached)).toEqual([false, true]);
    expect(seen[0]?.key).toBe('v1:api.example.com/orders/100001');
  });

  it('reports a miss for every other endpoint too', async () => {
    stubFetch({ '/api/categories': { body: { categories: ['A'] } } });
    const seen: boolean[] = [];
    const c = new VoipClient({
      baseUrl: BASE, token: 'tok', cache: memoryCache(),
      onCacheRead: (e) => { seen.push(e.cached); },
    });
    await c.getCategories();
    await c.getCategories();
    expect(seen).toEqual([false, true]);
  });

  it('does not fire for a not-found order, which is never a cache read', async () => {
    stubFetch({ '/api/orders/999': { status: 400, body: { message: 'Order not found.' } } });
    const seen: boolean[] = [];
    const c = new VoipClient({
      baseUrl: BASE, token: 'tok', cache: memoryCache(),
      onCacheRead: (e) => { seen.push(e.cached); },
    });
    expect(await c.getOrder('999')).toBeNull();
    expect(seen).toEqual([]);
  });
});

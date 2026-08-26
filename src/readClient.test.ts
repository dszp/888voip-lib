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
    await client().getOrders(1, true);
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

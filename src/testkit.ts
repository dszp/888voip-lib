/**
 * Test helpers. NOT part of the public surface — `tsconfig.json` excludes this from the build.
 *
 * ⚠️ Every fixture here is FICTIONAL, and must stay that way. This repo is written to be
 * published, and a real MAC, serial, customer name or order number committed once is published
 * forever. `ACME`, `example.com` and obviously-fake identifiers only.
 */
import { vi } from 'vitest';
import type { Order } from './model.js';

/** Stub `fetch`, routing by `pathname + search`. An unrouted path answers 404. */
export function stubFetch(routes: Record<string, { status?: number; body: unknown }>) {
  const spy = vi.fn(async (input: RequestInfo | URL) => {
    const { pathname, search } = new URL(String(input));
    const hit = routes[pathname + search] ?? routes[pathname];
    if (hit === undefined) return new Response('no route', { status: 404 });
    const body = typeof hit.body === 'string' ? hit.body : JSON.stringify(hit.body);
    return new Response(body, { status: hit.status ?? 200 });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

/** A fictional order, shaped exactly like a real one. Override any field. */
export function fakeOrder(over: Partial<Order> = {}): Order {
  const address = {
    firstName: 'Ada', lastName: 'Doe', company: 'Acme Widgets, Inc.',
    address: '1 Example Way', address1: '1 Example Way', address2: 'Suite 2',
    city: 'Springfield', state: 'IN', postcode: '40000', country: 'US',
    telephone: '555-0100',
  };
  return {
    orderNumber: 100001,
    orderStatus: 'completed',
    orderDate: '2026-01-05T10:00:00',
    orderShippedDate: '2026-01-06T09:00:00',
    shippingTotal: 10,
    total: 210,
    shipping: address,
    billing: address,
    items: [{
      lineNumber: 0, sku: 'ACME-PHONE-1', qty: 2, price: 100,
      serialsAndMacs: [
        { serial: 'FAKESERIAL0000001', mac: '020000000001' },
        { serial: 'FAKESERIAL0000002', mac: '020000000002' },
      ],
    }, {
      // A non-serialised line, shaped as production sends it: ONE entry for a qty of three,
      // its serial the SKU repeated, and no mac key at all.
      lineNumber: 1, sku: 'ACME-PSU-1', qty: 3, price: 9,
      serialsAndMacs: [{ serial: 'ACME-PSU-1' }],
    }],
    poOrderNumber: 'ACME-PO-1',
    erpOrderNumber: 'SO0000001',
    warehouse: 'BUF',
    tracking: [{ provider: 'fedex', trackingNumber: '000000000001' }],
    invoices: [],
    ...over,
  };
}

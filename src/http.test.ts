import { describe, it, expect, vi, afterEach } from 'vitest';
import { request, VoipApiError } from './http';

afterEach(() => { vi.unstubAllGlobals(); });

function stub(status: number, body: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })));
}

describe('request', () => {
  it('sends a bearer token and an Accept header', async () => {
    const spy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', spy);
    await request('https://api.example.com', 'tok-123', 'orders');
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toBe('https://api.example.com/api/orders');
    expect((init as RequestInit).headers).toMatchObject({
      Accept: 'application/json',
      Authorization: 'Bearer tok-123',
    });
  });

  it('joins a base URL that already ends in a slash without doubling it', async () => {
    const spy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', spy);
    await request('https://api.example.com/', 'tok-123', 'categories');
    expect(String(spy.mock.calls[0]![0])).toBe('https://api.example.com/api/categories');
  });

  it('appends repeated array params in PHP bracket form', async () => {
    const spy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', spy);
    const params = new URLSearchParams();
    params.append('skus[]', 'ACME-1');
    params.append('skus[]', 'ACME-2');
    await request('https://api.example.com', 't', 'products', params);
    expect(String(spy.mock.calls[0]![0]))
      .toBe('https://api.example.com/api/products?skus%5B%5D=ACME-1&skus%5B%5D=ACME-2');
  });

  it('throws VoipApiError carrying the upstream status and body', async () => {
    stub(404, 'not found');
    await expect(request('https://api.example.com', 't', 'orders/1'))
      .rejects.toMatchObject({ status: 404, body: 'not found' });
  });

  it('names the per-minute limits in a 429 message, because the caller cannot see them', async () => {
    stub(429, 'slow down');
    await expect(request('https://api.example.com', 't', 'orders'))
      .rejects.toThrow(/5\/min/);
  });

  // ⚠️ Asserted on `.message`, NOT via `toThrow(expect.not.stringContaining(...))`. That form
  // matches the asymmetric matcher against the thrown ERROR OBJECT rather than its message, and
  // `stringContaining` is false for a non-string — so `not.stringContaining` was true whatever
  // the message said. Verified by injecting the token into the message: the old assertion still
  // passed. A test that cannot fail is worse than no test, because it is counted.
  it('does not leak the token into the error message', async () => {
    stub(500, 'boom');
    await expect(request('https://api.example.com', 'sec-ret-token', 'orders'))
      .rejects.toThrowError(
        expect.objectContaining({ message: expect.not.stringContaining('sec-ret-token') }),
      );
  });

  it('does not leak the token into the error name or its stack either', async () => {
    stub(500, 'boom');
    const err = await request('https://api.example.com', 'sec-ret-token', 'orders')
      .then(() => null, (e: unknown) => e as Error);
    expect(err).not.toBeNull();
    expect(JSON.stringify({ n: err!.name, m: err!.message })).not.toContain('sec-ret-token');
  });
});

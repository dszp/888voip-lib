import { describe, it, expect, vi, afterEach } from 'vitest';
import { createToken, revokeAllTokens, revokeToken } from './auth';

afterEach(() => { vi.unstubAllGlobals(); });

describe('createToken', () => {
  it('POSTs credentials unauthenticated and returns the token', async () => {
    const spy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ token: '12|abc' }), { status: 200 }));
    vi.stubGlobal('fetch', spy);
    expect(await createToken('https://api.example.com', 'api@example.com', 'pw')).toBe('12|abc');
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toBe('https://api.example.com/api/create-token');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).not.toHaveProperty('Authorization');
    expect((init as RequestInit).body).toBe(JSON.stringify({ email: 'api@example.com', password: 'pw' }));
  });

  it('does not put the password in the error when the call fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_i: RequestInfo | URL, _n?: RequestInit) =>
      new Response('bad credentials', { status: 401 })));
    await expect(createToken('https://api.example.com', 'api@example.com', 'hunter2'))
      .rejects.toThrowError(
        expect.objectContaining({ message: expect.not.stringContaining('hunter2') }),
      );
  });

  it('fails loudly when the response carries no token', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_i: RequestInfo | URL, _n?: RequestInit) =>
      new Response(JSON.stringify({ response: 'success' }), { status: 200 })));
    await expect(createToken('https://api.example.com', 'a@example.com', 'pw'))
      .rejects.toThrow(/no token/i);
  });
});

describe('revokeToken', () => {
  it('DELETEs with the token it is revoking', async () => {
    const spy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', spy);
    await revokeToken('https://api.example.com', 'tok');
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toBe('https://api.example.com/api/revoke-token');
    expect((init as RequestInit).method).toBe('DELETE');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
  });
});

describe('revokeAllTokens', () => {
  it('hits the all-tokens path, which is a different blast radius', async () => {
    const spy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', spy);
    await revokeAllTokens('https://api.example.com', 'tok');
    expect(String(spy.mock.calls[0]![0])).toBe('https://api.example.com/api/revoke-all-tokens');
  });
});

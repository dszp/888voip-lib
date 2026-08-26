/**
 * One authenticated GET against the 888VoIP Channel Advantage API.
 *
 * Knows nothing about endpoints, so a new one is a method on the client rather than a change
 * here. Every request is a GET: this library has no write surface by charter.
 */

/**
 * An error carrying the upstream HTTP status, so a caller can branch on it.
 *
 * `status === 429` is the rate limit, and `status === 400` on the orders list is upstream's
 * way of saying "no orders" — see `VoipClient.getOrders`.
 *
 * ⚠️ The URL recorded here is PATH AND QUERY ONLY. The bearer token never appears in a message.
 */
export class VoipApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    pathAndQuery: string,
  ) {
    super(
      status === 429
        ? `888VoIP rate limit hit on ${pathAndQuery}. Limits are per-minute and tight: single ` +
          `order 5/min, order and product lists 10/min, single product 60/min. Wait ~60s, and ` +
          `prefer a cache or a batched call (products accepts a skus filter).`
        : `888VoIP API error ${status} on ${pathAndQuery}: ${body.slice(0, 500)}`,
    );
    this.name = 'VoipApiError';
  }
}

export async function request<T>(
  baseUrl: string,
  token: string,
  path: string,
  params?: URLSearchParams,
): Promise<T> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL(`api/${path}`, base);
  // append, not set: array filters repeat one key (`skus[]=a&skus[]=b`), which `set` collapses.
  if (params) for (const [k, v] of params) url.searchParams.append(k, v);

  const resp = await fetch(url.toString(), {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new VoipApiError(resp.status, await resp.text(), url.pathname + url.search);
  return (await resp.json()) as T;
}

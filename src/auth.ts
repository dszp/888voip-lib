import { VoipApiError } from './http';

/**
 * Minting and revoking 888VoIP bearer tokens.
 *
 * ── Why this is not on VoipClient ──────────────────────────────────────────────────
 *
 * `VoipClient` is a READ client, and the guarantee that buys is only worth what a reader can
 * verify at a glance: hold one, and you cannot change anything at 888VoIP. Minting a
 * credential is not a read, and a `client.createToken()` sitting among six getters would quietly
 * make that guarantee untrue.
 *
 * These are also used at a completely different moment — once, by a human rotating a secret —
 * whereas the client is used on every request. Different lifetime, different file.
 *
 * ⚠️ 888VoIP tokens NEVER EXPIRE. A leaked one is valid until revoked, so revocation is the
 * only rotation mechanism there is. That is why `revokeAllTokens` is here at all.
 */

async function send(baseUrl: string, path: string, init: RequestInit): Promise<unknown> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL(`api/${path}`, base);
  const resp = await fetch(url.toString(), {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
  });
  // ⚠️ The request BODY is never included in the error. On create-token that body is the
  // account password, and an error message is the single most likely thing to be logged,
  // pasted into a ticket, or shown on a page.
  if (!resp.ok) throw new VoipApiError(resp.status, await resp.text(), url.pathname);
  return resp.json();
}

/** POST /api/create-token — unauthenticated. Returns a bearer token that never expires. */
export async function createToken(baseUrl: string, email: string, password: string): Promise<string> {
  const data = await send(baseUrl, 'create-token', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }) as { token?: unknown };
  // A 200 with no token is not success. Returning `undefined as string` here would surface as
  // an unexplained 401 on the next call, one layer away from the cause.
  if (typeof data.token !== 'string' || data.token === '') {
    throw new Error('888VoIP create-token returned no token');
  }
  return data.token;
}

/** DELETE /api/revoke-token — revokes exactly the token used on the call. */
export async function revokeToken(baseUrl: string, token: string): Promise<void> {
  await send(baseUrl, 'revoke-token', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * DELETE /api/revoke-all-tokens — revokes EVERY token on the account.
 *
 * ⚠️ Including tokens held by other integrations you did not know about. This is the
 * break-glass call, not the rotation call; `revokeToken` is the one you almost always want.
 */
export async function revokeAllTokens(baseUrl: string, token: string): Promise<void> {
  await send(baseUrl, 'revoke-all-tokens', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

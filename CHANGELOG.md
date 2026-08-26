# Changelog

## 0.0.1 — unreleased

First cut, lifted out of the read-only 888VoIP MCP server so a Cloudflare Worker can call the
API without going through an interactively-authenticated MCP connector.

Three things changed in the lift:

- **The cache became an interface.** It took a `KVNamespace` before, which was the one thing in
  it bound to Workers.
- **Auth moved out of the client.** `createToken` and `revokeToken` are their own module, so
  holding a read client cannot mint a credential.
- **`getOrder` returns `null` for a missing order** instead of throwing. Not-found is an answer
  here, not a failure; 500 still throws.

Corrected against staging on 2026-08-26, after the probe in `spikes/live-check.ts`:

- **A missing order answers HTTP 400, not 404.** Order 99999999 returned
  `400 {"message":"Order not found.","response":"failed"}`, so `getOrder` treats that body as
  not-found as well as a 404 — the same 400-plus-a-message shape `getOrders` already handled for
  an empty account. A 400 saying anything else still throws.

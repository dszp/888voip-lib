# Changelog

## 0.0.1 — unreleased

First cut, lifted out of the read-only 888VoIP MCP server so a Cloudflare Worker can call the
API without going through an interactively-authenticated MCP connector.

Three things changed in the lift:

- **The cache became an interface.** It took a `KVNamespace` before, which was the one thing in
  it bound to Workers.
- **Auth moved out of the client.** `createToken` and `revokeToken` are their own module, so
  holding a read client cannot mint a credential.
- **`getOrder` returns `null` on 404** instead of throwing. Not-found is an answer here, not a
  failure; 500 still throws.

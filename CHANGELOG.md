# Changelog

## 0.1.1 — 2026-08-28

**0.1.0 could not be imported. Use this instead.**

Every relative specifier in `src/` was extensionless — `from './readClient'` — which `tsc` emits
verbatim, so `dist/index.js` asked Node for a file that does not exist and the published package
threw `ERR_MODULE_NOT_FOUND` on first import. Nothing in the repo could see it: `moduleResolution:
bundler` told the compiler to accept the form, and vitest resolves it too, so 79 tests and a clean
build passed over a package no consumer could load.

Fixed at the layer that can enforce it rather than only where it surfaced:

- **`module`/`moduleResolution` are now `NodeNext`**, matching the three sibling libraries — which
  is why they never had this bug. The compiler now refuses an extensionless relative import, so
  the mistake cannot be reintroduced by hand.
- **`pnpm verify` builds and then actually imports `dist/index.js` with Node**, and CI runs it
  after the tests. Build and test both passing on an unimportable artefact is the whole lesson:
  neither of them ever looked at what a consumer receives.

No API change. Every export, signature and behaviour is identical to 0.1.0.

## 0.1.0 — 2026-08-27

First public release. Lifted out of the read-only 888VoIP MCP server so a Cloudflare Worker can
call the API without going through an interactively-authenticated MCP connector — and that server
then folded onto this library and deleted its own copy, which is the only test of portability that
counts.

Three things changed in the lift:

- **The cache became an interface.** It took a `KVNamespace` before, which was the one thing in
  it bound to Workers.
- **Auth moved out of the client.** `createToken` and `revokeToken` are their own module, so
  holding a read client cannot mint a credential.
- **`getOrder` returns `null` for a missing order** instead of throwing. Not-found is an answer
  here, not a failure; 500 still throws.

Reviewed on 2026-08-27, before the MCP server became the first consumer. What that changed:

- **Cache keys are scoped to the API host.** `v1:orders?page=1` said nothing about WHICH 888VoIP
  answered it, so two clients over one store — staging beside production, which is exactly what
  sv-dashboard is built to do — served each other's data. `cacheNamespace` separates two accounts
  on one host. Never the token: keys get logged, listed and enumerated.
- **A 200 that is not the documented envelope now raises `VoipShapeError`** instead of failing
  somewhere downstream. `getOrder` used to stringify `undefined` into the cache on such a
  response, so the failure surfaced on the NEXT call inside `JSON.parse`.
- **`readThrough` is the caching primitive** and `getOrFetch` the wrapper over it; the client
  reports each read through the optional `onCacheRead`. Whether the cache answered is the only
  view a consumer has of its own rate-limit headroom, and it was unrecoverable after the lift.
- **`poRefOf` picks the first NON-BLANK field**, not the first non-nullish. A present-but-empty
  `poNumber` used to shadow a populated `poOrderNumber`. Latent rather than active: a live
  single-order response omits `poNumber` entirely.
- **`SerialAndMac.mac` is optional**, because a non-serialised line carries one entry whose
  serial is the SKU repeated and no `mac` at all. `serialsAndMacs.length` is not a unit count.
- **`Order.orderDate` carries no timezone** — documented, with the safe reading (take the date
  part, do not convert), because `new Date()` on it means a different instant per runtime.
- **A revoke answering 204 or an empty 200 is a success**; parsing it unconditionally made a
  successful revocation throw.
- `decodeHtmlEntities` no longer throws on an out-of-range numeric reference and now decodes
  uppercase hex; `htmlToMarkdown` keeps purely numeric list items and no longer mis-numbers an
  ordered list it trimmed.
- **Options objects replace positional booleans**: `getOrders({ page, newestFirst })`,
  `getProduct(sku, { privateStock })`, `getProducts(filters, { withMarkdown })`.

Corrected against staging on 2026-08-26, after the probe in `spikes/live-check.ts`:

- **A missing order answers HTTP 400, not 404.** Order 99999999 returned
  `400 {"message":"Order not found.","response":"failed"}`, so `getOrder` treats that body as
  not-found as well as a 404 — the same 400-plus-a-message shape `getOrders` already handled for
  an empty account. A 400 saying anything else still throws.

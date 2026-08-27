# Contributing to `@dszp/888voip-lib`

Bug reports, ideas, and pull requests are welcome. This library is small and opinionated; the rules
below are the opinions, and each exists for a concrete reason rather than taste.

## Getting started

**Package manager: pnpm.** No runtime dependencies — please keep it that way.

```
pnpm install
pnpm build         # tsc → dist/ (dist/index.js + dist/index.d.ts)
pnpm test          # the offline suite — must pass with NO credentials and no setup
pnpm typecheck     # includes the test files, which the build excludes
```

`pnpm test` must be green on a fresh clone with nothing configured. Every test stubs `fetch`;
none of them reach 888VoIP. The one thing that does is `spikes/live-check.ts`, which is a
throwaway probe you run by hand against a staging account — never part of the suite, because a
test that needs a credential and a network is a test that gets skipped.

## The rules

### 1. Fixtures and examples must be fictional

Every SKU, serial, MAC, order number, person, address and host in this repo — in code, comments,
tests, and the README — must be invented or reserved. No exceptions, including "just while I
debug". A real MAC or serial committed once is published forever.

| Use | Prefer |
|---|---|
| domains / hosts | `api.example.com`, `example.com` ([RFC 2606](https://www.rfc-editor.org/rfc/rfc2606)) |
| SKUs | `ACME-PHONE-1`, `ACME-PSU-1` |
| serials | `FAKESERIAL0000001` |
| MAC addresses | `020000000001` — the `02` prefix is the locally-administered bit, so it can't collide with a real vendor's |
| order numbers | `100001`, ERP `SO0000001` |
| people / companies | `Ada Doe`, `Acme Widgets, Inc.` |

`src/testkit.ts` holds the shared fixtures. Extend it rather than inventing a second set.

### 2. No credentials, and no references to where credentials live

Not a token, not a password, and **not a path into a secret manager either**. Such a reference
names an internal system, and is exactly as unwelcome here as the secret itself. Code that needs a
credential names the environment variable and stops there.

### 3. No defaults that bind the library to one deployment

`VoipClientOptions.baseUrl` is required and always will be. A default pointing at one company's
account is a bug, not a convenience — it makes the library silently wrong for the second user.

### 4. Keep it Node-free

`fetch`, `URL`, `URLSearchParams`, `Response`. Nothing from `node:*`, no `Buffer`, no
`process.env`, no filesystem. The same built output has to run unchanged in a Cloudflare Worker,
in Node, and in a browser — that portability is the reason this library exists, since a Worker
cannot call an interactively-authenticated MCP server.

`src/testkit.ts` imports vitest and is therefore excluded from the build and NOT exported from
`index.ts`; re-exporting it would put a devDependency in every consumer's runtime graph.

### 5. The read/write split is a charter, not an oversight

`VoipClient` exposes only GETs, and this package ships no write client. **Never add a mutating
method to it.** The point is that a consumer handed a `VoipClient` can know, without reading its
call sites, that it cannot place an order. If a write surface is ever needed — quotes, orders — it
is a sibling class with its own review, never a method here. Credential minting is already kept out
for the same reason: `createToken` lives in `auth.ts`, not on the client.

### 6. The cache is a contract, not a store

`VoipCache` is two methods over strings. It is deliberately not a `KVNamespace` — "remember a
string for N seconds" is a capability every runtime has, and taking Cloudflare's type for it was
the one thing in the original code that wasn't portable. Don't widen it to admit a nicer API from
one runtime.

Caching lives in the client rather than above it, because the thing that must not exceed the rate
limit is the HTTP call. `onCacheRead` reports what happened without letting a caller change it.

### 7. Record what the API DID, with a date

This vendor's docs and this vendor's responses disagree, repeatedly: numbers documented as strings,
"not found" answered with HTTP 400 rather than 404, a `mac` field the type promised and the API
omits. Where the two differ, the measurement wins and the comment says when it was taken. Please
keep that habit — "verified against staging 2026-08-26" is worth more than a confident sentence.

### 8. Doc comments are published API

Everything you write above an exported symbol lands in `dist/*.d.ts` and shows up on a stranger's
editor hover. Write them for that reader.

## Pull requests

- One logical change per PR; include a test.
- Run `pnpm build && pnpm test && pnpm typecheck` before opening. The suite must pass offline.
- Add a `CHANGELOG.md` entry for anything user-visible.
- Public API changes need a note on why the surface should grow — this library aims to stay small.

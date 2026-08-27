# @dszp/888voip-lib

Portable, Node-free toolkit for the [888VoIP](https://888voip.com) Channel Advantage API:
a read-only client, an injected cache interface, and the normalisations their API's quirks
require. Zero dependencies. Runs unchanged in a Cloudflare Worker, Node, or the browser.

## Install

```sh
pnpm add @dszp/888voip-lib
```

## Use

```ts
import { VoipClient, memoryCache, poRefOf } from '@dszp/888voip-lib';

const client = new VoipClient({
  baseUrl: 'https://api.888voip.com',
  token: process.env.VOIP888_TOKEN!,
  cache: memoryCache(),
});

const page = await client.getOrders({ newestFirst: true });
for (const order of page.orders) {
  console.log(order.orderNumber, order.orderStatus, poRefOf(order));
}
```

One cache, two servers, and the keys must say which is which — the client scopes every key to
the host of its `baseUrl`, so running staging beside production over a single KV namespace is
safe. Pass `cacheNamespace` only to separate two accounts on one host, and never pass the token:
keys get logged, listed and enumerated.

⚠️ A cached order carries live SIP credentials in its provisioning block. Back the cache with
something private and short-lived.

## Read only

`VoipClient` exposes only GETs, and this package ships no write client. Hold one and you know
it cannot place an order. Credentials are minted and revoked by `createToken` / `revokeToken`
in their own module, never as methods on the client.

## Caching is not optional in practice

The upstream per-minute limits are tight — a single order is **5/min**, the order and product
lists **10/min**. Pass a `cache`:

| Runtime | What to pass |
|---|---|
| Cloudflare Worker | a thin adapter over a KV namespace |
| Node script, tests | `memoryCache()` |
| No caching | omit it, and mind the limits |

`VoipCache` is two methods over strings — `get(key)` and `put(key, value, ttlSeconds)` — so
nothing here is bound to any one runtime.

```ts
const kvCache = {
  get: (k: string) => env.VOIP_CACHE.get(k),
  put: (k: string, v: string, ttl: number) => env.VOIP_CACHE.put(k, v, { expirationTtl: ttl }),
};
```

## Two behaviours worth knowing

**An account with no orders answers HTTP 400**, not an empty list. `getOrders` maps that one
message to an empty page; any other 400 still throws.

**`getOrder` returns `null` for a missing order** rather than throwing, because "this account
cannot see that order" is an ordinary answer — an order placed on a sister company's account, or
one predating the API, reaches you as `null`. Upstream signals that with `400 {"message":"Order
not found."}` rather than a 404, so both are read as not-found. A 500, or a 400 saying anything
else, still throws: not-found and upstream-broken are different facts.

## API

| Export | What it does |
|---|---|
| `VoipClient` | `getProducts`, `getProduct`, `getCategories`, `getOrders`, `getOrder`, `getPrivateWarehouses` |
| `createToken` / `revokeToken` / `revokeAllTokens` | Credential management. Tokens never expire; revocation is the only rotation. |
| `memoryCache`, `cacheKey`, `readThrough`, `getOrFetch`, `TTL` | Caching, and the key and TTL choices behind it. `readThrough` also reports whether the cache answered. |
| `poRefOf` | The PO reference we gave the vendor, from either of the two field names it arrives under |
| `normalizeProduct`, `normalizeCategories`, `decodeHtmlEntities`, `htmlToMarkdown` | The upstream quirks, handled |
| `VoipApiError` | Carries `status` and `body` |
| `VoipShapeError` | A 200 that is not the envelope the endpoint documents — upstream answered, just not with something readable |

## License

MIT

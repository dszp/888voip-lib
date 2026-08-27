# Architecture

Seven files, each with one job, composed in one direction. Nothing imports its consumer.

```
model.ts      types only, no behaviour
http.ts       one authenticated GET; knows no endpoints
cache.ts      the VoipCache contract, an in-memory one, keys and TTLs
normalize.ts  the upstream quirks, as pure functions
   ↓
readClient.ts VoipClient — six GETs composed over the four above
auth.ts       token minting and revocation, deliberately not on the client
   ↓
index.ts      the public surface
```

## Why the cache is injected

The MCP server this came from constructed a cache over a `KVNamespace`. That made the client
unusable outside Workers for a capability every runtime has: remember a string for N seconds.
`VoipCache` is two methods over strings, which is the smallest declaration of what is actually
needed, so a Worker passes KV, a Node script passes a Map, and a caller who does not want
caching passes nothing.

Strings, not parsed values: KV's `get(key, 'json')` is a Workers convenience, and requiring it
would put a Workers-shaped method back into the contract.

## Why read and write are separate

A read client's guarantee — hold one and you cannot change anything upstream — is only worth
what a reader can verify at a glance. `VoipClient` exposes six getters and nothing else. This
package ships no write client at all; if one is ever needed it is a sibling class, never a
method here. `netsapiens-lib` (`NsClient` / `NsWriteClient`) and `ringotel-lib` hold the same
split for the same reason.

`createToken` is in `auth.ts` rather than on the client because minting a credential is not a
read, and because it happens once when a human rotates a secret rather than on every request.

## Where the API's real behaviour is documented

In this repository, at the code that handles it. The vendor's published documentation and the
vendor's actual responses disagree in several places — numbers documented as strings, "not
found" answered with HTTP 400 rather than 404, a `mac` field the docs promise and the API
omits — so every such case carries a comment saying what was measured and when. Start with
`poRefOf` in `normalize.ts`, `getOrders` and `getOrder` in `readClient.ts`, and
`SerialAndMac` in `model.ts`.

Where the two disagree, the measurement wins. A confident sentence in a vendor's docs is not
evidence about a vendor's server.

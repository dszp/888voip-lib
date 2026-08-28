/**
 * @dszp/888voip-lib — a portable, Node-free toolkit for the 888VoIP Channel Advantage API.
 *
 * READ ONLY by charter. There is no write client here, and `VoipClient` exposes only GETs, so
 * a consumer handed one can know it cannot place an order without reading its call sites.
 * Credential management lives in `auth.ts` for the same reason.
 *
 * ⚠️ `testkit.ts` is deliberately NOT exported: it imports vitest, and re-exporting it would
 * put a devDependency into every consumer's runtime graph.
 */
export { VoipClient } from './readClient.js';
export type { VoipClientOptions, OrdersOptions, ProductListOptions, ProductOptions } from './readClient.js';
export { VoipApiError, VoipShapeError } from './http.js';
export { createToken, revokeToken, revokeAllTokens } from './auth.js';
// Only `memoryCache` and the `VoipCache` type. `cacheKey`, `readThrough`, `getOrFetch` and `TTL`
// exist to serve caching that lives INSIDE the client, and nothing outside needs them — the MCP
// server that used them before the client owned its cache no longer does. Exporting them at 0.1.0
// would fix a key format and a read-through signature as public API forever. Adding an export
// later is a minor bump; removing one is a major.
export { memoryCache } from './cache.js';
export type { VoipCache } from './cache.js';
export { decodeHtmlEntities, htmlToMarkdown, normalizeCategories, normalizeProduct, poRefOf } from './normalize.js';
export type {
  Address, AssetTag, Invoice, Order, OrderItem, OrdersPage,
  PrivateWarehouse, Product, ProductDocument, ProductFilters, ProductImage,
  ProvisioningEntry, SerialAndMac, Tracking,
} from './model.js';

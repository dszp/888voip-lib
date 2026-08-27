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
export { VoipClient } from './readClient';
export type { VoipClientOptions, OrdersOptions, ProductListOptions, ProductOptions } from './readClient';
export { VoipApiError, VoipShapeError } from './http';
export { createToken, revokeToken, revokeAllTokens } from './auth';
export { cacheKey, getOrFetch, memoryCache, readThrough, TTL } from './cache';
export type { VoipCache } from './cache';
export { decodeHtmlEntities, htmlToMarkdown, normalizeCategories, normalizeProduct, poRefOf } from './normalize';
export type {
  Address, AssetTag, Invoice, Order, OrderItem, OrdersPage,
  PrivateWarehouse, Product, ProductDocument, ProductFilters, ProductImage,
  ProvisioningEntry, SerialAndMac, Tracking,
} from './model';

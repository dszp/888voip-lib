import { getOrFetch, cacheKey, TTL, type VoipCache } from './cache';
import { request, VoipApiError } from './http';
import { normalizeProduct } from './normalize';
import type { Order, OrdersPage, PrivateWarehouse, Product, ProductFilters } from './model';

export interface VoipClientOptions {
  /** e.g. `https://api.888voip.com` (live) or `https://stagingapi.888voip.com` (test). */
  baseUrl: string;
  /** A Sanctum bearer token. Tokens do not expire; see `auth.ts` to mint or revoke one. */
  token: string;
  /** Optional. Strongly recommended — the per-minute limits are tight. See `cache.ts`. */
  cache?: VoipCache;
}

/**
 * READ-ONLY client for the 888VoIP Channel Advantage API.
 *
 * Every method is a GET. There is deliberately no write surface on this class and no write
 * client in this package — so a consumer handed a `VoipClient` can know, without reading its
 * call sites, that it cannot place an order. `netsapiens-lib` and `ringotel-lib` hold the same
 * split for the same reason. If a write client is ever needed it is a sibling class, never a
 * method here.
 */
export class VoipClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly cache: VoipCache | undefined;

  constructor(opts: VoipClientOptions) {
    this.baseUrl = opts.baseUrl;
    this.token = opts.token;
    this.cache = opts.cache;
  }

  private get<T>(path: string, params?: URLSearchParams): Promise<T> {
    return request<T>(this.baseUrl, this.token, path, params);
  }

  private static productParams(filters: ProductFilters = {}): URLSearchParams {
    const params = new URLSearchParams();
    for (const make of filters.makes ?? []) params.append('makes[]', make);
    for (const cat of filters.categories ?? []) params.append('categories[]', cat);
    for (const sku of filters.skus ?? []) params.append('skus[]', sku);
    for (const pn of filters.partNumbers ?? []) params.append('partNumbers[]', pn);
    if (filters.privateStock === true) params.append('privateStock', '1');
    return params;
  }

  /** GET /api/products — 10/min upstream. `withMarkdown` derives `descriptionMarkdown`. */
  async getProducts(filters: ProductFilters = {}, withMarkdown = false): Promise<Product[]> {
    const key = cacheKey('products', { ...filters, withMarkdown });
    return getOrFetch(this.cache, key, TTL.productsList, async () => {
      const data = await this.get<{ products: Product[] }>('products', VoipClient.productParams(filters));
      return data.products.map((p) => normalizeProduct(p, withMarkdown));
    });
  }

  /** GET /api/products/{sku} — 60/min upstream. Always includes the markdown description. */
  async getProduct(sku: string, privateStock = false): Promise<Product> {
    const key = cacheKey(`products/${sku}`, { privateStock });
    return getOrFetch(this.cache, key, TTL.product, async () => {
      const params = new URLSearchParams();
      if (privateStock) params.append('privateStock', '1');
      const data = await this.get<{ product: Product }>(`products/${encodeURIComponent(sku)}`, params);
      return normalizeProduct(data.product, true);
    });
  }

  /** GET /api/categories — 10/min upstream. Values are returned VERBATIM; see normalizeCategories. */
  async getCategories(): Promise<string[]> {
    return getOrFetch(this.cache, cacheKey('categories'), TTL.categories, async () => {
      const data = await this.get<{ categories: string[] }>('categories');
      return data.categories;
    });
  }

  /**
   * GET /api/orders?page=N — 10/min upstream, 50 per page, oldest-first unless `newestFirst`.
   *
   * ⚠️ An account with NO orders answers HTTP 400 `{"message":"No orders found."}` rather than
   * an empty list (verified on staging). That is a fact about the account, not a failure, so it
   * is mapped to an empty page here — otherwise every consumer would have to know this quirk.
   * A 400 that says anything else still throws.
   */
  async getOrders(page = 1, newestFirst = false): Promise<OrdersPage> {
    const key = cacheKey('orders', { page, newestFirst });
    return getOrFetch(this.cache, key, TTL.ordersList, async () => {
      const params = new URLSearchParams({ page: String(page) });
      if (newestFirst) params.append('orderBy', 'desc');
      try {
        return await this.get<OrdersPage>('orders', params);
      } catch (e) {
        if (e instanceof VoipApiError && e.status === 400 && e.body.includes('No orders found')) {
          return { total: 0, page, lastPage: page, orders: [] };
        }
        throw e;
      }
    });
  }

  /**
   * GET /api/orders/{id} — 5/min upstream, the tightest limit on the API. Accepts a web order
   * number (`829431`) or an ERP one (`SO0345172`).
   *
   * ⚠️ Returns `null` on 404 rather than throwing, and a `null` is NOT cached.
   *
   * "This vendor does not return that order" is an answer a caller renders, not an exception it
   * handles — an order placed on a different account, or predating the API, is the ordinary
   * case rather than the error case. Caching the null would then hide a newly-visible order for
   * a minute, which is the one direction that costs someone a wasted lookup. Any other status,
   * a 500 included, still throws: not-found and upstream-broken are different facts.
   */
  async getOrder(orderId: string): Promise<Order | null> {
    const key = cacheKey(`orders/${orderId}`);
    const cached = this.cache === undefined ? null : await this.cache.get(key);
    if (cached !== null) return JSON.parse(cached) as Order;
    try {
      const data = await this.get<{ order: Order }>(`orders/${encodeURIComponent(orderId)}`);
      if (this.cache !== undefined) {
        await this.cache.put(key, JSON.stringify(data.order), Math.max(60, TTL.order));
      }
      return data.order;
    } catch (e) {
      if (e instanceof VoipApiError && e.status === 404) return null;
      throw e;
    }
  }

  /** GET /api/private-warehouses — 25/min upstream. */
  async getPrivateWarehouses(): Promise<PrivateWarehouse[]> {
    return getOrFetch(this.cache, cacheKey('private-warehouses'), TTL.privateWarehouses, async () => {
      const data = await this.get<{ warehouses: PrivateWarehouse[] }>('private-warehouses');
      return data.warehouses;
    });
  }
}

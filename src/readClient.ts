import { getOrFetch, cacheKey, TTL, type VoipCache } from './cache';
import { request, VoipApiError, VoipShapeError } from './http';
import { normalizeProduct } from './normalize';
import type { Order, OrdersPage, PrivateWarehouse, Product, ProductFilters } from './model';

export interface VoipClientOptions {
  /** e.g. `https://api.888voip.com` (live) or `https://stagingapi.888voip.com` (test). */
  baseUrl: string;
  /** A Sanctum bearer token. Tokens do not expire; see `auth.ts` to mint or revoke one. */
  token: string;
  /** Optional. Strongly recommended — the per-minute limits are tight. See `cache.ts`. */
  cache?: VoipCache;
  /**
   * Optional. What separates this client's cache entries from another's in a SHARED store.
   * Defaults to the host of `baseUrl`, which is what keeps staging and production apart when
   * both run against one KV namespace. Set it only to separate two accounts on ONE host.
   *
   * ⚠️ Never the token. Cache keys get logged, listed and enumerated; a credential in one is a
   * credential in all three places.
   */
  cacheNamespace?: string;
}

/**
 * Per-call options.
 *
 * Objects rather than positional booleans: `getOrders(1, true)` tells a reader nothing at the
 * call site, and every future option would have to queue up behind the ones already there.
 */
export interface ProductListOptions {
  /** Also derive `descriptionMarkdown` per product. Off by default — it is not free on a list. */
  withMarkdown?: boolean;
}

export interface ProductOptions {
  /** Report YOUR private warehouse stock instead of 888VoIP's. */
  privateStock?: boolean;
}

export interface OrdersOptions {
  /** 1-based; 50 orders per page. The response carries `lastPage`. */
  page?: number;
  /** Newest first. The API's own default is OLDEST first, which is rarely what you want. */
  newestFirst?: boolean;
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
  private readonly scope: string;

  constructor(opts: VoipClientOptions) {
    this.baseUrl = opts.baseUrl;
    this.token = opts.token;
    this.cache = opts.cache;
    // `new URL` throws here rather than on the first request, which is the difference between
    // "your baseUrl is wrong" and a puzzling failure a page later.
    this.scope = opts.cacheNamespace ?? new URL(opts.baseUrl).host;
  }

  private get<T>(path: string, params?: URLSearchParams): Promise<T> {
    return request<T>(this.baseUrl, this.token, path, params);
  }

  /**
   * A cache key scoped to the server this client talks to.
   *
   * ⚠️ The path alone is NOT a key. sv-dashboard runs staging and production side by side, and
   * an unscoped `v1:orders?page=1` means whichever client asked first answers for both — the
   * kind of wrong that looks like working software.
   */
  private key(path: string, params: Record<string, unknown> = {}): string {
    return cacheKey(`${this.scope}/${path}`, params);
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
  async getProducts(filters: ProductFilters = {}, opts: ProductListOptions = {}): Promise<Product[]> {
    const withMarkdown = opts.withMarkdown ?? false;
    const key = this.key('products', { ...filters, withMarkdown });
    return getOrFetch(this.cache, key, TTL.productsList, async () => {
      const data = await this.get<unknown>('products', VoipClient.productParams(filters));
      const products = unwrap<Product[]>(data, 'products', '/api/products');
      return products.map((p) => normalizeProduct(p, withMarkdown));
    });
  }

  /**
   * GET /api/products/{sku} — 60/min upstream.
   *
   * Includes `descriptionMarkdown` whenever the product has a description to derive it from.
   */
  async getProduct(sku: string, opts: ProductOptions = {}): Promise<Product> {
    const privateStock = opts.privateStock ?? false;
    const key = this.key(`products/${sku}`, { privateStock });
    return getOrFetch(this.cache, key, TTL.product, async () => {
      const params = new URLSearchParams();
      if (privateStock) params.append('privateStock', '1');
      const path = `products/${encodeURIComponent(sku)}`;
      const data = await this.get<unknown>(path, params);
      return normalizeProduct(unwrap<Product>(data, 'product', `/api/${path}`), true);
    });
  }

  /** GET /api/categories — 10/min upstream. Values are returned VERBATIM; see normalizeCategories. */
  async getCategories(): Promise<string[]> {
    return getOrFetch(this.cache, this.key('categories'), TTL.categories, async () => {
      const data = await this.get<unknown>('categories');
      return unwrap<string[]>(data, 'categories', '/api/categories');
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
  async getOrders(opts: OrdersOptions = {}): Promise<OrdersPage> {
    const page = opts.page ?? 1;
    const newestFirst = opts.newestFirst ?? false;
    const key = this.key('orders', { page, newestFirst });
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
   * ⚠️ Returns `null` when the order is not there, and a `null` is NOT cached.
   *
   * "This vendor does not return that order" is an answer a caller renders, not an exception it
   * handles — an order placed on a different account, or predating the API, is the ordinary
   * case rather than the error case. Caching the null would then hide a newly-visible order for
   * a minute, which is the one direction that costs someone a wasted lookup. Any other status,
   * a 500 included, still throws: not-found and upstream-broken are different facts.
   *
   * ⚠️ **Not-found arrives as HTTP 400, not 404.** Measured on staging 2026-08-26: asking for
   * order 99999999 answered `400 {"message":"Order not found.","response":"failed"}`. That is
   * the same shape `getOrders` already had to handle for an empty account, so this endpoint is
   * not an exception — 400-plus-a-message is simply how this API says "nothing here". 404 is
   * still treated as not-found too, because a gateway or a future version may well send one and
   * both mean the same thing to a caller. A 400 saying anything else still throws.
   */
  async getOrder(orderId: string): Promise<Order | null> {
    const key = this.key(`orders/${orderId}`);
    const cached = this.cache === undefined ? null : await this.cache.get(key);
    if (cached !== null) return JSON.parse(cached) as Order;
    try {
      const path = `orders/${encodeURIComponent(orderId)}`;
      const data = await this.get<unknown>(path);
      // Unwrap BEFORE the cache write. The old order stringified whatever `data.order` was, so
      // a shapeless 200 put the literal `undefined` into the store and the next call died on
      // JSON.parse instead — a step removed from the thing that was actually wrong.
      const order = unwrap<Order>(data, 'order', `/api/${path}`);
      if (this.cache !== undefined) {
        await this.cache.put(key, JSON.stringify(order), Math.max(60, TTL.order));
      }
      return order;
    } catch (e) {
      if (e instanceof VoipApiError && isOrderNotFound(e)) return null;
      throw e;
    }
  }

  /** GET /api/private-warehouses — 25/min upstream. */
  async getPrivateWarehouses(): Promise<PrivateWarehouse[]> {
    return getOrFetch(this.cache, this.key('private-warehouses'), TTL.privateWarehouses, async () => {
      const data = await this.get<unknown>('private-warehouses');
      return unwrap<PrivateWarehouse[]>(data, 'warehouses', '/api/private-warehouses');
    });
  }
}

/**
 * Read a documented key off a 200 response, or say plainly that it was not there.
 *
 * Cheap insurance against three things that all look alike from the outside: a gateway
 * answering HTML with a 200, upstream changing an envelope, and an order id that the URL
 * normalises away — `getOrder('.')` resolves to `/api/orders/`, which is the LIST endpoint and
 * answers 200 with no `order` at all.
 */
function unwrap<T>(data: unknown, key: string, pathAndQuery: string): T {
  if (typeof data !== 'object' || data === null || (data as Record<string, unknown>)[key] === undefined) {
    throw new VoipShapeError(pathAndQuery, key);
  }
  return (data as Record<string, unknown>)[key] as T;
}

/**
 * Is this error upstream saying "no such order", as opposed to upstream being broken?
 *
 * Measured on staging 2026-08-26: a missing order answers `400 {"message":"Order not found."}`,
 * not 404. 404 counts too — a proxy in front of the API, or a later version of it, may send one,
 * and to a caller the two carry identical information.
 */
function isOrderNotFound(e: VoipApiError): boolean {
  return e.status === 404 || (e.status === 400 && e.body.includes('Order not found'));
}

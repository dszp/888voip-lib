export interface ProductImage {
  name: string;
  url: string;
}

export interface ProductDocument {
  name: string;
  url: string;
}

/**
 * Numeric fields: the docs show decimal strings ("50") but the API returns
 * numbers (279) — accept both. `categories` is a semicolon-delimited string,
 * often with a trailing semicolon and exact duplicates
 * ("VoIP Phones;Yealink;Yealink;"); normalizeProduct() trims it, drops the
 * empties, and de-dupes. Plain-text display fields (name, image/document
 * names) arrive HTML-entity-encoded ("&amp;", "&#8211;") and are decoded
 * there too; `description` is intentional HTML and is left untouched.
 */
export interface Product {
  sku: string;
  partNumber?: string;
  name: string;
  /** HTML markup. */
  description?: string;
  /**
   * Markdown rendering of `description`, derived on demand by normalizeProduct
   * — always present on get_product, opt-in on get_products (markdownDescription).
   */
  descriptionMarkdown?: string;
  /** "0"/0 on privateStock queries. */
  price: string | number;
  make?: string;
  weight?: string | number;
  length?: string | number;
  width?: string | number;
  height?: string | number;
  /** Absent on privateStock queries. */
  msrp?: string | number;
  /** Warehouse code → quantity, e.g. { "BUF": 11241, "RNO": 681 } */
  stockByWarehouse: Record<string, string | number>;
  qty: number;
  images?: ProductImage[];
  categories?: string;
  documents?: ProductDocument[];
  /** Undocumented; present on staging responses. */
  dropship?: boolean;
}

export interface Address {
  firstName: string;
  lastName: string;
  company?: string;
  address?: string;
  address1?: string;
  address2?: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  telephone?: string;
}

/**
 * One unit on an order line — or a placeholder standing in for a line that has no units.
 *
 * ⚠️ `mac` IS OPTIONAL, and the type used to lie about that. Measured against a live production
 * order 2026-08-27: a line for a non-serialised item (a power supply, bought seven at a time)
 * carries a SINGLE entry whose `serial` is the SKU repeated and which has no `mac` key at all.
 * A consumer that trusted `mac: string` read `undefined` off a field the type promised.
 *
 * So `serialsAndMacs.length` is NOT a unit count, and an entry is not necessarily a unit. What
 * separates the two — a serial equal to the SKU, a missing mac, or the item's own `qty` — is a
 * judgement the importer makes with its own rules; there is one observation behind the shape
 * above and that is not enough to make a rule here.
 */
export interface SerialAndMac {
  serial: string;
  mac?: string;
}

export interface OrderItem {
  lineNumber: number;
  sku: string;
  qty: number;
  price: number;
  serialsAndMacs?: SerialAndMac[];
}

export interface Invoice {
  erpInvoiceNumber: string;
  type: string;
  status: string;
  totals?: { amount: number; balance: number };
  dueDate?: string;
}

export interface Tracking {
  provider: string;
  trackingNumber: string;
}

export interface AssetTag {
  firstName: string;
  lastName: string;
  extension: string;
  login?: string;
  pin?: string;
  serial?: string;
  mac?: string;
}

/**
 * Present only on an order placed through 888VoIP's provisioning service, where they stage the
 * phones before shipping them.
 *
 * ⚠️ SECRETS. `srvUser`/`srvPass` are the credentials for YOUR provisioning server, supplied on
 * `POST /api/orders` and read back in plaintext by anything holding the API token — so that token
 * is more than catalog access, and anything that stores or renders an order stores these too.
 * `AssetTag.login`/`pin` are per-extension credentials with the same property.
 *
 * Absent — not empty — on an order placed without a provisioning block.
 */
export interface ProvisioningEntry {
  sku: string;
  qty: number;
  provUrl?: string;
  srvUser?: string;
  srvPass?: string;
  assetTags?: AssetTag[];
}

/**
 * Statuses: Processing, On Hold, Completed, Cancelled (returned lowercase).
 * Verified against staging order lifecycle 2026-06-03: totals are numbers
 * (docs showed strings), orderShippedDate is null until shipment, billing
 * may be all-empty strings, items gain serialsAndMacs and the order gains
 * tracking only after shipment, and there's an undocumented `warehouse`.
 */
export interface Order {
  orderNumber: number;
  orderStatus: string;
  /**
   * ⚠️ NO TIMEZONE. Measured shape: `"2021-08-04T14:40:59"` — no `Z`, no offset, so
   * `new Date(orderDate)` parses it as LOCAL time and yields a different instant in a Worker
   * (UTC) than in a browser in Indiana. That is the one place "runs unchanged everywhere"
   * would have quietly meant "gives a different answer everywhere".
   *
   * Use the DATE PART (`orderDate.slice(0, 10)`) and do not convert. Day granularity is what a
   * purchase date means anyway, and it is the only reading that agrees across runtimes.
   *
   * The vendor ships out of Buffalo, so US-Eastern is the obvious guess for the wall clock —
   * but it is a guess. Nothing in their docs states it and nothing here has measured it.
   */
  orderDate: string;
  /** Null until shipment. Same missing-timezone caveat as `orderDate`. */
  orderShippedDate?: string | null;
  shippingTotal: string | number;
  total: string | number;
  shipping: Address;
  billing: Address;
  items: OrderItem[];
  /**
   * The reference WE gave 888VoIP when ordering — their "Customer P.O. No." field.
   *
   * ⚠️ Their docs say a single-order response uses `poNumber` and a list uses `poOrderNumber`.
   * Measured against order 829431 on 2026-08-26, the SINGLE-order response also returned
   * `poOrderNumber`. Both are therefore optional and both are read; see `poRefOf` in
   * `normalize.ts`, which is the only thing that should ever look at either directly.
   */
  poNumber?: string;
  poOrderNumber?: string;
  erpOrderNumber?: string;
  /** Undocumented; fulfilling warehouse code, e.g. "BUF". */
  warehouse?: string;
  invoices?: Invoice[];
  tracking?: Tracking[];
  provisioning?: ProvisioningEntry[];
}

export interface PrivateWarehouse {
  warehouse: string;
  description: string;
}

export interface OrdersPage {
  total: number;
  page: number;
  lastPage: number;
  orders: Order[];
}

export interface ProductFilters {
  makes?: string[];
  categories?: string[];
  skus?: string[];
  partNumbers?: string[];
  privateStock?: boolean;
}

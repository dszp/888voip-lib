/**
 * Throwaway probe: does the lifted client actually work against a live 888VoIP account?
 *
 * Run against STAGING. Not part of the test suite, not part of the build — the suite runs on
 * stubbed fetch on purpose, because a test that needs a credential and a network is a test
 * that gets skipped.
 *
 *   VOIP888_BASE=https://stagingapi.888voip.com VOIP888_TOKEN=... npx tsx spikes/live-check.ts
 */
import { VoipClient, memoryCache, poRefOf } from '../src/index';

const baseUrl = process.env.VOIP888_BASE ?? 'https://stagingapi.888voip.com';
const token = process.env.VOIP888_TOKEN;
if (token === undefined || token === '') {
  // Where the staging token actually lives is recorded in the PRIVATE guidance that this repo's
  // gitignored CLAUDE.md imports — not here. A vault reference is an internal identifier, and
  // this repo is written to be published, so the leak guard rejects one on sight.
  console.error('Set VOIP888_TOKEN (staging bearer token — see the local CLAUDE.md for where it lives).');
  process.exit(1);
}

const client = new VoipClient({ baseUrl, token, cache: memoryCache() });

const page = await client.getOrders({ newestFirst: true });
console.log(`orders: total=${page.total} lastPage=${page.lastPage} returned=${page.orders.length}`);
for (const o of page.orders.slice(0, 3)) {
  console.log(`  ${o.orderNumber} ${o.orderDate.slice(0, 10)} ${o.orderStatus} po=${poRefOf(o) ?? '—'} erp=${o.erpOrderNumber ?? '—'}`);
}

const first = page.orders[0];
if (first !== undefined) {
  const single = await client.getOrder(String(first.orderNumber));
  console.log(`single order ${first.orderNumber}: ${single === null ? 'NULL' : 'ok'}`);
  if (single !== null) {
    console.log(`  poNumber=${single.poNumber ?? '—'} poOrderNumber=${single.poOrderNumber ?? '—'}`);
    console.log(`  items=${single.items.length} tracking=${single.tracking?.length ?? 0} invoices=${single.invoices?.length ?? 0}`);
  }
}

console.log(`missing order returns: ${await client.getOrder('99999999') === null ? 'null (correct)' : 'NOT NULL'}`);
console.log(`categories: ${(await client.getCategories()).length}`);

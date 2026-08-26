import type { Order, Product } from './model';

/**
 * Decode HTML entities in 888VoIP's plain-text display strings. The API
 * HTML-encodes product/image/document names even though they aren't markup, so
 * an ampersand arrives as "&amp;" and an en-dash as "&#8211;". Handles the
 * common named entities plus any decimal (&#8211;) or hex (&#x2013;) numeric
 * reference; unknown named entities are left as-is.
 *
 * Display fields ONLY — never category filter keys, which upstream matches
 * against its stored (already-decoded) form, so decoding them is unnecessary
 * and could reintroduce a filter miss if upstream ever regressed.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Convert an inline HTML fragment (the contents of a <p>/<li>/<hN>) to text:
 * bold/italic → markdown emphasis, anchors → [text](url), remaining tags
 * dropped, entities decoded, whitespace collapsed.
 */
function inlineToMarkdown(html: string): string {
  let s = html;
  s = s.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag, inner) => `**${inner.trim()}**`);
  s = s.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag, inner) => `*${inner.trim()}*`);
  s = s.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, inner) => `[${inner.trim()}](${href})`);
  s = s.replace(/<[^>]+>/g, "");
  return decodeHtmlEntities(s).replace(/\s+/g, " ").trim();
}

/**
 * Minimal HTML→Markdown for 888VoIP product descriptions (WordPress/ProseMirror
 * output: paragraphs, headings, single-level bullet/numbered lists, inline
 * emphasis and links). Zero-dependency and deliberately scoped to the markup
 * these descriptions actually contain — unknown/structural tags (div, span) are
 * stripped, text entities decoded. Not a general-purpose HTML converter.
 */
export function htmlToMarkdown(html: string): string {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");

  for (let lvl = 1; lvl <= 6; lvl++) {
    s = s.replace(
      new RegExp(`<h${lvl}[^>]*>([\\s\\S]*?)<\\/h${lvl}>`, "gi"),
      (_m, inner) => `\n\n${"#".repeat(lvl)} ${inlineToMarkdown(inner)}\n\n`,
    );
  }

  s = s.replace(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, tag: string, inner: string) => {
    let n = 0;
    const lines = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((m) => {
        // `?? ""` only to satisfy noUncheckedIndexedAccess, which this repo sets and the
        // MCP server this was lifted from did not: group 1 always participates in a match.
        const text = inlineToMarkdown(m[1] ?? "");
        return tag.toLowerCase() === "ol" ? `${++n}. ${text}` : `- ${text}`;
      })
      .filter((line) => /[^\s\d.\-]/.test(line));
    return `\n\n${lines.join("\n")}\n\n`;
  });

  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m, inner) => `\n\n${inlineToMarkdown(inner)}\n\n`);

  // Strip leftover structural tags, decode entities in bare text, tidy blank lines.
  s = decodeHtmlEntities(s.replace(/<[^>]+>/g, ""));
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Normalize the per-product semicolon-delimited `categories` string: trim each
 * name, drop empties (incl. the trailing-semicolon artifact) and exact
 * duplicates ("Yealink;Yealink"), preserving order. Values are kept verbatim
 * otherwise so they still match the get_products `categories[]` filter.
 */
export function normalizeCategories(raw: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(";")) {
    const name = part.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out.join(";");
}

/**
 * Decode display-field entities and tidy the categories string on a product.
 * When `withMarkdown` is set, also derive `descriptionMarkdown` from the HTML
 * `description` (the HTML is always kept verbatim).
 */
export function normalizeProduct(p: Product, withMarkdown = false): Product {
  const out: Product = { ...p, name: decodeHtmlEntities(p.name) };
  // Assigned conditionally rather than inline: this repo sets exactOptionalPropertyTypes, which
  // forbids writing an explicit `undefined` into an optional field. An absent field stays absent
  // rather than becoming present-and-undefined, which is what the Product type already claims.
  if (p.images !== undefined) {
    out.images = p.images.map((img) => ({ ...img, name: decodeHtmlEntities(img.name) }));
  }
  if (p.documents !== undefined) {
    out.documents = p.documents.map((doc) => ({ ...doc, name: decodeHtmlEntities(doc.name) }));
  }
  if (p.categories !== undefined) out.categories = normalizeCategories(p.categories);
  if (withMarkdown && p.description) {
    out.descriptionMarkdown = htmlToMarkdown(p.description);
  }
  return out;
}

/**
 * The reference WE gave 888VoIP when ordering — their "Customer P.O. No.".
 *
 * ⚠️ ONE function, because there are two field names and no caller should have to know that.
 * Their docs say a single-order response uses `poNumber` and a list uses `poOrderNumber`;
 * measured against order 829431 on 2026-08-26, the single-order response also returned
 * `poOrderNumber`. Rather than trust either statement, both are read.
 *
 * `poNumber` wins when both are present and differ, because it is the documented name for the
 * more specific response — but that case has never been observed and the tie-break exists so
 * the answer is defined rather than incidental.
 *
 * Empty and whitespace collapse to null so a consumer storing this never has to distinguish
 * "no PO" from "a PO that is a space".
 */
export function poRefOf(order: Pick<Order, 'poNumber' | 'poOrderNumber'>): string | null {
  const raw = order.poNumber ?? order.poOrderNumber ?? '';
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

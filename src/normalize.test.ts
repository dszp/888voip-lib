import { describe, it, expect } from 'vitest';
import { decodeHtmlEntities, htmlToMarkdown, normalizeCategories, normalizeProduct, poRefOf } from './normalize';
import type { Product } from './model';

describe('decodeHtmlEntities', () => {
  it('decodes named, decimal and hex references', () => {
    expect(decodeHtmlEntities('Acme &amp; Co &#8211; v2 &#x2013; final')).toBe('Acme & Co – v2 – final');
  });

  it('leaves an unknown named entity alone rather than dropping it', () => {
    expect(decodeHtmlEntities('a &notarealentity; b')).toBe('a &notarealentity; b');
  });
});

describe('normalizeCategories', () => {
  it('drops the trailing-semicolon artifact and exact duplicates, preserving order', () => {
    expect(normalizeCategories('VoIP Phones;Acme;Acme;')).toBe('VoIP Phones;Acme');
  });

  it('does NOT decode entities, because the filter matches upstream stored values', () => {
    expect(normalizeCategories('Adapters &amp')).toBe('Adapters &amp');
  });
});

describe('htmlToMarkdown', () => {
  it('turns headings, bullets, emphasis and links into markdown', () => {
    const html = '<h2>Specs</h2><ul><li><strong>PSU</strong> 5V/2A</li></ul>'
      + '<p>See <a href="https://example.com/d">datasheet</a>.</p>';
    expect(htmlToMarkdown(html)).toBe(
      '## Specs\n\n- **PSU** 5V/2A\n\nSee [datasheet](https://example.com/d).',
    );
  });

  it('strips script and style rather than rendering their contents', () => {
    expect(htmlToMarkdown('<p>a</p><script>alert(1)</script><style>p{}</style>')).toBe('a');
  });
});

describe('normalizeProduct', () => {
  const base: Product = {
    sku: 'ACME-PHONE-1', name: 'Acme Phone &#8211; Grey', price: 50,
    stockByWarehouse: { BUF: 10 }, qty: 10,
    categories: 'VoIP Phones;Acme;Acme;',
    images: [{ name: 'front &amp; back.jpg', url: 'https://example.com/i.jpg' }],
    description: '<p>Ships with a <strong>5V/2A</strong> power supply.</p>',
  };

  it('decodes display names and tidies categories', () => {
    const out = normalizeProduct(base);
    expect(out.name).toBe('Acme Phone – Grey');
    expect(out.images?.[0]?.name).toBe('front & back.jpg');
    expect(out.categories).toBe('VoIP Phones;Acme');
  });

  it('leaves description HTML verbatim and only adds markdown when asked', () => {
    expect(normalizeProduct(base).descriptionMarkdown).toBeUndefined();
    expect(normalizeProduct(base, true).descriptionMarkdown)
      .toBe('Ships with a **5V/2A** power supply.');
    expect(normalizeProduct(base, true).description).toBe(base.description);
  });
});

describe('poRefOf', () => {
  it('reads poOrderNumber, which is what a single order actually returns', () => {
    expect(poRefOf({ poOrderNumber: 'ACME-PO-1' })).toBe('ACME-PO-1');
  });

  it('reads poNumber, which is what the docs say a single order returns', () => {
    expect(poRefOf({ poNumber: 'ACME-PO-1' })).toBe('ACME-PO-1');
  });

  it('prefers poNumber when both are present and differ', () => {
    expect(poRefOf({ poNumber: 'A', poOrderNumber: 'B' })).toBe('A');
  });

  it('returns null for absent or empty, so a caller never stores an empty string', () => {
    expect(poRefOf({})).toBeNull();
    expect(poRefOf({ poOrderNumber: '   ' })).toBeNull();
  });
});

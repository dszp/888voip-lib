// src/index.test.ts
import { describe, it, expect } from 'vitest';
import * as lib from './index';

describe('public surface', () => {
  it('exports exactly what consumers are meant to reach', () => {
    expect(Object.keys(lib).sort()).toEqual([
      'TTL', 'VoipApiError', 'VoipClient', 'VoipShapeError',
      'cacheKey', 'createToken', 'decodeHtmlEntities', 'getOrFetch',
      'htmlToMarkdown', 'memoryCache', 'normalizeCategories', 'normalizeProduct',
      'poRefOf', 'readThrough', 'revokeAllTokens', 'revokeToken',
    ]);
  });

  it('does not export the transport, which is an implementation detail', () => {
    expect(lib).not.toHaveProperty('request');
  });

  it('does not export the testkit, which carries vitest', () => {
    expect(lib).not.toHaveProperty('stubFetch');
    expect(lib).not.toHaveProperty('fakeOrder');
  });
});

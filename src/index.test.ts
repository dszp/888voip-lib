// src/index.test.ts
import { describe, it, expect } from 'vitest';
import * as lib from './index.js';

describe('public surface', () => {
  it('exports exactly what consumers are meant to reach', () => {
    expect(Object.keys(lib).sort()).toEqual([
      'VoipApiError', 'VoipClient', 'VoipShapeError',
      'createToken', 'decodeHtmlEntities',
      'htmlToMarkdown', 'memoryCache', 'normalizeCategories', 'normalizeProduct',
      'poRefOf', 'revokeAllTokens', 'revokeToken',
    ]);
  });

  it('does not export the transport, which is an implementation detail', () => {
    expect(lib).not.toHaveProperty('request');
  });

  it('does not export the caching internals the client owns', () => {
    // A key format and a read-through signature are not API. The client caches; a consumer
    // supplies the store and, if it cares, observes through onCacheRead.
    for (const name of ['cacheKey', 'readThrough', 'getOrFetch', 'TTL']) {
      expect(lib).not.toHaveProperty(name);
    }
  });

  it('does not export the testkit, which carries vitest', () => {
    expect(lib).not.toHaveProperty('stubFetch');
    expect(lib).not.toHaveProperty('fakeOrder');
  });
});

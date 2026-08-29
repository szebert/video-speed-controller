// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  getOriginIdentity,
  getOriginPattern,
  hostPatternsCover,
  isOpaqueOrigin,
  selectHttpHttpsHostPatterns,
} from '../access/site-access';
import { getSiteKey, getSiteStorageKey } from '../storage/site-key';

describe('origin identity and patterns', () => {
  it('normalizes empty https ports to 443 and http to 80', () => {
    expect(getOriginIdentity('https://example.com/watch')).toEqual({
      scheme: 'https',
      hostname: 'example.com',
      effectivePort: 443,
    });
    expect(getOriginIdentity('http://example.com/watch')).toEqual({
      scheme: 'http',
      hostname: 'example.com',
      effectivePort: 80,
    });
    expect(getOriginPattern('https://example.com/watch')).toBe('https://example.com:443/*');
    expect(getOriginPattern('http://example.com/watch')).toBe('http://example.com:80/*');
  });

  it('keeps explicit non-default ports', () => {
    expect(getOriginIdentity('https://example.com:8443/')).toEqual({
      scheme: 'https',
      hostname: 'example.com',
      effectivePort: 8443,
    });
    expect(getOriginPattern('https://example.com:8443/')).toBe('https://example.com:8443/*');
  });

  it('matches default-port patterns against omitted location ports', () => {
    const identity = getOriginIdentity('https://example.com/path')!;
    expect(hostPatternsCover(identity, ['https://example.com:443/*'])).toBe(true);
    expect(hostPatternsCover(identity, ['https://example.com:8443/*'])).toBe(false);
  });

  it('matches subdomain wildcards including the bare domain', () => {
    const identity = getOriginIdentity('https://www.example.com/')!;
    expect(hostPatternsCover(identity, ['https://*.example.com/*'])).toBe(true);
    expect(
      hostPatternsCover(getOriginIdentity('https://example.com/')!, ['https://*.example.com/*']),
    ).toBe(true);
    expect(hostPatternsCover(identity, ['https://*.other.com/*'])).toBe(false);
  });

  it('treats https://*/* as covering ordinary https identities only', () => {
    expect(hostPatternsCover(getOriginIdentity('https://reddit.com/')!, ['https://*/*'])).toBe(
      true,
    );
    expect(hostPatternsCover(getOriginIdentity('http://reddit.com/')!, ['https://*/*'])).toBe(
      false,
    );
    expect(
      hostPatternsCover(getOriginIdentity('https://example.com:8443/')!, ['https://*/*']),
    ).toBe(false);
  });

  it('does not rewrite wildcard grants into concrete origins', () => {
    expect(selectHttpHttpsHostPatterns(['https://*/*', 'chrome://favicon/*'])).toEqual([
      'https://*/*',
    ]);
  });

  it('keeps siteSpeed identity hostname-only', () => {
    const key = getSiteKey('https://www.youtube.com:443/watch?v=1');
    expect(key).toEqual({ supported: true, hostname: 'www.youtube.com' });
    if (key.supported) {
      expect(getSiteStorageKey(key)).toBe('site:www.youtube.com');
    }
  });

  it('marks unsupported schemes', () => {
    expect(getSiteKey('chrome://settings').supported).toBe(false);
    expect(getSiteKey('chrome-extension://abc/popup.html').supported).toBe(false);
    expect(getSiteKey('file:///tmp/video.html').supported).toBe(false);
  });

  it('treats opaque origins conservatively', () => {
    expect(isOpaqueOrigin('null')).toBe(true);
    expect(isOpaqueOrigin('https://example.com')).toBe(false);
  });
});

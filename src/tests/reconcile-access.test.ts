// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { getOriginIdentity, hostPatternsCover, isOpaqueOrigin } from '../access/site-access';

function shouldDestroy(href: string, origin: string, allowed: string[]): boolean {
  if (isOpaqueOrigin(origin)) {
    return true;
  }
  const identity = getOriginIdentity(href);
  if (!identity) {
    return true;
  }
  return !hostPatternsCover(identity, allowed);
}

describe('RECONCILE_ACCESS remaining grants', () => {
  it('destroys ordinary https frames when https grants are gone', () => {
    expect(shouldDestroy('https://reddit.com/', 'https://reddit.com', [])).toBe(true);
    expect(shouldDestroy('http://reddit.com/', 'http://reddit.com', ['http://*/*'])).toBe(false);
    expect(shouldDestroy('https://reddit.com/', 'https://reddit.com', ['http://*/*'])).toBe(true);
  });

  it('keeps a frame alive when remaining wildcards still cover it', () => {
    expect(shouldDestroy('https://reddit.com/', 'https://reddit.com', ['https://*/*'])).toBe(false);
  });

  it('destroys opaque frames conservatively', () => {
    expect(shouldDestroy('about:blank', 'null', ['https://example.com:443/*'])).toBe(true);
  });

  it('leaves an unrelated https frame alive', () => {
    expect(
      shouldDestroy('https://news.com/', 'https://news.com', ['https://example.com:443/*']),
    ).toBe(true);
    expect(
      shouldDestroy('https://example.com/', 'https://example.com', ['https://example.com:443/*']),
    ).toBe(false);
  });
});

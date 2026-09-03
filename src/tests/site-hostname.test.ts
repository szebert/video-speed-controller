// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { normalizeSiteHostname, siteResolutionUrl } from '../settings/site-hostname';
import { hostnameFromSiteStorageKey } from '../storage/site-key';

describe('normalizeSiteHostname', () => {
  it('accepts a bare hostname and synthesizes a resolution URL', () => {
    expect(normalizeSiteHostname('Example.COM')).toBe('example.com');
    expect(normalizeSiteHostname(' 127.0.0.1 ')).toBe('127.0.0.1');
    expect(siteResolutionUrl('example.com')).toBe('https://example.com/');
  });

  it('rejects ports paths queries userinfo and full URLs', () => {
    expect(normalizeSiteHostname('example.com:8080')).toBeNull();
    expect(normalizeSiteHostname('example.com/path')).toBeNull();
    expect(normalizeSiteHostname('example.com?foo=bar')).toBeNull();
    expect(normalizeSiteHostname('user@example.com')).toBeNull();
    expect(normalizeSiteHostname('https://example.com')).toBeNull();
    expect(normalizeSiteHostname('https://example.com/watch')).toBeNull();
    expect(normalizeSiteHostname('')).toBeNull();
    expect(normalizeSiteHostname(null)).toBeNull();
  });
});

describe('hostnameFromSiteStorageKey', () => {
  it('strips the site prefix and rejects empty keys', () => {
    expect(hostnameFromSiteStorageKey('site:www.youtube.com')).toBe('www.youtube.com');
    expect(hostnameFromSiteStorageKey('site:127.0.0.1')).toBe('127.0.0.1');
    expect(hostnameFromSiteStorageKey('site:')).toBeNull();
    expect(hostnameFromSiteStorageKey('defaults:site-behavior')).toBeNull();
  });
});

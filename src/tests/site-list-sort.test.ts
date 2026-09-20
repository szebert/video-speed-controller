// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  applyMembership,
  compareName,
  DEFAULT_SITE_LIST_SORT,
  isCanonicalIpv4Hostname,
  nextSiteListSort,
  parseSiteListSort,
  sortCustomSites,
} from '../entrypoints/options/site-list-sort';
import type { CustomSiteSummary } from '../settings/site-summary';

function site(hostname: string, lastUsedAt = 1): CustomSiteSummary {
  return { hostname, lastUsedAt };
}

function hostnames(sites: readonly CustomSiteSummary[]): string[] {
  return sites.map((entry) => entry.hostname);
}

describe('compareName', () => {
  it('orders subdomains of the same SLD right to left', () => {
    expect(compareName('api.google.com', 'www.google.com')).toBeLessThan(0);
    expect(compareName('a.b.google.com', 'www.google.com')).toBeLessThan(0);
  });

  it('groups by last two labels, not the leftmost label', () => {
    expect(compareName('www.google.com', 'api.youtube.com')).toBeLessThan(0);
  });

  it('places the apex before a subdomain', () => {
    expect(compareName('google.com', 'api.google.com')).toBeLessThan(0);
  });

  it('clumps .co.uk under the last two labels', () => {
    const ordered = ['example.co.uk', 'news.bbc.co.uk', 'bbc.co.uk'].sort(compareName);
    expect(ordered).toEqual(['bbc.co.uk', 'news.bbc.co.uk', 'example.co.uk']);
  });

  it('treats IPv4 as one atomic hostname', () => {
    expect(compareName('1.9.0.1', '2.8.0.1')).toBeLessThan(0);
    expect(compareName('127.0.0.1', '9.0.0.1')).toBeLessThan(0);
  });
});

describe('isCanonicalIpv4Hostname', () => {
  it('accepts dotted-decimal IPv4 and rejects leading zeros', () => {
    expect(isCanonicalIpv4Hostname('127.0.0.1')).toBe(true);
    expect(isCanonicalIpv4Hostname('0.0.0.0')).toBe(true);
    expect(isCanonicalIpv4Hostname('255.255.255.255')).toBe(true);
    expect(isCanonicalIpv4Hostname('09.02.09.01')).toBe(false);
    expect(isCanonicalIpv4Hostname('01.2.3.4')).toBe(false);
    expect(isCanonicalIpv4Hostname('127.0.0.01')).toBe(false);
    expect(isCanonicalIpv4Hostname('256.0.0.1')).toBe(false);
  });
});

describe('sortCustomSites', () => {
  it('sorts Name A to Z and reverses the full Name order', () => {
    const sites = [site('api.youtube.com'), site('www.google.com'), site('api.google.com')];
    expect(hostnames(sortCustomSites(sites, { mode: 'name', direction: 'asc' }))).toEqual([
      'api.google.com',
      'www.google.com',
      'api.youtube.com',
    ]);
    expect(hostnames(sortCustomSites(sites, { mode: 'name', direction: 'desc' }))).toEqual([
      'api.youtube.com',
      'www.google.com',
      'api.google.com',
    ]);
  });

  it('sorts Recent newest first and keeps Name A to Z ties in both directions', () => {
    const sites = [
      site('api.youtube.com', 10),
      site('www.google.com', 20),
      site('api.google.com', 10),
    ];
    expect(hostnames(sortCustomSites(sites, { mode: 'recent', direction: 'newest' }))).toEqual([
      'www.google.com',
      'api.google.com',
      'api.youtube.com',
    ]);
    expect(hostnames(sortCustomSites(sites, { mode: 'recent', direction: 'oldest' }))).toEqual([
      'api.google.com',
      'api.youtube.com',
      'www.google.com',
    ]);
  });
});

describe('nextSiteListSort', () => {
  it('uses each mode default when switching and toggles the active direction', () => {
    expect(nextSiteListSort(DEFAULT_SITE_LIST_SORT, 'name')).toEqual({
      mode: 'name',
      direction: 'asc',
    });
    expect(nextSiteListSort({ mode: 'name', direction: 'asc' }, 'name')).toEqual({
      mode: 'name',
      direction: 'desc',
    });
    expect(nextSiteListSort({ mode: 'name', direction: 'desc' }, 'recent')).toEqual({
      mode: 'recent',
      direction: 'newest',
    });
    expect(nextSiteListSort({ mode: 'recent', direction: 'newest' }, 'recent')).toEqual({
      mode: 'recent',
      direction: 'oldest',
    });
  });
});

describe('parseSiteListSort', () => {
  it('returns Recent newest for missing or corrupt values', () => {
    expect(parseSiteListSort(null)).toEqual(DEFAULT_SITE_LIST_SORT);
    expect(parseSiteListSort({ mode: 'name' })).toEqual(DEFAULT_SITE_LIST_SORT);
    expect(parseSiteListSort({ mode: 'recent', direction: 'asc' })).toEqual(DEFAULT_SITE_LIST_SORT);
  });
});

describe('applyMembership', () => {
  it('inserts a customized site and replaces an existing timestamp', () => {
    const inserted = applyMembership([], {
      customized: true,
      hostname: 'example.com',
      lastUsedAt: 10,
    });
    expect(inserted).toEqual([{ hostname: 'example.com', lastUsedAt: 10 }]);
    expect(
      applyMembership(inserted, { customized: true, hostname: 'example.com', lastUsedAt: 20 }),
    ).toEqual([{ hostname: 'example.com', lastUsedAt: 20 }]);
  });

  it('removes a site that is no longer customized', () => {
    expect(
      applyMembership([site('example.com', 10), site('vimeo.com', 5)], {
        customized: false,
        hostname: 'example.com',
      }),
    ).toEqual([site('vimeo.com', 5)]);
  });
});

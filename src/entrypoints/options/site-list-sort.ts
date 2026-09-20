// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import type { SiteMembershipUpdate } from '../../protocol/schemas/shared';
import type { CustomSiteSummary } from '../../settings/site-summary';

export const SITE_LIST_SORT_STORAGE_KEY = 'osvsc:site-list-sort';

export type SiteListSort =
  { mode: 'name'; direction: 'asc' | 'desc' } | { mode: 'recent'; direction: 'newest' | 'oldest' };

export const DEFAULT_SITE_LIST_SORT: SiteListSort = { mode: 'recent', direction: 'newest' };

const CanonicalIpv4Hostname = z.ipv4();

export function isCanonicalIpv4Hostname(hostname: string): boolean {
  return CanonicalIpv4Hostname.safeParse(hostname).success;
}

export function compareLexical(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function nameParts(hostname: string): { key: string; leftovers: string[] } {
  if (isCanonicalIpv4Hostname(hostname)) {
    return { key: hostname, leftovers: [] };
  }
  const labels = hostname.split('.');
  if (labels.length <= 2) {
    return { key: hostname, leftovers: [] };
  }
  return {
    key: labels.slice(-2).join('.'),
    leftovers: labels.slice(0, -2).reverse(),
  };
}

export function compareName(left: string, right: string): number {
  const first = nameParts(left);
  const second = nameParts(right);
  const key = compareLexical(first.key, second.key);
  if (key !== 0) {
    return key;
  }
  const limit = Math.max(first.leftovers.length, second.leftovers.length);
  for (let index = 0; index < limit; index += 1) {
    const leftLabel = first.leftovers[index];
    const rightLabel = second.leftovers[index];
    if (leftLabel == null) {
      return -1;
    }
    if (rightLabel == null) {
      return 1;
    }
    const compared = compareLexical(leftLabel, rightLabel);
    if (compared !== 0) {
      return compared;
    }
  }
  return 0;
}

export function sortCustomSites(
  sites: readonly CustomSiteSummary[],
  sort: SiteListSort,
): CustomSiteSummary[] {
  return [...sites].sort((left, right) => {
    if (sort.mode === 'name') {
      const compared = compareName(left.hostname, right.hostname);
      return sort.direction === 'asc' ? compared : -compared;
    }
    const delta = left.lastUsedAt - right.lastUsedAt;
    const timestamp = sort.direction === 'newest' ? -delta : delta;
    if (timestamp !== 0) {
      return timestamp;
    }
    return compareName(left.hostname, right.hostname);
  });
}

export function nextSiteListSort(current: SiteListSort, mode: SiteListSort['mode']): SiteListSort {
  if (mode === 'name') {
    if (current.mode !== 'name') {
      return { mode: 'name', direction: 'asc' };
    }
    return { mode: 'name', direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  if (current.mode !== 'recent') {
    return { mode: 'recent', direction: 'newest' };
  }
  return { mode: 'recent', direction: current.direction === 'newest' ? 'oldest' : 'newest' };
}

export function parseSiteListSort(value: unknown): SiteListSort {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_SITE_LIST_SORT;
  }
  const record = value as { mode?: unknown; direction?: unknown };
  if (record.mode === 'name' && (record.direction === 'asc' || record.direction === 'desc')) {
    return { mode: 'name', direction: record.direction };
  }
  if (
    record.mode === 'recent' &&
    (record.direction === 'newest' || record.direction === 'oldest')
  ) {
    return { mode: 'recent', direction: record.direction };
  }
  return DEFAULT_SITE_LIST_SORT;
}

export function readStoredSiteListSort(
  storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage,
): SiteListSort {
  if (!storage) {
    return DEFAULT_SITE_LIST_SORT;
  }
  try {
    const raw = storage.getItem(SITE_LIST_SORT_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SITE_LIST_SORT;
    }
    return parseSiteListSort(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_SITE_LIST_SORT;
  }
}

export function writeStoredSiteListSort(
  sort: SiteListSort,
  storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage,
): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(SITE_LIST_SORT_STORAGE_KEY, JSON.stringify(sort));
  } catch {
    // Private mode or quota must not block the options page.
  }
}

export function applyMembership(
  current: readonly CustomSiteSummary[],
  update: SiteMembershipUpdate,
): CustomSiteSummary[] {
  if (update.customized) {
    const next = { hostname: update.hostname, lastUsedAt: update.lastUsedAt };
    const index = current.findIndex((site) => site.hostname === update.hostname);
    if (index < 0) {
      return [...current, next];
    }
    return current.map((site, siteIndex) => (siteIndex === index ? next : site));
  }
  return current.filter((site) => site.hostname !== update.hostname);
}

// SPDX-License-Identifier: GPL-3.0-only

import { getSiteKey, getSiteStorageKey, type SiteKey } from './site-key';

export interface SiteSettingsV1 {
  schemaVersion: 1;
  speed: number;
}

export type SiteSettingsStore = {
  get: (
    keys?: string | string[] | Record<string, unknown> | null,
  ) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

function isSiteSettingsV1(value: unknown): value is SiteSettingsV1 {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as { schemaVersion?: unknown; speed?: unknown };
  return (
    record.schemaVersion === 1 && typeof record.speed === 'number' && Number.isFinite(record.speed)
  );
}

export function normalizeSiteSettings(value: unknown): SiteSettingsV1 | null {
  if (isSiteSettingsV1(value)) {
    return { schemaVersion: 1, speed: value.speed };
  }
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { speed?: unknown }).speed === 'number'
  ) {
    const speed = (value as { speed: number }).speed;
    if (Number.isFinite(speed)) {
      return { schemaVersion: 1, speed };
    }
  }
  return null;
}

export async function readSiteSpeed(
  url: string,
  store: SiteSettingsStore = chrome.storage.sync,
): Promise<number | null> {
  const siteKey = getSiteKey(url);
  if (!siteKey.supported) {
    return null;
  }
  return readSiteSpeedForKey(siteKey, store);
}

export async function readSiteSpeedForKey(
  siteKey: SiteKey,
  store: SiteSettingsStore = chrome.storage.sync,
): Promise<number | null> {
  const storageKey = getSiteStorageKey(siteKey);
  const result = await store.get(storageKey);
  const normalized = normalizeSiteSettings(result[storageKey]);
  return normalized?.speed ?? null;
}

export async function persistSiteSpeed(
  url: string,
  speed: number,
  store: SiteSettingsStore = chrome.storage.sync,
): Promise<void> {
  const siteKey = getSiteKey(url);
  if (!siteKey.supported) {
    throw new Error('Cannot persist siteSpeed for an unsupported page');
  }
  const storageKey = getSiteStorageKey(siteKey);
  const record: SiteSettingsV1 = { schemaVersion: 1, speed };
  await store.set({ [storageKey]: record });
}

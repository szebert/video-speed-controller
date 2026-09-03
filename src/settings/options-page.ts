// SPDX-License-Identifier: GPL-3.0-only

import { normalizeSiteHostname } from './site-hostname';

export const OPTIONS_PAGE_PATH = 'options.html';

export function optionsPagePath(hostname?: string | null): string {
  const normalized = hostname ? normalizeSiteHostname(hostname) : null;
  return normalized
    ? `${OPTIONS_PAGE_PATH}?site=${encodeURIComponent(normalized)}`
    : OPTIONS_PAGE_PATH;
}

export function optionsPageUrl(hostname?: string | null): string {
  const normalized = hostname ? normalizeSiteHostname(hostname) : null;
  const base = chrome.runtime.getURL(OPTIONS_PAGE_PATH);
  return normalized ? `${base}?site=${encodeURIComponent(normalized)}` : base;
}

export function openExtensionOptionsPage(hostname?: string | null): void {
  void chrome.tabs.create({ url: optionsPageUrl(hostname) });
}

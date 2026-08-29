// SPDX-License-Identifier: GPL-3.0-only

export type SiteKey = {
  supported: true;
  hostname: string;
};

export type UnsupportedSite = {
  supported: false;
};

export type SiteKeyResult = SiteKey | UnsupportedSite;

export function getSiteKey(url: string | undefined | null): SiteKeyResult {
  if (!url) {
    return { supported: false };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { supported: false };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { supported: false };
  }
  if (!parsed.hostname) {
    return { supported: false };
  }
  return { supported: true, hostname: parsed.hostname.toLowerCase() };
}

export function getSiteStorageKey(siteKey: SiteKey): `site:${string}` {
  return `site:${siteKey.hostname}`;
}

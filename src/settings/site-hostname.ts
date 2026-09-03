// SPDX-License-Identifier: GPL-3.0-only

import { getSiteKey } from '../storage/site-key';

export function siteResolutionUrl(hostname: string): string {
  return `https://${hostname}/`;
}

export function normalizeSiteHostname(input: string | null | undefined): string | null {
  if (input == null) {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(`https://${trimmed}`);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password || parsed.port) {
    return null;
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    return null;
  }
  if (parsed.search || parsed.hash) {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || hostname !== trimmed.toLowerCase()) {
    return null;
  }
  const key = getSiteKey(siteResolutionUrl(hostname));
  return key.supported ? key.hostname : null;
}

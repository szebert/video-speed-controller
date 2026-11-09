// SPDX-License-Identifier: GPL-3.0-only

import { overlayPoliciesForHostname } from '../compatibility/overlay/registry';
import type { SiteOverlayPolicy } from '../compatibility/overlay/types';
import type { PlayerStackingMount } from './player-mount';

function pagePolicies(
  pageUrl: string,
): { url: URL; policies: readonly SiteOverlayPolicy[] } | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  return { url, policies: overlayPoliciesForHostname(url.hostname) };
}

/** The first applicable candidate wins. The shared runtime validates placement. */
export function resolveStackingMount(
  video: HTMLVideoElement,
  pageUrl: string,
): PlayerStackingMount | null {
  const page = pagePolicies(pageUrl);
  if (!page) {
    return null;
  }
  for (const policy of page.policies) {
    const mount = policy.resolveMount(video, page.url);
    if (mount) {
      return mount;
    }
  }
  return null;
}

/** Subscribe for the whole host so a supported player can appear after navigation. */
export function stackingInvalidationEvents(pageUrl: string): readonly string[] {
  const page = pagePolicies(pageUrl);
  return page ? [...new Set(page.policies.flatMap((policy) => policy.navigationEvents))] : [];
}

// SPDX-License-Identifier: GPL-3.0-only

import { redditOverlayPolicy } from './reddit';
import type { SiteOverlayPolicy } from './types';
import { youtubeOverlayPolicy } from './youtube';

/** Registration order decides precedence when policies share a hostname. */
const policies: readonly SiteOverlayPolicy[] = [youtubeOverlayPolicy, redditOverlayPolicy];
const policiesByHostname = new Map<string, SiteOverlayPolicy[]>();
const NO_POLICIES: readonly SiteOverlayPolicy[] = [];

// Index once, rather than visiting every site's resolver for each video.
for (const policy of policies) {
  for (const hostname of policy.hosts) {
    const registered = policiesByHostname.get(hostname);
    if (registered) {
      registered.push(policy);
    } else {
      policiesByHostname.set(hostname, [policy]);
    }
  }
}

export function overlayPoliciesForHostname(hostname: string): readonly SiteOverlayPolicy[] {
  return policiesByHostname.get(hostname) ?? NO_POLICIES;
}

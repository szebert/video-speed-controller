// SPDX-License-Identifier: GPL-3.0-only

import { isShadowRoot } from '../../dom/guards';
import type { SiteOverlayPolicy } from './types';

/** Above Reddit's video, below its native media UI (z-index 2). */
export const REDDIT_PLAYER_Z_INDEX = '1';

export const redditOverlayPolicy: SiteOverlayPolicy = {
  hosts: ['www.reddit.com'],
  navigationEvents: [],
  resolveMount(video) {
    const root = video.getRootNode();
    // Verified Shreddit structure only. Appending to the host's light DOM
    // would not render; the video and overlay must share the shadow root.
    if (
      isShadowRoot(root) &&
      root.host.localName === 'shreddit-player' &&
      video.parentNode === root
    ) {
      return { element: root, zIndex: REDDIT_PLAYER_Z_INDEX };
    }
    return null;
  },
};

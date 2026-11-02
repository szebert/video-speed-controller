// SPDX-License-Identifier: GPL-3.0-only

import type { PlayerStackingMount } from './player-mount';

/**
 * Above YouTube's video container (z-index 10) and control bar (59), below the
 * settings menu (2300). The player stacking context keeps this under the page
 * header. Another site supplies its own level with its own mount.
 */
export const YOUTUBE_PLAYER_Z_INDEX = '60';

const YOUTUBE_WATCH_HOST = 'www.youtube.com';
const YOUTUBE_NAVIGATION_EVENT = 'yt-navigate-finish';

/**
 * A built-in mounting candidate. The element is an internal resolution, not a
 * stored user override. The shared runtime decides whether it can use it.
 */
export function resolveStackingMount(
  video: HTMLVideoElement,
  pageUrl: string,
): PlayerStackingMount | null {
  if (!isStandardYouTubeWatch(pageUrl)) {
    return null;
  }
  const player = video.closest('#movie_player');
  if (!player || !player.contains(video)) {
    return null;
  }
  if (player.querySelector('#masthead-container, ytd-masthead')) {
    return null;
  }
  return { element: player, zIndex: YOUTUBE_PLAYER_Z_INDEX };
}

/**
 * Extra invalidation signals for this page. `popstate` stays on the registry.
 * Subscribing for the whole verified host lets a watch page appear after an
 * in-site navigation, without naming the event in the shared registry.
 */
export function stackingInvalidationEvents(pageUrl: string): readonly string[] {
  return isVerifiedYouTubeHost(pageUrl) ? [YOUTUBE_NAVIGATION_EVENT] : [];
}

/** Standard www.youtube.com watch pages only. Shorts, embeds, and mobile stay generic. */
export function isStandardYouTubeWatch(pageUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return false;
  }
  return isVerifiedYouTubeUrl(url) && url.pathname === '/watch';
}

function isVerifiedYouTubeHost(pageUrl: string): boolean {
  try {
    return isVerifiedYouTubeUrl(new URL(pageUrl));
  } catch {
    return false;
  }
}

function isVerifiedYouTubeUrl(url: URL): boolean {
  return (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.hostname.toLowerCase() === YOUTUBE_WATCH_HOST
  );
}

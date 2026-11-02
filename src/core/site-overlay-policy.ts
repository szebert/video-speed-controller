// SPDX-License-Identifier: GPL-3.0-only

/**
 * A built-in mounting candidate. The element is an internal resolution, not a
 * stored user override. The shared runtime decides whether it can use it.
 */
export function resolveStackingMount(video: HTMLVideoElement, pageUrl: string): Element | null {
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
  return player;
}

/** Standard youtube.com watch pages only. Shorts and embeds stay generic. */
export function isStandardYouTubeWatch(pageUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const youtubeHost = host === 'youtube.com' || host.endsWith('.youtube.com');
  return youtubeHost && url.pathname === '/watch';
}

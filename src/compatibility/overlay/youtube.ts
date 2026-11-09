// SPDX-License-Identifier: GPL-3.0-only

import type { SiteOverlayPolicy } from './types';

/** Above the video (10) and control bar (59), below the settings menu (2300). */
export const YOUTUBE_PLAYER_Z_INDEX = '60';

export const youtubeOverlayPolicy: SiteOverlayPolicy = {
  hosts: ['www.youtube.com'],
  navigationEvents: ['yt-navigate-finish'],
  resolveMount(video, pageUrl) {
    // Shorts, embeds, and other routes retain the generic portal.
    if (pageUrl.pathname !== '/watch') {
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
  },
};

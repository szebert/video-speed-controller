// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { isStandardYouTubeWatch, resolveStackingMount } from '../core/site-overlay-policy';

function watchPage(): { video: HTMLVideoElement; player: HTMLElement } {
  const player = document.createElement('div');
  player.id = 'movie_player';
  const video = document.createElement('video');
  player.append(video);
  document.body.append(player);
  return { video, player };
}

describe('resolveStackingMount', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('returns #movie_player only for a standard YouTube watch URL', () => {
    const { video, player } = watchPage();
    expect(resolveStackingMount(video, 'https://www.youtube.com/watch?v=mKIH0cvMcIM')).toBe(player);
    expect(resolveStackingMount(video, 'https://m.youtube.com/watch?v=1')).toBe(player);
    expect(resolveStackingMount(video, 'https://www.youtube.com/shorts/abc')).toBeNull();
    expect(resolveStackingMount(video, 'https://www.youtube.com/embed/abc')).toBeNull();
    expect(resolveStackingMount(video, 'https://www.youtube-nocookie.com/watch?v=1')).toBeNull();
    expect(resolveStackingMount(video, 'https://youtube.com.evil.test/watch?v=1')).toBeNull();
    expect(resolveStackingMount(video, 'https://notyoutube.com/watch?v=1')).toBeNull();
    expect(resolveStackingMount(video, 'http://127.0.0.1:4173/watch')).toBeNull();
  });

  it('does not use ytd-player and rejects a player that contains the header', () => {
    const outer = document.createElement('ytd-player');
    const { video, player } = watchPage();
    outer.append(player);
    expect(resolveStackingMount(video, 'https://www.youtube.com/watch?v=1')).toBe(player);
    player.append(document.createElement('ytd-masthead'));
    expect(resolveStackingMount(video, 'https://www.youtube.com/watch?v=1')).toBeNull();
    document.body.append(video);
    expect(resolveStackingMount(video, 'https://www.youtube.com/watch?v=1')).toBeNull();
  });

  it('recognizes only http(s) youtube.com watch pages', () => {
    expect(isStandardYouTubeWatch('https://www.youtube.com/watch?v=1')).toBe(true);
    expect(isStandardYouTubeWatch('not a url')).toBe(false);
    expect(isStandardYouTubeWatch('file:///watch')).toBe(false);
  });
});

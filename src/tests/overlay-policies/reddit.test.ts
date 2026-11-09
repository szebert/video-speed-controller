// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { REDDIT_PLAYER_Z_INDEX } from '../../compatibility/overlay/reddit';
import { resolveStackingMount } from '../../core/site-overlay-policy';

describe('Reddit overlay policy', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('mounts a direct Shreddit video in its shadow root only on www.reddit.com', () => {
    const player = document.createElement('shreddit-player');
    const root = player.attachShadow({ mode: 'open' });
    const video = document.createElement('video');
    root.append(video);
    document.body.append(player);
    expect(resolveStackingMount(video, 'https://www.reddit.com/r/videos/')).toEqual({
      element: root,
      zIndex: REDDIT_PLAYER_Z_INDEX,
    });
    for (const pageUrl of [
      'https://old.reddit.com/r/videos/',
      'https://reddit.com/r/videos/',
      'https://www.reddit.com.evil.test/',
      'https://www.youtube.com/watch?v=1',
      'file://www.reddit.com/',
      'not a url',
    ]) {
      expect(resolveStackingMount(video, pageUrl)).toBeNull();
    }
    const wrapper = document.createElement('div');
    root.append(wrapper);
    wrapper.append(video);
    expect(resolveStackingMount(video, 'https://www.reddit.com/')).toBeNull();
    player.append(video);
    expect(resolveStackingMount(video, 'https://www.reddit.com/')).toBeNull();
  });

  it('leaves other Reddit shadow players on the generic mount', () => {
    const player = document.createElement('other-player');
    const root = player.attachShadow({ mode: 'open' });
    const video = document.createElement('video');
    root.append(video);
    document.body.append(player);
    expect(resolveStackingMount(video, 'https://www.reddit.com/')).toBeNull();
  });
});

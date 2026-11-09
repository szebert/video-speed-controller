// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { redditOverlayPolicy } from '../compatibility/overlay/reddit';
import * as registry from '../compatibility/overlay/registry';
import { youtubeOverlayPolicy } from '../compatibility/overlay/youtube';
import { resolveStackingMount, stackingInvalidationEvents } from '../core/site-overlay-policy';

describe('overlay policy dispatch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    'not a url',
    '/watch',
    'file://www.youtube.com/watch',
    'ftp://www.reddit.com/',
    'blob:https://www.youtube.com/id',
    'https://www.youtube.com.evil.test/watch',
    'https://www.reddit.com.evil.test/',
    'https://example.com/',
  ])('keeps %s generic without invoking a site resolver', (pageUrl) => {
    const youtube = vi.spyOn(youtubeOverlayPolicy, 'resolveMount');
    const reddit = vi.spyOn(redditOverlayPolicy, 'resolveMount');
    expect(resolveStackingMount(document.createElement('video'), pageUrl)).toBeNull();
    expect(stackingInvalidationEvents(pageUrl)).toEqual([]);
    expect(youtube).not.toHaveBeenCalled();
    expect(reddit).not.toHaveBeenCalled();
  });

  it('dispatches only to the matching host and passes a parsed, normalized URL', () => {
    const youtube = vi.spyOn(youtubeOverlayPolicy, 'resolveMount').mockReturnValue(null);
    const reddit = vi.spyOn(redditOverlayPolicy, 'resolveMount').mockReturnValue(null);
    const video = document.createElement('video');
    resolveStackingMount(video, 'HTTPS://WWW.YOUTUBE.COM:443/watch?v=1');
    expect(youtube).toHaveBeenCalledExactlyOnceWith(
      video,
      new URL('https://www.youtube.com/watch?v=1'),
    );
    expect(reddit).not.toHaveBeenCalled();
    youtube.mockClear();
    resolveStackingMount(video, 'http://www.reddit.com:80/r/videos/');
    expect(reddit).toHaveBeenCalledExactlyOnceWith(
      video,
      new URL('http://www.reddit.com/r/videos/'),
    );
    expect(youtube).not.toHaveBeenCalled();
  });

  it('keeps YouTube navigation signals active even on routes without a mount', () => {
    for (const path of ['/watch?v=1', '/', '/shorts/abc']) {
      expect(stackingInvalidationEvents(`https://www.youtube.com${path}`)).toEqual([
        'yt-navigate-finish',
      ]);
    }
    expect(stackingInvalidationEvents('https://m.youtube.com/watch?v=1')).toEqual([]);
    expect(stackingInvalidationEvents('https://www.reddit.com/')).toEqual([]);
  });

  it('uses the first applicable mount and merges host signals without duplicates', () => {
    const mount = { element: document.createElement('div'), zIndex: '1' };
    const first = vi.fn(() => null);
    const second = vi.fn(() => mount);
    const third = vi.fn(() => mount);
    vi.spyOn(registry, 'overlayPoliciesForHostname').mockReturnValue([
      { hosts: ['example.com'], navigationEvents: ['navigation'], resolveMount: first },
      {
        hosts: ['example.com'],
        navigationEvents: ['navigation', 'player-ready'],
        resolveMount: second,
      },
      { hosts: ['example.com'], navigationEvents: [], resolveMount: third },
    ]);
    expect(resolveStackingMount(document.createElement('video'), 'https://example.com/')).toBe(
      mount,
    );
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(third).not.toHaveBeenCalled();
    expect(stackingInvalidationEvents('https://example.com/')).toEqual([
      'navigation',
      'player-ready',
    ]);
  });
});

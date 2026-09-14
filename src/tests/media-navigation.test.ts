// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import {
  effectiveSkipSeconds,
  formatSkipSeconds,
  jumpToEnd,
  jumpToStart,
  seekableRange,
  seekBy,
  togglePlayback,
} from '../core/media-navigation';

type Range = { start: number; end: number };

function stubVideo(options: {
  currentTime?: number;
  duration?: number;
  seekable?: Range[];
  playbackRate?: number;
  paused?: boolean;
  seekThrows?: boolean;
}): HTMLVideoElement {
  const video = document.createElement('video');
  const ranges = options.seekable;
  let currentTime = options.currentTime ?? 0;
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => currentTime,
    set: (value: number) => {
      if (options.seekThrows) {
        throw new DOMException('not seekable', 'InvalidStateError');
      }
      currentTime = value;
    },
  });
  Object.defineProperty(video, 'duration', {
    configurable: true,
    get: () => options.duration ?? Number.NaN,
  });
  Object.defineProperty(video, 'playbackRate', {
    configurable: true,
    get: () => options.playbackRate ?? 1,
    set: () => undefined,
  });
  Object.defineProperty(video, 'paused', {
    configurable: true,
    get: () => options.paused ?? true,
  });
  if (ranges) {
    Object.defineProperty(video, 'seekable', {
      configurable: true,
      get: () => ({
        length: ranges.length,
        start: (index: number) => ranges[index]?.start ?? 0,
        end: (index: number) => ranges[index]?.end ?? 0,
      }),
    });
  }
  return video;
}

describe('media navigation', () => {
  it('uses the configured skip distance unless scaling is enabled', () => {
    expect(effectiveSkipSeconds(5, 1, false)).toBe(5);
    expect(effectiveSkipSeconds(5, 2, false)).toBe(5);
    expect(effectiveSkipSeconds(5, 2, true)).toBe(10);
    expect(effectiveSkipSeconds(5, 0.5, true)).toBe(2.5);
    expect(effectiveSkipSeconds(10, 2, true)).toBe(20);
  });

  it('treats an unusable configured distance or rate as a safe fallback', () => {
    expect(effectiveSkipSeconds(Number.NaN, 1, false)).toBe(0.1);
    expect(effectiveSkipSeconds(0, 1, false)).toBe(0.1);
    expect(effectiveSkipSeconds(5, Number.NaN, true)).toBe(5);
    expect(effectiveSkipSeconds(5, 0, true)).toBe(5);
    expect(effectiveSkipSeconds(99_999, 1, false)).toBe(3600);
  });

  it('skips backward and forward independently, clamped to the range', () => {
    const video = stubVideo({ currentTime: 30, duration: 60 });
    expect(seekBy(video, -5)?.appliedSeconds).toBe(-5);
    expect(video.currentTime).toBe(25);
    expect(seekBy(video, 10)?.appliedSeconds).toBe(10);
    expect(video.currentTime).toBe(35);

    expect(seekBy(video, 999)).toEqual({ requestedSeconds: 999, appliedSeconds: 25 });
    expect(video.currentTime).toBe(60);
    expect(seekBy(video, -999)?.appliedSeconds).toBe(-60);
    expect(video.currentTime).toBe(0);
  });

  it('prefers the seekable window, including a non-zero start', () => {
    const video = stubVideo({ currentTime: 40, duration: 120, seekable: [{ start: 30, end: 90 }] });
    expect(seekableRange(video)).toEqual({ start: 30, end: 90 });
    expect(seekBy(video, -60)?.appliedSeconds).toBe(-10);
    expect(video.currentTime).toBe(30);

    expect(jumpToStart(video)).toBe(true);
    expect(video.currentTime).toBe(30);
  });

  it('does not jump to the live edge of an endless timeline', () => {
    for (const duration of [Number.POSITIVE_INFINITY, Number.NaN]) {
      const live = stubVideo({
        currentTime: 500,
        duration,
        seekable: [{ start: 400, end: 900 }],
      });
      expect(jumpToEnd(live)).toBe(false);
      expect(live.currentTime).toBe(500);
      // A DVR window is still a valid target for skips and jump-to-start.
      expect(jumpToStart(live)).toBe(true);
      expect(live.currentTime).toBe(400);
    }
  });

  it('clamps a finite jump-to-end into the last seekable end', () => {
    const trimmed = stubVideo({ currentTime: 5, duration: 120, seekable: [{ start: 0, end: 90 }] });
    expect(jumpToEnd(trimmed)).toBe(true);
    expect(trimmed.currentTime).toBe(90);

    const plain = stubVideo({ currentTime: 5, duration: 60 });
    expect(jumpToEnd(plain)).toBe(true);
    expect(plain.currentTime).toBe(60);
  });

  it('no-ops without usable bounds or when the seek setter throws', () => {
    const unknown = stubVideo({ currentTime: 0 });
    expect(seekableRange(unknown)).toBeNull();
    expect(seekBy(unknown, 5)).toBeNull();
    expect(jumpToStart(unknown)).toBe(false);
    expect(jumpToEnd(unknown)).toBe(false);

    const detached = stubVideo({ currentTime: 10, duration: 60, seekThrows: true });
    expect(seekBy(detached, 5)).toBeNull();
    expect(jumpToStart(detached)).toBe(false);
    expect(jumpToEnd(detached)).toBe(false);
  });

  it('toggles playback and swallows a rejected play()', async () => {
    const paused = stubVideo({ paused: true, duration: 60 });
    const rejection = Promise.reject(new DOMException('blocked', 'NotAllowedError'));
    const play = vi.spyOn(paused, 'play').mockReturnValue(rejection);
    expect(togglePlayback(paused)).toBe('play');
    expect(play).toHaveBeenCalledTimes(1);
    await expect(rejection.catch(() => 'handled')).resolves.toBe('handled');

    const playing = stubVideo({ paused: false, duration: 60 });
    const pause = vi.spyOn(playing, 'pause').mockImplementation(() => undefined);
    expect(togglePlayback(playing)).toBe('pause');
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('formats a skip distance from its magnitude', () => {
    expect(formatSkipSeconds(5)).toBe('5s');
    expect(formatSkipSeconds(-10)).toBe('10s');
    expect(formatSkipSeconds(2.5)).toBe('2.5s');
  });
});

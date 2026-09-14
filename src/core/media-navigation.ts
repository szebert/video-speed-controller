// SPDX-License-Identifier: GPL-3.0-only

import { canonicalizeSkipSeconds } from '../settings/site-behavior';

// Media-local navigation. Pure calculations plus the narrow seek/play writes
// they need. Overlay views call these through controller actions so playback
// math stays out of the view layer.

const SECONDS_SCALE = 1000;

export type SeekRange = { start: number; end: number };

export type SkipResult = {
  /** Distance asked for, after playback-rate scaling. */
  requestedSeconds: number;
  /** Distance the media actually moved, after clamping to the seek range. */
  appliedSeconds: number;
};

export type PlaybackToggle = 'play' | 'pause';

function roundSeconds(value: number): number {
  return Math.round(value * SECONDS_SCALE) / SECONDS_SCALE;
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Usable seek window. Prefers `seekable` so DVR windows that do not start at 0
 * work; falls back to a finite duration. Returns null for media with no
 * determinable bounds.
 */
export function seekableRange(video: HTMLVideoElement): SeekRange | null {
  try {
    const seekable = video.seekable;
    const length = seekable?.length ?? 0;
    if (length > 0) {
      const start = seekable.start(0);
      const end = seekable.end(length - 1);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        return { start, end };
      }
    }
  } catch {
    // Some players throw on seekable before metadata. Fall back to duration.
  }
  const duration = video.duration;
  if (Number.isFinite(duration) && duration > 0) {
    return { start: 0, end: duration };
  }
  return null;
}

/** Configured distance, optionally multiplied by the video's current rate. */
export function effectiveSkipSeconds(
  configuredSeconds: number,
  playbackRate: number,
  scaleWithRate: boolean,
): number {
  const configured = canonicalizeSkipSeconds(
    isFinitePositive(configuredSeconds) ? configuredSeconds : 0,
  );
  if (!scaleWithRate) {
    return configured;
  }
  const rate = isFinitePositive(playbackRate) ? playbackRate : 1;
  return roundSeconds(configured * rate);
}

function writeCurrentTime(video: HTMLVideoElement, seconds: number): boolean {
  try {
    video.currentTime = seconds;
    return true;
  } catch {
    return false;
  }
}

/** Seeks by a signed delta, clamped to the usable range. */
export function seekBy(video: HTMLVideoElement, deltaSeconds: number): SkipResult | null {
  if (!Number.isFinite(deltaSeconds)) {
    return null;
  }
  const range = seekableRange(video);
  if (!range) {
    return null;
  }
  const current = video.currentTime;
  if (!Number.isFinite(current)) {
    return null;
  }
  const target = Math.min(range.end, Math.max(range.start, current + deltaSeconds));
  if (!writeCurrentTime(video, target)) {
    return null;
  }
  return {
    requestedSeconds: roundSeconds(deltaSeconds),
    appliedSeconds: roundSeconds(target - current),
  };
}

/** Seeks to the start of the usable range, which may not be 0 on DVR streams. */
export function jumpToStart(video: HTMLVideoElement): boolean {
  const range = seekableRange(video);
  if (!range) {
    return false;
  }
  return writeCurrentTime(video, range.start);
}

/**
 * Seeks to the end. Requires a finite duration: an endless or unknown timeline
 * has no end to jump to, even when a DVR window is seekable.
 */
export function jumpToEnd(video: HTMLVideoElement): boolean {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    return false;
  }
  const range = seekableRange(video);
  const end = range ? Math.max(range.start, Math.min(duration, range.end)) : duration;
  return writeCurrentTime(video, end);
}

/** Starts playback, swallowing the autoplay rejection browsers may produce. */
export function safePlay(video: HTMLVideoElement): Promise<void> {
  try {
    const result = video.play();
    if (result && typeof result.then === 'function') {
      return result.catch(() => undefined);
    }
  } catch {
    // Detached or sourceless media. Treat as a no-op.
  }
  return Promise.resolve();
}

export function safePause(video: HTMLVideoElement): void {
  try {
    video.pause();
  } catch {
    // Detached or sourceless media. Treat as a no-op.
  }
}

/** Toggles playback and reports which way it went, for action feedback. */
export function togglePlayback(video: HTMLVideoElement): PlaybackToggle | null {
  try {
    if (video.paused) {
      void safePlay(video);
      return 'play';
    }
  } catch {
    return null;
  }
  safePause(video);
  return 'pause';
}

/** Single place English-free callers format a skip distance. */
export function formatSkipSeconds(seconds: number): string {
  const value = roundSeconds(Math.abs(seconds));
  return `${value}s`;
}

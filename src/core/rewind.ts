// SPDX-License-Identifier: GPL-3.0-only

import { seekableRange, writeCurrentTime } from './media-navigation';

/** Seeks per wall-clock second. More is not automatically smoother. */
export const REWIND_SEEKS_PER_SECOND = 30;

export type RewindScheduler = {
  now(): number;
  requestFrame(callback: (time: number) => void): number;
  cancelFrame(id: number): void;
};

export type RewindSession = {
  stop(): void;
};

export type StartRewindOptions = {
  scheduler?: RewindScheduler;
  maxSeeksPerSecond?: number;
};

const defaultScheduler: RewindScheduler = {
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => {
    cancelAnimationFrame(id);
  },
};

/**
 * Starts a paused reverse-seek loop. Play/pause and rate ownership stay with
 * MediaController. Returns null when the video or speed cannot be used.
 */
export function startRewind(
  video: HTMLVideoElement,
  speedMagnitude: number,
  options: StartRewindOptions = {},
): RewindSession | null {
  if (!video.isConnected || !Number.isFinite(video.currentTime)) {
    return null;
  }
  if (!Number.isFinite(speedMagnitude) || speedMagnitude <= 0) {
    return null;
  }
  const scheduler = options.scheduler ?? defaultScheduler;
  const maxSeeks = options.maxSeeksPerSecond ?? REWIND_SEEKS_PER_SECOND;
  const minIntervalMs = maxSeeks > 0 ? 1000 / maxSeeks : 0;
  const startPosition = video.currentTime;
  const startClock = scheduler.now();
  let frameId: number | null = null;
  let lastSeekAt: number | null = null;
  let stopped = false;

  const stop = (): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    if (frameId != null) {
      scheduler.cancelFrame(frameId);
      frameId = null;
    }
  };

  const schedule = (): void => {
    if (stopped || frameId != null) {
      return;
    }
    frameId = scheduler.requestFrame(onFrame);
  };

  const onFrame = (): void => {
    frameId = null;
    if (stopped) {
      return;
    }
    if (!video.isConnected || !Number.isFinite(video.currentTime)) {
      stop();
      return;
    }
    if (video.seeking) {
      schedule();
      return;
    }
    const now = scheduler.now();
    if (lastSeekAt != null && now - lastSeekAt < minIntervalMs) {
      schedule();
      return;
    }
    const floor = seekableRange(video)?.start ?? 0;
    if (video.currentTime <= floor) {
      stop();
      return;
    }
    const elapsedSeconds = Math.max(0, (now - startClock) / 1000);
    const theoretical = startPosition - elapsedSeconds * speedMagnitude;
    const target = Math.max(floor, Math.min(video.currentTime, theoretical));
    if (target >= video.currentTime) {
      schedule();
      return;
    }
    if (!writeCurrentTime(video, target)) {
      stop();
      return;
    }
    lastSeekAt = now;
    if (target <= floor) {
      stop();
      return;
    }
    schedule();
  };

  schedule();
  return { stop };
}

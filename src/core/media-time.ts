// SPDX-License-Identifier: GPL-3.0-only

import type { OverlayBufferedRange, OverlayTimelineState } from '../overlay/types';

export function usableDuration(duration: number): number | null {
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

export function clampDisplayedCurrentTime(currentTime: number, duration: number | null): number {
  if (!Number.isFinite(currentTime)) {
    return 0;
  }
  const clamped = Math.max(0, currentTime);
  if (duration == null) {
    return clamped;
  }
  return Math.min(duration, clamped);
}

export function formatMediaTime(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return '--:--';
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  if (hours > 0) {
    return `${hours}:${pad2(minutes)}:${pad2(remainder)}`;
  }
  return `${minutes}:${pad2(remainder)}`;
}

export function formatTimelineReadout(currentTime: number, duration: number | null): string {
  const shown = Number.isFinite(currentTime)
    ? formatMediaTime(clampDisplayedCurrentTime(currentTime, duration))
    : '--:--';
  return `${shown} / ${formatMediaTime(duration)}`;
}

export function normalizeBufferedRanges(
  buffered: { length: number; start(index: number): number; end(index: number): number },
  duration: number | null,
): OverlayBufferedRange[] {
  const ranges: OverlayBufferedRange[] = [];
  try {
    const length = buffered.length;
    for (let index = 0; index < length; index += 1) {
      const rawStart = buffered.start(index);
      const rawEnd = buffered.end(index);
      if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
        continue;
      }
      let start = Math.max(0, rawStart);
      let end = Math.max(0, rawEnd);
      if (duration != null) {
        start = Math.min(duration, start);
        end = Math.min(duration, end);
      }
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        continue;
      }
      ranges.push({ start, end });
    }
  } catch {
    return [];
  }
  return ranges;
}

export function bufferedStructureKey(
  duration: number | null,
  ranges: readonly OverlayBufferedRange[],
): string {
  const durationKey = duration == null ? '' : String(duration);
  return `${durationKey}|${ranges.map((range) => `${range.start}-${range.end}`).join(',')}`;
}

export function readVideoTimeline(video: HTMLVideoElement): OverlayTimelineState {
  const duration = usableDuration(video.duration);
  return {
    currentTime: clampDisplayedCurrentTime(video.currentTime, duration),
    duration,
    buffered: normalizeBufferedRanges(video.buffered, duration),
  };
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

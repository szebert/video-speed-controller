// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  bufferedStructureKey,
  clampDisplayedCurrentTime,
  formatMediaTime,
  formatTimelineReadout,
  normalizeBufferedRanges,
  usableDuration,
} from '../core/media-time';

function ranges(entries: Array<{ start: number; end: number }>) {
  return {
    length: entries.length,
    start: (index: number) => {
      const entry = entries[index];
      if (!entry) {
        throw new Error('out of range');
      }
      return entry.start;
    },
    end: (index: number) => {
      const entry = entries[index];
      if (!entry) {
        throw new Error('out of range');
      }
      return entry.end;
    },
  };
}

describe('media time', () => {
  it('accepts only a finite positive duration', () => {
    expect(usableDuration(48.21)).toBe(48.21);
    expect(usableDuration(0)).toBeNull();
    expect(usableDuration(Number.POSITIVE_INFINITY)).toBeNull();
    expect(usableDuration(Number.NaN)).toBeNull();
  });

  it('clamps displayed current time into 0..duration', () => {
    expect(clampDisplayedCurrentTime(12.43, 48.21)).toBe(12.43);
    expect(clampDisplayedCurrentTime(-2, 48.21)).toBe(0);
    expect(clampDisplayedCurrentTime(99, 48.21)).toBe(48.21);
    expect(clampDisplayedCurrentTime(12.43, null)).toBe(12.43);
    expect(clampDisplayedCurrentTime(Number.NaN, 48.21)).toBe(0);
  });

  it('formats floor-based labels and unknown duration readouts', () => {
    expect(formatMediaTime(0)).toBe('0:00');
    expect(formatMediaTime(7)).toBe('0:07');
    expect(formatMediaTime(12.99)).toBe('0:12');
    expect(formatMediaTime(763)).toBe('12:43');
    expect(formatMediaTime(3723)).toBe('1:02:03');
    expect(formatMediaTime(null)).toBe('--:--');
    expect(formatTimelineReadout(763, 2901)).toBe('12:43 / 48:21');
    expect(formatTimelineReadout(763, null)).toBe('12:43 / --:--');
  });

  it('clamps buffered ranges to duration and drops empty leftovers', () => {
    expect(
      normalizeBufferedRanges(
        ranges([
          { start: -4, end: 10 },
          { start: 40, end: 120 },
          { start: 20, end: 20 },
          { start: 30, end: 25 },
          { start: Number.NaN, end: 8 },
        ]),
        50,
      ),
    ).toEqual([
      { start: 0, end: 10 },
      { start: 40, end: 50 },
    ]);
  });

  it('changes the structure key when duration changes with the same ranges', () => {
    const buffered = [{ start: 0, end: 50 }];
    expect(bufferedStructureKey(100, buffered)).not.toBe(bufferedStructureKey(200, buffered));
    expect(bufferedStructureKey(100, buffered)).toBe(bufferedStructureKey(100, buffered));
  });

  it('returns no ranges when TimeRanges throws', () => {
    expect(
      normalizeBufferedRanges(
        {
          length: 1,
          start: () => {
            throw new Error('not ready');
          },
          end: () => 10,
        },
        60,
      ),
    ).toEqual([]);
  });
});

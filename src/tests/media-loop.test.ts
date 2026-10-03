// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { MIN_LOOP_SPAN_SECONDS, resolveLoopSpan, type LoopSpanRange } from '../core/media-loop';

const windowRange: LoopSpanRange = { start: 10, end: 40 };

describe('resolveLoopSpan', () => {
  it('is native when neither mark is set, even with no seekable window', () => {
    expect(resolveLoopSpan(null, null, null)).toEqual({ mode: 'native' });
    expect(resolveLoopSpan(windowRange, null, null)).toEqual({ mode: 'native' });
  });

  it('intersects a single mark with the current window', () => {
    expect(resolveLoopSpan(windowRange, 12, null)).toEqual({ mode: 'custom', start: 12, end: 40 });
    expect(resolveLoopSpan(windowRange, 4, null)).toEqual({ mode: 'custom', start: 10, end: 40 });
    expect(resolveLoopSpan(windowRange, null, 22)).toEqual({ mode: 'custom', start: 10, end: 22 });
    expect(resolveLoopSpan(windowRange, null, 50)).toEqual({ mode: 'custom', start: 10, end: 40 });
  });

  it('loops from the earlier mark to the later mark', () => {
    expect(resolveLoopSpan(windowRange, 28, 14)).toEqual({ mode: 'custom', start: 14, end: 28 });
    expect(resolveLoopSpan({ start: 0, end: 30 }, 0, 6)).toEqual({
      mode: 'custom',
      start: 0,
      end: 6,
    });
    expect(resolveLoopSpan({ start: 4, end: 10 }, 0, 6)).toEqual({
      mode: 'custom',
      start: 4,
      end: 6,
    });
  });

  it('returns null when the marks miss the window or the window is missing', () => {
    expect(resolveLoopSpan(null, 12, null)).toBeNull();
    expect(resolveLoopSpan(windowRange, 50, null)).toBeNull();
    expect(resolveLoopSpan(windowRange, null, 4)).toBeNull();
    expect(resolveLoopSpan({ start: 18, end: 30 }, 2, 8)).toBeNull();
    expect(resolveLoopSpan(windowRange, Number.NaN, null)).toBeNull();
  });

  it('treats a span of exactly 0.05s as valid and anything shorter as null', () => {
    const start = 3;
    const exactEnd = start + MIN_LOOP_SPAN_SECONDS;
    expect(resolveLoopSpan({ start: 0, end: 20 }, start, exactEnd)).toEqual({
      mode: 'custom',
      start,
      end: exactEnd,
    });
    const late = 10_000;
    expect(resolveLoopSpan({ start: 0, end: 20_000 }, late, late + MIN_LOOP_SPAN_SECONDS)).toEqual({
      mode: 'custom',
      start: late,
      end: late + MIN_LOOP_SPAN_SECONDS,
    });
    expect(resolveLoopSpan({ start: 0, end: 10 }, start, start + 0.04)).toBeNull();
    expect(resolveLoopSpan({ start: 0, end: 10 }, start, start + 0.049)).toBeNull();
    expect(resolveLoopSpan({ start: 0, end: 10 }, 4, 4)).toBeNull();
  });
});

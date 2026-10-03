// SPDX-License-Identifier: GPL-3.0-only

// Pure A/B span math. Playback writes, video.loop, and animation frames stay
// in VideoOverlay.

export const MIN_LOOP_SPAN_SECONDS = 0.05;

export type LoopSpanRange = { start: number; end: number };

export type LoopSpan = { mode: 'native' } | { mode: 'custom'; start: number; end: number };

/**
 * Resolves the loop span for the current seekable window.
 * Neither mark is native, even with no window. A stored mark that does not
 * overlap the window, or a span shorter than {@link MIN_LOOP_SPAN_SECONDS},
 * returns null. Exactly 0.05 seconds is a valid custom span.
 */
export function resolveLoopSpan(
  seekableRange: LoopSpanRange | null,
  markA: number | null,
  markB: number | null,
): LoopSpan | null {
  if (markA == null && markB == null) {
    return { mode: 'native' };
  }
  if (
    seekableRange == null ||
    !Number.isFinite(seekableRange.start) ||
    !Number.isFinite(seekableRange.end)
  ) {
    return null;
  }
  const windowStart = seekableRange.start;
  const windowEnd = seekableRange.end;
  let start: number;
  let end: number;
  if (markA != null && markB != null) {
    if (!Number.isFinite(markA) || !Number.isFinite(markB)) {
      return null;
    }
    start = Math.max(Math.min(markA, markB), windowStart);
    end = Math.min(Math.max(markA, markB), windowEnd);
  } else if (markA != null) {
    if (!Number.isFinite(markA)) {
      return null;
    }
    start = Math.max(markA, windowStart);
    end = windowEnd;
  } else if (markB != null && Number.isFinite(markB)) {
    start = windowStart;
    end = Math.min(markB, windowEnd);
  } else {
    return null;
  }
  if (!loopSpanIsLongEnough(start, end)) {
    return null;
  }
  return { mode: 'custom', start, end };
}

/** True when the span is at least {@link MIN_LOOP_SPAN_SECONDS}, including exactly 0.05. */
function loopSpanIsLongEnough(start: number, end: number): boolean {
  // Subtraction at long timestamps can land a fraction of a nanosecond under 0.05.
  return end - start >= MIN_LOOP_SPAN_SECONDS - 1e-6;
}

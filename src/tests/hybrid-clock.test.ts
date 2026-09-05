// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { LOGICAL_COUNTER_EXHAUSTED, MAX_LOGICAL_VALUE } from '../settings/logical-value';
import {
  HYBRID_CLOCK_UNUSABLE,
  issueHybridTimestamp,
  nextHybridTimestamp,
  observeHybridClock,
  parseHybridClockRecord,
} from '../storage/hybrid-clock';

describe('hybrid clock', () => {
  it('issues wall time from a fresh clock, then increments on the same millisecond', () => {
    expect(nextHybridTimestamp(0, 50)).toBe(50);
    expect(nextHybridTimestamp(50, 50)).toBe(51);
    expect(nextHybridTimestamp(51, 50)).toBe(52);
    expect(nextHybridTimestamp(52, 50)).toBe(53);
  });

  it('beats a clock-ahead peer after observe', () => {
    expect(nextHybridTimestamp(0, 50, [1e12])).toBe(1e12 + 1);
    const observed = observeHybridClock({ status: 'absent' }, [1e12]);
    expect(observed).toEqual({ advanced: true, record: { schemaVersion: 1, lastIssued: 1e12 } });
    expect(nextHybridTimestamp(observed!.record.lastIssued, 50)).toBe(1e12 + 1);
  });

  it('does not let poison timestamps advance the clock', () => {
    expect(nextHybridTimestamp(10, 20, [Number.MAX_SAFE_INTEGER, -1, Number.NaN])).toBe(20);
    expect(observeHybridClock({ status: 'absent' }, [Number.MAX_SAFE_INTEGER])).toBeNull();
  });

  it('fails closed at the last persistable logical value', () => {
    expect(() => nextHybridTimestamp(MAX_LOGICAL_VALUE, 50)).toThrow(LOGICAL_COUNTER_EXHAUSTED);
  });

  it('treats absent metadata as a fresh clock and blocks corrupt or unsupported records', () => {
    expect(parseHybridClockRecord(undefined).status).toBe('absent');
    expect(issueHybridTimestamp({ status: 'absent' }, 50).timestamp).toBe(50);
    expect(parseHybridClockRecord({ schemaVersion: 1, lastIssued: Number.MAX_SAFE_INTEGER })).toEqual(
      { status: 'corrupt' },
    );
    expect(parseHybridClockRecord({ schemaVersion: 2, lastIssued: 10 })).toEqual({
      status: 'unsupported',
    });
    expect(() => issueHybridTimestamp({ status: 'corrupt' }, 50)).toThrow(HYBRID_CLOCK_UNUSABLE);
    expect(() =>
      issueHybridTimestamp({ status: 'unsupported' }, 50),
    ).toThrow(HYBRID_CLOCK_UNUSABLE);
    expect(() => observeHybridClock({ status: 'unsupported' }, [10])).toThrow(HYBRID_CLOCK_UNUSABLE);
  });

  it('does not reset a corrupt lastIssued to 0', () => {
    const parsed = parseHybridClockRecord({ schemaVersion: 1, lastIssued: 'x' });
    expect(parsed.status).toBe('corrupt');
    expect(() => issueHybridTimestamp(parsed, 50)).toThrow(HYBRID_CLOCK_UNUSABLE);
  });
});

// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  MAX_LOGICAL_VALUE,
  LOGICAL_COUNTER_EXHAUSTED,
  checkedIncrement,
  isLogicalValue,
} from '../settings/logical-value';

describe('logical values', () => {
  it('rejects Number.MAX_SAFE_INTEGER and accepts MAX_LOGICAL_VALUE', () => {
    expect(isLogicalValue(Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(isLogicalValue(MAX_LOGICAL_VALUE)).toBe(true);
    expect(isLogicalValue(0)).toBe(true);
    expect(isLogicalValue(-1)).toBe(false);
    expect(isLogicalValue(1.5)).toBe(false);
    expect(isLogicalValue(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isLogicalValue(Number.NaN)).toBe(false);
  });

  it('fails closed when incrementing MAX_LOGICAL_VALUE', () => {
    expect(checkedIncrement(0)).toBe(1);
    expect(() => checkedIncrement(MAX_LOGICAL_VALUE)).toThrow(LOGICAL_COUNTER_EXHAUSTED);
    expect(() => checkedIncrement(Number.MAX_SAFE_INTEGER)).toThrow(LOGICAL_COUNTER_EXHAUSTED);
  });
});

// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { decideRateChange, MAX_RATE_RETRIES } from '../core/arbitration';

describe('per-video arbitration', () => {
  it('treats our own writes as echo and unexpected rates as local adopt after retries', () => {
    expect(
      decideRateChange({
        currentRate: 2,
        targetSpeed: 2,
        lastWrittenRate: 2,
        retryCount: 0,
        surrendered: false,
      }),
    ).toEqual({ kind: 'echo' });

    let retryCount = 0;
    let decision = decideRateChange({
      currentRate: 1.5,
      targetSpeed: 2,
      lastWrittenRate: 2,
      retryCount,
      surrendered: false,
    });
    while (decision.kind === 'retry') {
      retryCount = decision.retryCount;
      decision = decideRateChange({
        currentRate: 1.5,
        targetSpeed: 2,
        lastWrittenRate: 2,
        retryCount,
        surrendered: false,
      });
    }
    expect(retryCount).toBe(MAX_RATE_RETRIES);
    expect(decision).toEqual({ kind: 'adopt' });
  });
});

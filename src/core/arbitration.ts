// SPDX-License-Identifier: GPL-3.0-only

export const MAX_RATE_RETRIES = 4;
export const RATE_EPSILON = 0.001;

export function ratesAlmostEqual(a: number, b: number, epsilon = RATE_EPSILON): boolean {
  return Math.abs(a - b) <= epsilon;
}

export function nextBackoffMs(retryCount: number): number {
  return 50 * 2 ** Math.max(0, retryCount - 1);
}

export type ArbitrationDecision =
  | { kind: 'echo' }
  | { kind: 'match' }
  | { kind: 'retry'; retryCount: number; delayMs: number }
  | { kind: 'adopt' };

export function decideRateChange(input: {
  currentRate: number;
  targetSpeed: number;
  lastWrittenRate?: number;
  retryCount: number;
  surrendered: boolean;
}): ArbitrationDecision | { kind: 'ignore' } {
  if (input.surrendered) {
    return { kind: 'ignore' };
  }
  if (input.lastWrittenRate != null && ratesAlmostEqual(input.currentRate, input.lastWrittenRate)) {
    return { kind: 'echo' };
  }
  if (ratesAlmostEqual(input.currentRate, input.targetSpeed)) {
    return { kind: 'match' };
  }
  const retryCount = input.retryCount + 1;
  if (retryCount <= MAX_RATE_RETRIES) {
    return { kind: 'retry', retryCount, delayMs: nextBackoffMs(retryCount) };
  }
  return { kind: 'adopt' };
}

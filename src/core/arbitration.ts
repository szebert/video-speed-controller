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
  const decision = decideRateDefense(input);
  if (decision.kind !== 'retry') {
    return decision;
  }
  if (decision.retryCount > MAX_RATE_RETRIES) {
    return { kind: 'adopt' };
  }
  return decision;
}

/**
 * Temporary transport never adopts. A persistent player can keep changing the
 * rate, but the session stays live and we keep writing it back.
 */
export function decideTemporaryRateChange(input: {
  currentRate: number;
  targetSpeed: number;
  lastWrittenRate?: number;
  retryCount: number;
}): Extract<ArbitrationDecision, { kind: 'echo' | 'match' | 'retry' }> {
  const decision = decideRateDefense(input);
  if (decision.kind !== 'retry') {
    return decision;
  }
  // Cycle the backoff so retries cannot be exhausted.
  const retryCount = decision.retryCount > MAX_RATE_RETRIES ? 1 : decision.retryCount;
  return { kind: 'retry', retryCount, delayMs: nextBackoffMs(retryCount) };
}

function decideRateDefense(input: {
  currentRate: number;
  targetSpeed: number;
  lastWrittenRate?: number;
  retryCount: number;
}): Extract<ArbitrationDecision, { kind: 'echo' | 'match' | 'retry' }> {
  if (input.lastWrittenRate != null && ratesAlmostEqual(input.currentRate, input.lastWrittenRate)) {
    return { kind: 'echo' };
  }
  if (ratesAlmostEqual(input.currentRate, input.targetSpeed)) {
    return { kind: 'match' };
  }
  const retryCount = input.retryCount + 1;
  return { kind: 'retry', retryCount, delayMs: nextBackoffMs(retryCount) };
}

// SPDX-License-Identifier: GPL-3.0-only

export const MAX_LOGICAL_VALUE = Number.MAX_SAFE_INTEGER - 1;

export const LOGICAL_COUNTER_EXHAUSTED = 'Logical counter exhausted';

export function isLogicalValue(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_LOGICAL_VALUE
  );
}

export function checkedIncrement(value: number): number {
  const next = value + 1;
  if (!isLogicalValue(next)) {
    throw new Error(LOGICAL_COUNTER_EXHAUSTED);
  }
  return next;
}

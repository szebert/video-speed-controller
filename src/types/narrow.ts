// SPDX-License-Identifier: GPL-3.0-only

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function listIncludes<T extends string>(list: readonly T[], value: string): value is T {
  return list.some((item) => item === value);
}

export function nonEmpty<T>(values: readonly T[]): [T, ...T[]] {
  const [first, ...rest] = values;
  if (first === undefined) {
    throw new Error('Expected at least one value');
  }
  return [first, ...rest];
}

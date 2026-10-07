// SPDX-License-Identifier: GPL-3.0-only

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function listIncludes<T extends string>(list: readonly T[], value: string): value is T {
  return list.some((item) => item === value);
}

export function keysOf<T extends object>(record: T): (keyof T & string)[] {
  return Object.keys(record).filter((key): key is keyof T & string =>
    Object.prototype.hasOwnProperty.call(record, key),
  );
}

export function nonEmpty<T>(values: readonly T[]): [T, ...T[]] {
  const [first, ...rest] = values;
  if (first === undefined) {
    throw new Error('Expected at least one value');
  }
  return [first, ...rest];
}

function hasOwnKeys<T extends object>(
  value: object,
  keys: readonly (keyof T & string)[],
): value is T {
  return keys.every((key) => Object.hasOwn(value, key));
}

export function completeRecord<T extends object>(
  value: object,
  keys: readonly (keyof T & string)[],
): T {
  if (hasOwnKeys<T>(value, keys)) {
    return value;
  }
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  throw new Error(`Missing ${missing.join(', ')}`);
}

export function narrowed<T>(
  value: unknown,
  accepts: (value: unknown) => value is T,
): T | undefined {
  return accepts(value) ? value : undefined;
}

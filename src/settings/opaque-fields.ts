// SPDX-License-Identifier: GPL-3.0-only

import { isRecord } from '../types/narrow';

export type OpaqueFields = {
  record: Record<string, unknown>;
  overrides: Record<string, unknown>;
};

export const EMPTY_OPAQUE_FIELDS: OpaqueFields = Object.freeze({
  record: {},
  overrides: {},
});

export function emptyOpaqueFields(): OpaqueFields {
  return { record: {}, overrides: {} };
}

export function hasOpaqueContent(extras: OpaqueFields): boolean {
  return Object.keys(extras.record).length > 0 || Object.keys(extras.overrides).length > 0;
}

export function hasOpaqueOverrideExtras(extras: OpaqueFields): boolean {
  return Object.keys(extras.overrides).length > 0;
}

export function mergeOpaqueFields(lower: OpaqueFields, higher: OpaqueFields): OpaqueFields {
  return {
    record: { ...lower.record, ...higher.record },
    overrides: { ...lower.overrides, ...higher.overrides },
  };
}

export function extrasForDestination(
  destination: 'sync' | 'local',
  syncExtras: OpaqueFields,
  localExtras: OpaqueFields,
): OpaqueFields {
  return destination === 'sync'
    ? mergeOpaqueFields(localExtras, syncExtras)
    : mergeOpaqueFields(syncExtras, localExtras);
}

function canonicalizeJson(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeJson(value[key])]),
  );
}

export function serializedRecordsEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalizeJson(left)) === JSON.stringify(canonicalizeJson(right));
}

export function pickUnknownKeys(
  raw: Record<string, unknown>,
  known: readonly string[],
): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!known.includes(key)) {
      extras[key] = value;
    }
  }
  return extras;
}

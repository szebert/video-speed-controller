// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import { LogicalValueSchema } from '../settings/behavior-schema';
import { checkedIncrement, isLogicalValue } from '../settings/logical-value';
import { listOverrides, type BehaviorOverrides } from '../settings/site-behavior';
import {
  parseSchemaVersionedControl,
  type ControlMetadataParse,
} from './control-metadata';

export const SITE_HLC_KEY = 'meta:hlc:site';
export const GLOBAL_HLC_KEY = 'meta:hlc:global';

export const HYBRID_CLOCK_UNUSABLE = 'Hybrid clock metadata is unusable';

export type HybridClockRecord = {
  schemaVersion: 1;
  lastIssued: number;
};

const HybridClockV1Schema = z.object({
  lastIssued: LogicalValueSchema,
});

export function parseHybridClockRecord(raw: unknown): ControlMetadataParse<HybridClockRecord> {
  return parseSchemaVersionedControl(raw, (record) => {
    const parsed = HybridClockV1Schema.safeParse(record);
    return parsed.success ? { schemaVersion: 1, lastIssued: parsed.data.lastIssued } : null;
  });
}

export function lastIssuedOf(parsed: ControlMetadataParse<HybridClockRecord>): number {
  return parsed.status === 'valid' ? parsed.value.lastIssued : 0;
}

export function assertHybridClockUsable(
  parsed: ControlMetadataParse<HybridClockRecord>,
): asserts parsed is { status: 'absent' } | { status: 'valid'; value: HybridClockRecord } {
  if (parsed.status === 'corrupt' || parsed.status === 'unsupported') {
    throw new Error(HYBRID_CLOCK_UNUSABLE);
  }
}

export function serializeHybridClock(lastIssued: number): HybridClockRecord {
  return { schemaVersion: 1, lastIssued };
}

export function nextHybridTimestamp(
  lastIssued: number,
  now: number,
  observed: readonly number[] = [],
): number {
  const logicalFloor = Math.max(lastIssued, ...observed.filter(isLogicalValue), 0);
  if (logicalFloor >= now) {
    return checkedIncrement(logicalFloor);
  }
  if (!isLogicalValue(now)) {
    throw new Error(HYBRID_CLOCK_UNUSABLE);
  }
  return now;
}

export function issueHybridTimestamp(
  parsed: ControlMetadataParse<HybridClockRecord>,
  now: number,
  observed: readonly number[] = [],
): { timestamp: number; record: HybridClockRecord } {
  assertHybridClockUsable(parsed);
  const timestamp = nextHybridTimestamp(lastIssuedOf(parsed), now, observed);
  return { timestamp, record: serializeHybridClock(timestamp) };
}

export function observeHybridClock(
  parsed: ControlMetadataParse<HybridClockRecord>,
  observed: readonly number[],
): { advanced: boolean; record: HybridClockRecord } | null {
  assertHybridClockUsable(parsed);
  const lastIssued = lastIssuedOf(parsed);
  const raised = Math.max(lastIssued, ...observed.filter(isLogicalValue), 0);
  if (raised === lastIssued && parsed.status === 'valid') {
    return { advanced: false, record: parsed.value };
  }
  if (raised === lastIssued) {
    return null;
  }
  return { advanced: true, record: serializeHybridClock(raised) };
}

export function collectOverrideTimestamps(
  ...overrideSets: readonly (BehaviorOverrides | undefined)[]
): number[] {
  const timestamps: number[] = [];
  for (const overrides of overrideSets) {
    if (!overrides) {
      continue;
    }
    for (const override of listOverrides(overrides)) {
      if (isLogicalValue(override.updatedAt)) {
        timestamps.push(override.updatedAt);
      }
    }
  }
  return timestamps;
}

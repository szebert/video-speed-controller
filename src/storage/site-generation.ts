// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import { LogicalValueSchema } from '../settings/behavior-schema';
import { cannotSafelyDestroy } from '../settings/destroy-policy';
import type { SettingsParseResult } from '../settings/migrate';
import {
  parseSchemaVersionedControl,
  type ControlMetadataParse,
} from './control-metadata';

export const SITE_GENERATION_KEY = 'meta:site-generation';

export const SITE_GENERATION_UNKNOWN = 'Site generation metadata is unknown';

export type SiteGenerationRecord = {
  schemaVersion: 1;
  epoch: number;
  updatedAt?: number;
};

export type ParsedGeneration =
  | { status: 'legacy'; value: 0 }
  | { status: 'valid'; value: number }
  | { status: 'unknown' };

export type MergedGeneration = { status: 'known'; epoch: number } | { status: 'unknown' };

const SiteGenerationEpochSchema = z.object({
  epoch: LogicalValueSchema,
});

export function parseSiteGenerationRecord(
  raw: unknown,
): ControlMetadataParse<SiteGenerationRecord> {
  return parseSchemaVersionedControl(raw, (record) => {
    const parsed = SiteGenerationEpochSchema.safeParse(record);
    if (!parsed.success) {
      return null;
    }
    const updatedAt = LogicalValueSchema.safeParse(record.updatedAt);
    return {
      schemaVersion: 1,
      epoch: parsed.data.epoch,
      ...(updatedAt.success ? { updatedAt: updatedAt.data } : {}),
    };
  });
}

export function parseSiteRecordGeneration(raw: unknown): ParsedGeneration {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 'legacy', value: 0 };
  }
  if (!Object.prototype.hasOwnProperty.call(raw, 'generation')) {
    return { status: 'legacy', value: 0 };
  }
  const generation = LogicalValueSchema.safeParse((raw as { generation: unknown }).generation);
  return generation.success ? { status: 'valid', value: generation.data } : { status: 'unknown' };
}

export function mergeGenerationEpochs(
  left: ControlMetadataParse<SiteGenerationRecord>,
  right: ControlMetadataParse<SiteGenerationRecord>,
): MergedGeneration {
  if (
    left.status === 'corrupt' ||
    left.status === 'unsupported' ||
    right.status === 'corrupt' ||
    right.status === 'unsupported'
  ) {
    return { status: 'unknown' };
  }
  const leftEpoch = left.status === 'valid' ? left.value.epoch : 0;
  const rightEpoch = right.status === 'valid' ? right.value.epoch : 0;
  return { status: 'known', epoch: Math.max(leftEpoch, rightEpoch) };
}

export function assertKnownGeneration(
  merged: MergedGeneration,
): asserts merged is { status: 'known'; epoch: number } {
  if (merged.status !== 'known') {
    throw new Error(SITE_GENERATION_UNKNOWN);
  }
}

export function knownEpochOf(
  parsed: ControlMetadataParse<SiteGenerationRecord>,
): number | null {
  if (parsed.status === 'absent') {
    return 0;
  }
  if (parsed.status === 'valid') {
    return parsed.value.epoch;
  }
  return null;
}

export type SiteGenerationEligibility =
  | { status: 'eligible'; generation: number }
  | { status: 'stale'; generation: number }
  | { status: 'future'; generation: number }
  | { status: 'unknown' };

export function siteGenerationEligibility(
  generation: ParsedGeneration,
  merged: MergedGeneration,
): SiteGenerationEligibility {
  if (generation.status === 'unknown' || merged.status === 'unknown') {
    return { status: 'unknown' };
  }
  if (generation.value < merged.epoch) {
    return { status: 'stale', generation: generation.value };
  }
  if (generation.value > merged.epoch) {
    return { status: 'future', generation: generation.value };
  }
  return { status: 'eligible', generation: generation.value };
}

export function shouldApplySiteCopy<T>(
  parsed: SettingsParseResult<T>,
  raw: unknown,
  merged: MergedGeneration,
): boolean {
  if (parsed.status !== 'ready') {
    return false;
  }
  if (cannotSafelyDestroy(parsed)) {
    return true;
  }
  return siteGenerationEligibility(parseSiteRecordGeneration(raw), merged).status === 'eligible';
}

export function isFutureOrUnknownGeneration(
  raw: unknown,
  merged: MergedGeneration,
): boolean {
  const generation = parseSiteRecordGeneration(raw);
  if (generation.status === 'unknown') {
    return true;
  }
  return merged.status === 'known' && generation.value > merged.epoch;
}

export function isOldGenerationCopy(raw: unknown, epoch: number): boolean {
  const generation = parseSiteRecordGeneration(raw);
  return generation.status !== 'unknown' && generation.value < epoch;
}

export function serializeSiteGeneration(
  epoch: number,
  updatedAt?: number,
): SiteGenerationRecord {
  return updatedAt === undefined
    ? { schemaVersion: 1, epoch }
    : { schemaVersion: 1, epoch, updatedAt };
}

export function replicaNeedsGenerationRepair(
  parsed: ControlMetadataParse<SiteGenerationRecord>,
  epoch: number,
): boolean {
  if (parsed.status === 'corrupt' || parsed.status === 'unsupported') {
    return false;
  }
  if (parsed.status === 'absent') {
    return epoch > 0;
  }
  return parsed.value.epoch < epoch;
}

export function generationUpdatedAt(
  parsed: ControlMetadataParse<SiteGenerationRecord>,
): number | undefined {
  return parsed.status === 'valid' ? parsed.value.updatedAt : undefined;
}

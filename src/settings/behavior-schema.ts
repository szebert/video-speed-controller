// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import type { Equal } from '../types/equal';
import { hasOpaqueContent, pickUnknownKeys, type OpaqueFields } from './opaque-fields';
import { BEHAVIOR_FIELDS, type BehaviorField } from './behavior-fields';
import {
  hasSemanticOverrides,
  isFiniteTimestamp,
  type BehaviorOverrides,
  type GlobalBehaviorSettingsV1,
  type SiteSettingsV1,
} from './site-behavior';

const StoredDelaySchema = z
  .number()
  .refine(Number.isInteger)
  .refine((value) => value >= 0);

// Storage salvage (regular Zod). Stricter than RPC/Mini (finite numbers,
// integer delay). Cannot be imported from protocol/content or the content graph.
export const behaviorValueSchemas = {
  speed: z.number().finite(),
  speedMin: z.number().finite(),
  speedMax: z.number().finite(),
  speedTick: z.number().finite(),
  overlayVisible: z.boolean(),
  overlayPosition: z.number().int().min(0).max(8),
  overlayPositionButton: z.boolean(),
  overlaySettingsButton: z.boolean(),
  overlayAutoHide: z.boolean(),
  overlayHoverHold: z.boolean(),
  overlayAutoHideDelayMs: StoredDelaySchema,
} satisfies Record<BehaviorField, z.ZodType>;

true satisfies Equal<BehaviorField, keyof typeof behaviorValueSchemas>;

const SITE_ENVELOPE_KEYS = ['schemaVersion', 'overrides', 'lastUsedAt'] as const;
const GLOBAL_ENVELOPE_KEYS = ['schemaVersion', 'overrides'] as const;

function overrideSchema<T extends z.ZodType>(valueSchema: T) {
  return z.union([
    z.strictObject({
      kind: z.literal('inherit'),
      updatedAt: z.number().finite(),
    }),
    z.strictObject({
      kind: z.literal('value'),
      value: valueSchema,
      updatedAt: z.number().finite(),
    }),
  ]);
}

function isKnownField(key: string): key is BehaviorField {
  return Object.prototype.hasOwnProperty.call(BEHAVIOR_FIELDS, key);
}

function hasRequiredKeys(value: object, keys: readonly string[]): boolean {
  return keys.every((key) => key in value);
}

export function parseBehaviorOverrideMap(value: unknown): {
  overrides: BehaviorOverrides;
  extras: Record<string, unknown>;
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const overrides: BehaviorOverrides = {};
  const extras: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(raw)) {
    if (key === 'hotkeys') {
      if (!field || typeof field !== 'object' || Array.isArray(field)) {
        continue;
      }
      if (Object.keys(field).length > 0) {
        extras.hotkeys = field;
      }
      continue;
    }
    if (!isKnownField(key)) {
      extras[key] = field;
      continue;
    }
    const result = overrideSchema(behaviorValueSchemas[key]).safeParse(field);
    if (result.success) {
      Object.assign(overrides, { [key]: result.data });
    }
  }

  return { overrides, extras };
}

export function parseBehaviorOverrides(value: unknown): BehaviorOverrides | null {
  return parseBehaviorOverrideMap(value)?.overrides ?? null;
}

export function parseReadySiteSettings(
  value: unknown,
): { record: SiteSettingsV1; extras: OpaqueFields } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (!hasRequiredKeys(raw, SITE_ENVELOPE_KEYS) || raw.schemaVersion !== 1) {
    return null;
  }
  if (!isFiniteTimestamp(raw.lastUsedAt)) {
    return null;
  }
  const parsedOverrides = parseBehaviorOverrideMap(raw.overrides);
  if (!parsedOverrides) {
    return null;
  }
  const extras: OpaqueFields = {
    record: pickUnknownKeys(raw, SITE_ENVELOPE_KEYS),
    overrides: parsedOverrides.extras,
  };
  if (!hasSemanticOverrides(parsedOverrides.overrides) && !hasOpaqueContent(extras)) {
    return null;
  }
  return {
    record: {
      schemaVersion: 1,
      overrides: parsedOverrides.overrides,
      lastUsedAt: raw.lastUsedAt,
    },
    extras,
  };
}

export function parseSiteSettings(value: unknown): SiteSettingsV1 | null {
  return parseReadySiteSettings(value)?.record ?? null;
}

export function parseReadyGlobalBehaviorSettings(
  value: unknown,
): { record: GlobalBehaviorSettingsV1; extras: OpaqueFields } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (!hasRequiredKeys(raw, GLOBAL_ENVELOPE_KEYS) || raw.schemaVersion !== 1) {
    return null;
  }
  const parsedOverrides = parseBehaviorOverrideMap(raw.overrides);
  if (!parsedOverrides) {
    return null;
  }
  return {
    record: { schemaVersion: 1, overrides: parsedOverrides.overrides },
    extras: {
      record: pickUnknownKeys(raw, GLOBAL_ENVELOPE_KEYS),
      overrides: parsedOverrides.extras,
    },
  };
}

export function parseGlobalBehaviorSettings(value: unknown): GlobalBehaviorSettingsV1 | null {
  return parseReadyGlobalBehaviorSettings(value)?.record ?? null;
}

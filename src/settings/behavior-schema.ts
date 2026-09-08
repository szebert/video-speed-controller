// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import type { Equal } from '../types/equal';
import { hasOpaqueContent, pickUnknownKeys, type OpaqueFields } from './opaque-fields';
import { BEHAVIOR_FIELDS, type BehaviorField } from './behavior-fields';
import { isLogicalValue } from './logical-value';
import { isHotkeyBinding } from './hotkey-binding';
import {
  hasSemanticOverrides,
  isFiniteTimestamp,
  isOverride,
  isSiteHotkeyAction,
  type BehaviorFieldValue,
  type BehaviorOverrides,
  type GlobalBehaviorSettingsV1,
  type HotkeyBinding,
  type OverlayPosition,
  type SiteSettingsV1,
} from './site-behavior';

// Salvage shape only: integer ≥ 0. Product min/max are applied in
// canonicalize so an out-of-range override is kept and clamped, not dropped.
const StoredNonNegativeIntegerSchema = z
  .number()
  .refine(Number.isInteger)
  .refine((value) => value >= 0);

const StoredOverlayPositionSchema = z.literal([
  0, 1, 2, 3, 4, 5, 6, 7, 8,
]) satisfies z.ZodType<OverlayPosition>;

type BehaviorValueSchemaMap = {
  [K in BehaviorField]: z.ZodType<BehaviorFieldValue<K>>;
};

// Storage salvage (regular Zod). Stricter than RPC/Mini (integer delay/opacity).
// Cannot be imported from protocol/content or the content graph. Backup V1
// keeps its own field representations and must not reuse these live schemas.
export const LogicalValueSchema = z.number().refine(isLogicalValue);

export const behaviorValueSchemas = {
  speed: z.number(),
  speedMin: z.number(),
  speedMax: z.number(),
  speedTick: z.number(),
  overlayVisible: z.boolean(),
  overlayPosition: StoredOverlayPositionSchema,
  overlayPositionButton: z.boolean(),
  overlaySettingsButton: z.boolean(),
  overlayHotkeyHints: z.boolean(),
  overlayAutoHide: z.boolean(),
  overlayHoverHold: z.boolean(),
  overlayAutoHideDelayMs: StoredNonNegativeIntegerSchema,
  overlayOpacity: StoredNonNegativeIntegerSchema,
} satisfies BehaviorValueSchemaMap;

true satisfies Equal<
  { [K in BehaviorField]: z.infer<(typeof behaviorValueSchemas)[K]> },
  { [K in BehaviorField]: BehaviorFieldValue<K> }
>;

const SITE_ENVELOPE_KEYS = ['schemaVersion', 'overrides', 'lastUsedAt', 'generation'] as const;
const SITE_REQUIRED_KEYS = ['schemaVersion', 'overrides', 'lastUsedAt'] as const;
const GLOBAL_ENVELOPE_KEYS = ['schemaVersion', 'overrides'] as const;

function overrideSchema<T extends z.ZodType>(valueSchema: T) {
  return z.union([
    z.strictObject({
      kind: z.literal('inherit'),
      updatedAt: LogicalValueSchema,
    }),
    z.strictObject({
      kind: z.literal('value'),
      value: valueSchema,
      updatedAt: LogicalValueSchema,
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
      const parsedHotkeys = parseHotkeyOverrideMap(field);
      if (parsedHotkeys.overrides) {
        overrides.hotkeys = parsedHotkeys.overrides;
      }
      if (parsedHotkeys.extras) {
        extras.hotkeys = parsedHotkeys.extras;
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

function isHotkeyOverrideValue(value: unknown): value is HotkeyBinding | null {
  return value === null || isHotkeyBinding(value);
}

function parseHotkeyOverrideMap(value: object): {
  overrides?: NonNullable<BehaviorOverrides['hotkeys']>;
  extras?: Record<string, unknown>;
} {
  const raw = value as Record<string, unknown>;
  const overrides: NonNullable<BehaviorOverrides['hotkeys']> = {};
  const extras: Record<string, unknown> = {};
  let hasKnown = false;
  for (const [action, field] of Object.entries(raw)) {
    if (!isSiteHotkeyAction(action)) {
      extras[action] = field;
      continue;
    }
    if (isOverride(field, isHotkeyOverrideValue)) {
      overrides[action] = field;
      hasKnown = true;
    }
  }
  return {
    ...(hasKnown ? { overrides } : {}),
    ...(Object.keys(extras).length > 0 ? { extras } : {}),
  };
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
  if (!hasRequiredKeys(raw, SITE_REQUIRED_KEYS) || raw.schemaVersion !== 1) {
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
  const record: SiteSettingsV1 = {
    schemaVersion: 1,
    overrides: parsedOverrides.overrides,
    lastUsedAt: raw.lastUsedAt,
  };
  if (Object.prototype.hasOwnProperty.call(raw, 'generation')) {
    const generation = LogicalValueSchema.safeParse(raw.generation);
    if (generation.success) {
      record.generation = generation.data;
    } else {
      extras.record.generation = raw.generation;
    }
  }
  if (!hasSemanticOverrides(parsedOverrides.overrides) && !hasOpaqueContent(extras)) {
    return null;
  }
  return { record, extras };
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

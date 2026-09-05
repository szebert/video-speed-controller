// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import type { Equal } from '../../types/equal';
import {
  BOOLEAN_BEHAVIOR_FIELDS,
  EDITABLE_BEHAVIOR_FIELDS,
  NUMBER_BEHAVIOR_FIELDS,
  type BehaviorField,
} from '../../settings/behavior-fields';
import type {
  BehaviorSettingChange as DomainBehaviorSettingChange,
  EditableResolvedBehavior,
  OverlayPosition,
} from '../../settings/site-behavior';

// Options/popup RPC (regular Zod). Field lists stay here because this module
// cannot be imported by protocol/content or overlay. Mini twins: OverlayPosition
// and AppliedTabBehavior schemas under protocol/content.
export const OverlayPositionSchema = z.literal([
  0, 1, 2, 3, 4, 5, 6, 7, 8,
]) satisfies z.ZodType<OverlayPosition>;

export const EditableBehaviorFieldSchema = z.enum(EDITABLE_BEHAVIOR_FIELDS);

const NumberBehaviorFieldSchema = z.enum(NUMBER_BEHAVIOR_FIELDS);
const BooleanBehaviorFieldSchema = z.enum(BOOLEAN_BEHAVIOR_FIELDS);

export const BehaviorSettingChangeSchema = z.union([
  z.object({
    kind: z.literal('inherit'),
    field: EditableBehaviorFieldSchema,
  }),
  z.object({
    kind: z.literal('value'),
    field: NumberBehaviorFieldSchema,
    value: z.number(),
  }),
  z.object({
    kind: z.literal('value'),
    field: z.literal('overlayPosition'),
    value: OverlayPositionSchema,
  }),
  z.object({
    kind: z.literal('value'),
    field: BooleanBehaviorFieldSchema,
    value: z.boolean(),
  }),
]);

true satisfies Equal<BehaviorField, z.infer<typeof BehaviorSettingChangeSchema>['field']>;
true satisfies Equal<DomainBehaviorSettingChange, z.infer<typeof BehaviorSettingChangeSchema>>;

export const BehaviorSettingsScopeSchema = z.union([
  z.object({ kind: z.literal('global') }),
  z.object({ kind: z.literal('site'), hostname: z.string() }),
]);

const SettingSourceSchema = z.enum(['built-in', 'global', 'site']);

function resolvedSettingSchema<T extends z.ZodType>(value: T) {
  return z.object({
    value,
    source: SettingSourceSchema,
  });
}

export const EditableResolvedBehaviorSchema = z.object({
  speed: resolvedSettingSchema(z.number()),
  speedMin: resolvedSettingSchema(z.number()),
  speedMax: resolvedSettingSchema(z.number()),
  speedTick: resolvedSettingSchema(z.number()),
  overlayVisible: resolvedSettingSchema(z.boolean()),
  overlayPosition: resolvedSettingSchema(OverlayPositionSchema),
  overlayPositionButton: resolvedSettingSchema(z.boolean()),
  overlaySettingsButton: resolvedSettingSchema(z.boolean()),
  overlayAutoHide: resolvedSettingSchema(z.boolean()),
  overlayHoverHold: resolvedSettingSchema(z.boolean()),
  overlayAutoHideDelayMs: resolvedSettingSchema(z.number()),
}) satisfies z.ZodType<EditableResolvedBehavior>;

true satisfies Equal<z.infer<typeof EditableResolvedBehaviorSchema>, EditableResolvedBehavior>;

export const BehaviorSettingsSnapshotSchema = z.object({
  global: EditableResolvedBehaviorSchema,
  site: z
    .object({
      hostname: z.string(),
      behavior: EditableResolvedBehaviorSchema,
    })
    .nullable(),
});

export const ReapplyResultSchema = z.object({
  reappliedTabs: z.number().int().nonnegative(),
  reapplyFailures: z.number().int().nonnegative(),
  reapplyError: z.string().optional(),
});

export const SiteMembershipUpdateSchema = z.object({
  hostname: z.string(),
  customized: z.boolean(),
});

export const BehaviorMutationSuccessSchema = z.union([
  ReapplyResultSchema.extend({
    ok: z.literal(true),
    state: BehaviorSettingsSnapshotSchema,
    snapshotError: z.never().optional(),
  }),
  ReapplyResultSchema.extend({
    ok: z.literal(true),
    state: z.never().optional(),
    snapshotError: z.string(),
  }),
]);

export const BehaviorMutationFailureSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
});

export const BehaviorMutationResponseSchema = z.union([
  BehaviorMutationSuccessSchema,
  BehaviorMutationFailureSchema,
]);

export type BehaviorSettingsSnapshot = z.infer<typeof BehaviorSettingsSnapshotSchema>;
export type BehaviorSettingChange = z.infer<typeof BehaviorSettingChangeSchema>;
export type BehaviorSettingsScope = z.infer<typeof BehaviorSettingsScopeSchema>;
export type ReapplyResult = z.infer<typeof ReapplyResultSchema>;
export type SiteMembershipUpdate = z.infer<typeof SiteMembershipUpdateSchema>;
export type BehaviorMutationSuccess = z.infer<typeof BehaviorMutationSuccessSchema>;
export type BehaviorMutationResponse = z.infer<typeof BehaviorMutationResponseSchema>;

// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import {
  BehaviorMutationResponseSchema,
  BehaviorMutationSuccessSchema,
  BehaviorSettingChangeSchema,
  BehaviorSettingsScopeSchema,
  BehaviorSettingsSnapshotSchema,
  SiteMembershipUpdateSchema,
} from './shared';

export const GetBehaviorSettingsRequestSchema = z.object({
  type: z.literal('GET_BEHAVIOR_SETTINGS'),
  hostname: z.string().optional(),
});

export const GetCustomSitesRequestSchema = z.object({
  type: z.literal('GET_CUSTOM_SITES'),
});

export const SetBehaviorSettingRequestSchema = z
  .object({
    type: z.literal('SET_BEHAVIOR_SETTING'),
    scope: BehaviorSettingsScopeSchema,
    change: BehaviorSettingChangeSchema.optional(),
    changes: z.array(BehaviorSettingChangeSchema).min(1).optional(),
    snapshotHostname: z.string().optional(),
  })
  .refine((value) => Boolean(value.change) !== Boolean(value.changes));

export const DeleteSiteSettingsRequestSchema = z.object({
  type: z.literal('DELETE_SITE_SETTINGS'),
  hostname: z.string(),
  snapshotHostname: z.string().optional(),
});

export const ResetGlobalBehaviorRequestSchema = z.object({
  type: z.literal('RESET_GLOBAL_BEHAVIOR'),
  snapshotHostname: z.string().optional(),
});

export const ResetAllBehaviorRequestSchema = z.object({
  type: z.literal('RESET_ALL_BEHAVIOR'),
  snapshotHostname: z.string().optional(),
});

export const GetBehaviorSettingsResponseSchema = z.union([
  z.object({ ok: z.literal(true), state: BehaviorSettingsSnapshotSchema }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export const GetCustomSitesResponseSchema = z.union([
  z.object({ ok: z.literal(true), customSites: z.array(z.string()) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export const SetBehaviorSettingResponseSchema = z.union([
  BehaviorMutationSuccessSchema.and(
    z.object({
      siteMembership: SiteMembershipUpdateSchema.optional(),
    }),
  ),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export const DeleteSiteSettingsResponseSchema = z.union([
  BehaviorMutationSuccessSchema.and(
    z.object({
      siteMembership: SiteMembershipUpdateSchema.optional(),
    }),
  ),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export const ResetGlobalBehaviorResponseSchema = BehaviorMutationResponseSchema;

export const ResetAllBehaviorResponseSchema = z.union([
  BehaviorMutationSuccessSchema.and(
    z.object({
      skippedRecordCount: z.number().int().nonnegative(),
    }),
  ),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export const OPTIONS_TO_BACKGROUND = {
  GET_BEHAVIOR_SETTINGS: {
    request: GetBehaviorSettingsRequestSchema,
    response: GetBehaviorSettingsResponseSchema,
  },
  GET_CUSTOM_SITES: {
    request: GetCustomSitesRequestSchema,
    response: GetCustomSitesResponseSchema,
  },
  SET_BEHAVIOR_SETTING: {
    request: SetBehaviorSettingRequestSchema,
    response: SetBehaviorSettingResponseSchema,
  },
  DELETE_SITE_SETTINGS: {
    request: DeleteSiteSettingsRequestSchema,
    response: DeleteSiteSettingsResponseSchema,
  },
  RESET_GLOBAL_BEHAVIOR: {
    request: ResetGlobalBehaviorRequestSchema,
    response: ResetGlobalBehaviorResponseSchema,
  },
  RESET_ALL_BEHAVIOR: {
    request: ResetAllBehaviorRequestSchema,
    response: ResetAllBehaviorResponseSchema,
  },
} as const;

export type GetBehaviorSettingsRequest = z.infer<typeof GetBehaviorSettingsRequestSchema>;
export type GetCustomSitesRequest = z.infer<typeof GetCustomSitesRequestSchema>;
export type SetBehaviorSettingRequest = z.infer<typeof SetBehaviorSettingRequestSchema>;
export type DeleteSiteSettingsRequest = z.infer<typeof DeleteSiteSettingsRequestSchema>;
export type ResetGlobalBehaviorRequest = z.infer<typeof ResetGlobalBehaviorRequestSchema>;
export type ResetAllBehaviorRequest = z.infer<typeof ResetAllBehaviorRequestSchema>;
export type GetBehaviorSettingsResponse = z.infer<typeof GetBehaviorSettingsResponseSchema>;
export type GetCustomSitesResponse = z.infer<typeof GetCustomSitesResponseSchema>;
export type SetBehaviorSettingResponse = z.infer<typeof SetBehaviorSettingResponseSchema>;
export type DeleteSiteSettingsResponse = z.infer<typeof DeleteSiteSettingsResponseSchema>;
export type ResetGlobalBehaviorResponse = z.infer<typeof ResetGlobalBehaviorResponseSchema>;
export type ResetAllBehaviorResponse = z.infer<typeof ResetAllBehaviorResponseSchema>;
export type OptionsToBackgroundRequest = z.infer<
  (typeof OPTIONS_TO_BACKGROUND)[keyof typeof OPTIONS_TO_BACKGROUND]['request']
>;

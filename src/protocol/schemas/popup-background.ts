// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';

const TabUrlRequestSchema = z.object({
  tabId: z.number().int().nonnegative(),
  url: z.string(),
});

export const GetPopupStateRequestSchema = TabUrlRequestSchema.extend({
  type: z.literal('GET_POPUP_STATE'),
});

export const EnableSiteRequestSchema = TabUrlRequestSchema.extend({
  type: z.literal('ENABLE_SITE'),
});

export const SetSpeedRequestSchema = TabUrlRequestSchema.extend({
  type: z.literal('SET_SPEED'),
  speed: z.number().finite(),
});

export const ResetSiteSpeedRequestSchema = TabUrlRequestSchema.extend({
  type: z.literal('RESET_SITE_SPEED'),
});

export const PopupStateResponseSchema = z.object({
  supported: z.boolean(),
  hostname: z.string().nullable(),
  siteSpeed: z.number().nullable(),
  tabTarget: z.number().nullable(),
  siteAccess: z.boolean(),
  speedMin: z.number(),
  speedMax: z.number(),
  speedTick: z.number(),
});

export const EnableSiteResponseSchema = z.union([
  z.object({ ok: z.literal(true), targetSpeed: z.number() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export const SetSpeedResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    targetSpeed: z.number(),
    persistError: z.string().optional(),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export const POPUP_TO_BACKGROUND = {
  GET_POPUP_STATE: { request: GetPopupStateRequestSchema, response: PopupStateResponseSchema },
  ENABLE_SITE: { request: EnableSiteRequestSchema, response: EnableSiteResponseSchema },
  SET_SPEED: { request: SetSpeedRequestSchema, response: SetSpeedResponseSchema },
  RESET_SITE_SPEED: { request: ResetSiteSpeedRequestSchema, response: SetSpeedResponseSchema },
} as const;

export type GetPopupStateRequest = z.infer<typeof GetPopupStateRequestSchema>;
export type EnableSiteRequest = z.infer<typeof EnableSiteRequestSchema>;
export type SetSpeedRequest = z.infer<typeof SetSpeedRequestSchema>;
export type ResetSiteSpeedRequest = z.infer<typeof ResetSiteSpeedRequestSchema>;
export type PopupStateResponse = z.infer<typeof PopupStateResponseSchema>;
export type EnableSiteResponse = z.infer<typeof EnableSiteResponseSchema>;
export type SetSpeedResponse = z.infer<typeof SetSpeedResponseSchema>;
export type PopupToBackgroundRequest = z.infer<
  (typeof POPUP_TO_BACKGROUND)[keyof typeof POPUP_TO_BACKGROUND]['request']
>;

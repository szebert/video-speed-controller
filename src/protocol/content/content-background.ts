// SPDX-License-Identifier: GPL-3.0-only

import * as z from 'zod/mini';

// Content → background wire (Zod Mini). Regular Zod twins live in
// protocol/schemas and must not be imported here — they would ship in content.js.
//
// Same 0–8 grid as OverlayPosition in site-behavior. Mini copy of the privileged
// OverlayPositionSchema in protocol/schemas/shared.ts.
export const OverlayPositionSchema = z.literal([0, 1, 2, 3, 4, 5, 6, 7, 8]);

export const AdjustSpeedRequestSchema = z.object({
  type: z.literal('ADJUST_SPEED'),
  direction: z.literal([-1, 1]),
});

export const SetOverlayPositionRequestSchema = z.object({
  type: z.literal('SET_OVERLAY_POSITION'),
  position: OverlayPositionSchema,
});

export const OpenOptionsPageRequestSchema = z.object({
  type: z.literal('OPEN_OPTIONS_PAGE'),
});

export const FrameReadyRequestSchema = z.object({
  type: z.literal('FRAME_READY'),
});

export const TopFrameDestroyedRequestSchema = z.object({
  type: z.literal('TOP_FRAME_DESTROYED'),
});

export const AdjustSpeedResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    targetSpeed: z.number(),
    persistError: z.optional(z.string()),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);

export const SetOverlayPositionResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    reapplyError: z.optional(z.string()),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);

export const OpenOptionsPageResponseSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export const FrameReadyResponseSchema = z.union([
  z.object({ action: z.literal('applied') }),
  z.object({ action: z.literal('dormant') }),
]);

export const TopFrameDestroyedResponseSchema = z.object({
  ok: z.literal(true),
});

export const CONTENT_TO_BACKGROUND = {
  ADJUST_SPEED: { request: AdjustSpeedRequestSchema, response: AdjustSpeedResponseSchema },
  SET_OVERLAY_POSITION: {
    request: SetOverlayPositionRequestSchema,
    response: SetOverlayPositionResponseSchema,
  },
  OPEN_OPTIONS_PAGE: {
    request: OpenOptionsPageRequestSchema,
    response: OpenOptionsPageResponseSchema,
  },
  FRAME_READY: { request: FrameReadyRequestSchema, response: FrameReadyResponseSchema },
  TOP_FRAME_DESTROYED: {
    request: TopFrameDestroyedRequestSchema,
    response: TopFrameDestroyedResponseSchema,
  },
} as const;

export type AdjustSpeedRequest = z.infer<typeof AdjustSpeedRequestSchema>;
export type SetOverlayPositionRequest = z.infer<typeof SetOverlayPositionRequestSchema>;
export type OpenOptionsPageRequest = z.infer<typeof OpenOptionsPageRequestSchema>;
export type FrameReadyRequest = z.infer<typeof FrameReadyRequestSchema>;
export type TopFrameDestroyedRequest = z.infer<typeof TopFrameDestroyedRequestSchema>;
export type AdjustSpeedResponse = z.infer<typeof AdjustSpeedResponseSchema>;
export type SetOverlayPositionResponse = z.infer<typeof SetOverlayPositionResponseSchema>;
export type OpenOptionsPageResponse = z.infer<typeof OpenOptionsPageResponseSchema>;
export type FrameReadyResponse = z.infer<typeof FrameReadyResponseSchema>;
export type TopFrameDestroyedResponse = z.infer<typeof TopFrameDestroyedResponseSchema>;
export type ContentToBackgroundRequest = z.infer<
  (typeof CONTENT_TO_BACKGROUND)[keyof typeof CONTENT_TO_BACKGROUND]['request']
>;

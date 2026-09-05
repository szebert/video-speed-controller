// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import type {
  AdjustSpeedRequest,
  FrameReadyRequest,
  OpenOptionsPageRequest,
  SetOverlayPositionRequest,
  TopFrameDestroyedRequest,
} from '../types/content-background';
import { OverlayPositionSchema } from './shared';
import { SetSpeedResponseSchema } from './popup-background';

export const AdjustSpeedRequestSchema = z.object({
  type: z.literal('ADJUST_SPEED'),
  direction: z.union([z.literal(-1), z.literal(1)]),
}) satisfies z.ZodType<AdjustSpeedRequest>;

export const SetOverlayPositionRequestSchema = z.object({
  type: z.literal('SET_OVERLAY_POSITION'),
  position: OverlayPositionSchema,
}) satisfies z.ZodType<SetOverlayPositionRequest>;

export const OpenOptionsPageRequestSchema = z.object({
  type: z.literal('OPEN_OPTIONS_PAGE'),
}) satisfies z.ZodType<OpenOptionsPageRequest>;

export const FrameReadyRequestSchema = z.object({
  type: z.literal('FRAME_READY'),
}) satisfies z.ZodType<FrameReadyRequest>;

export const TopFrameDestroyedRequestSchema = z.object({
  type: z.literal('TOP_FRAME_DESTROYED'),
}) satisfies z.ZodType<TopFrameDestroyedRequest>;

export const SetOverlayPositionResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    reapplyError: z.string().optional(),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export const OpenOptionsPageResponseSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export const FrameReadyResponseSchema = z.union([
  z.object({ action: z.literal('applied') }),
  z.object({ action: z.literal('dormant') }),
]);

export const TopFrameDestroyedResponseSchema = z.object({ ok: z.literal(true) });

export const CONTENT_TO_BACKGROUND = {
  ADJUST_SPEED: { request: AdjustSpeedRequestSchema, response: SetSpeedResponseSchema },
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

export type SetOverlayPositionResponse = z.infer<typeof SetOverlayPositionResponseSchema>;
export type FrameReadyResponse = z.infer<typeof FrameReadyResponseSchema>;

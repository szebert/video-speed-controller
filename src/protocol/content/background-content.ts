// SPDX-License-Identifier: GPL-3.0-only

import * as z from 'zod/mini';
import type { AppliedTabBehavior } from '../../core/applied-tab-behavior';
import { OverlayPositionSchema } from './content-background';

export const AppliedTabBehaviorSchema = z.object({
  targetSpeed: z.number(),
  speedMin: z.number(),
  speedMax: z.number(),
  speedTick: z.number(),
  overlayVisible: z.boolean(),
  overlayPosition: OverlayPositionSchema,
  overlayPositionButton: z.boolean(),
  overlaySettingsButton: z.boolean(),
  overlayAutoHide: z.boolean(),
  overlayHoverHold: z.boolean(),
  overlayAutoHideDelayMs: z.number(),
});

// prettier-ignore
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
true satisfies Equal<z.infer<typeof AppliedTabBehaviorSchema>, AppliedTabBehavior>;

export const ApplyTabBehaviorRequestSchema = z.object({
  type: z.literal('APPLY_TAB_BEHAVIOR'),
  behavior: AppliedTabBehaviorSchema,
});

export const ReconcileAccessRequestSchema = z.object({
  type: z.literal('RECONCILE_ACCESS'),
  allowedHostPatterns: z.array(z.string()),
});

export type ApplyTabBehaviorRequest = z.infer<typeof ApplyTabBehaviorRequestSchema>;
export type ReconcileAccessRequest = z.infer<typeof ReconcileAccessRequestSchema>;
export type BackgroundToContentRequest = ApplyTabBehaviorRequest | ReconcileAccessRequest;

export function parseBackgroundToContent(value: unknown): BackgroundToContentRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const type = (value as { type?: unknown }).type;
  if (type === 'APPLY_TAB_BEHAVIOR') {
    const parsed = ApplyTabBehaviorRequestSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }
  if (type === 'RECONCILE_ACCESS') {
    const parsed = ReconcileAccessRequestSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }
  return null;
}

// SPDX-License-Identifier: GPL-3.0-only

import * as z from 'zod/mini';
import type { AppliedTabBehavior } from '../../core/applied-tab-behavior';
import type { EffectiveHotkeyMap } from '../../settings/hotkey-binding';
import type { Equal } from '../../types/equal';
import { OverlayPositionSchema } from './content-background';

// APPLY wire (Mini). Extra keys strip. Session storage uses the handwritten
// exact-key guard in applied-tab-behavior — overlay cannot import this module.
export const AppliedTabBehaviorSchema = z.object({
  targetSpeed: z.number(),
  defaultSpeed: z.number(),
  rememberLastSpeed: z.boolean(),
  speedMin: z.number(),
  speedMax: z.number(),
  decreaseSpeedStep: z.number(),
  increaseSpeedStep: z.number(),
  skipBackSeconds: z.number(),
  skipForwardSeconds: z.number(),
  skipScaleWithPlaybackRate: z.boolean(),
  rewindSpeed: z.number(),
  fastForwardSpeed: z.number(),
  overlayVisible: z.boolean(),
  overlayPosition: OverlayPositionSchema,
  overlayPositionButton: z.boolean(),
  overlaySettingsButton: z.boolean(),
  overlayNavigationBar: z.boolean(),
  overlayHotkeyHints: z.boolean(),
  overlayAutoHide: z.boolean(),
  overlayHoverHold: z.boolean(),
  overlayAutoHideDelayMs: z.number(),
  overlayOpacity: z.number(),
  overlayScale: z.number(),
  buttonFlash: z.boolean(),
  hotkeyFlash: z.boolean(),
  flashDelayMs: z.number(),
  flashOpacity: z.number(),
  flashScale: z.number(),
  hotkeyRepeat: z.boolean(),
  hotkeyRepeatDelayMs: z.number(),
  hotkeyRepeatRate: z.number(),
});

true satisfies Equal<z.infer<typeof AppliedTabBehaviorSchema>, AppliedTabBehavior>;

const HotkeyBindingSchema = z.object({
  code: z.string(),
  ctrl: z.boolean(),
  alt: z.boolean(),
  shift: z.boolean(),
  meta: z.boolean(),
});

export const EffectiveHotkeyMapSchema = z.object({
  increaseSpeed: z.union([HotkeyBindingSchema, z.null()]),
  decreaseSpeed: z.union([HotkeyBindingSchema, z.null()]),
  resetSpeed: z.union([HotkeyBindingSchema, z.null()]),
  resetSpeedToOne: z.union([HotkeyBindingSchema, z.null()]),
  jumpToStart: z.union([HotkeyBindingSchema, z.null()]),
  rewind: z.union([HotkeyBindingSchema, z.null()]),
  skipBack: z.union([HotkeyBindingSchema, z.null()]),
  playPause: z.union([HotkeyBindingSchema, z.null()]),
  skipForward: z.union([HotkeyBindingSchema, z.null()]),
  fastForward: z.union([HotkeyBindingSchema, z.null()]),
  jumpToEnd: z.union([HotkeyBindingSchema, z.null()]),
});

true satisfies Equal<z.infer<typeof EffectiveHotkeyMapSchema>, EffectiveHotkeyMap>;

export const ApplyTabBehaviorRequestSchema = z.object({
  type: z.literal('APPLY_TAB_BEHAVIOR'),
  behavior: AppliedTabBehaviorSchema,
  hotkeys: z.optional(EffectiveHotkeyMapSchema),
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

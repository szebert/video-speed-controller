// SPDX-License-Identifier: GPL-3.0-only

import { isSiteHotkeyAction, type SiteHotkeyAction } from '../settings/site-behavior';
import type { Equal } from '../types/equal';

/** Actions that can have a stored binding. */
export type { SiteHotkeyAction };

/** Actions content can execute: tab-wide speed plus one-video actions. */
export type ControllerAction = SiteHotkeyAction;

export const TAB_SPEED_ACTIONS = [
  'increaseSpeed',
  'decreaseSpeed',
  'resetSpeed',
  'resetSpeedToOne',
] as const;

/** Actions that may cross DISPATCH_TAB_ACTION. Stays the tab-wide speed subset. */
export type TabSpeedAction = (typeof TAB_SPEED_ACTIONS)[number];

/** The seven overlay navigation buttons. Percent jumps are hotkey-only. */
export const MEDIA_NAVIGATION_ACTIONS = [
  'jumpToStart',
  'rewind',
  'skipBack',
  'playPause',
  'skipForward',
  'fastForward',
  'jumpToEnd',
] as const;

export type MediaNavigationAction = (typeof MEDIA_NAVIGATION_ACTIONS)[number];

/** Canonical percent for each hotkey-only jump. Product actions are 10–90. */
export const JUMP_PERCENT_BY_ACTION = {
  jumpTo10Percent: 10,
  jumpTo20Percent: 20,
  jumpTo30Percent: 30,
  jumpTo40Percent: 40,
  jumpTo50Percent: 50,
  jumpTo60Percent: 60,
  jumpTo70Percent: 70,
  jumpTo80Percent: 80,
  jumpTo90Percent: 90,
} as const;

export type JumpPercentAction = keyof typeof JUMP_PERCENT_BY_ACTION;

export const JUMP_PERCENT_ACTIONS = Object.keys(JUMP_PERCENT_BY_ACTION) as JumpPercentAction[];

/** Hotkey-only volume actions. The overlay volume bar has its own controls. */
export const MEDIA_VOLUME_ACTIONS = ['toggleMute', 'decreaseVolume', 'increaseVolume'] as const;

export type MediaVolumeAction = (typeof MEDIA_VOLUME_ACTIONS)[number];

/** Every action that runs against one video and never reaches the background. */
export type MediaLocalAction = MediaNavigationAction | JumpPercentAction | MediaVolumeAction;

export const MEDIA_LOCAL_ACTIONS = [
  ...MEDIA_NAVIGATION_ACTIONS,
  ...MEDIA_VOLUME_ACTIONS,
  ...JUMP_PERCENT_ACTIONS,
] as const;

true satisfies Equal<ControllerAction, TabSpeedAction | MediaLocalAction>;

/** Press-and-hold phase. One-shot and repeat dispatches always use `press`. */
export type ControllerActionPhase = 'press' | 'start' | 'end';

/**
 * Identity of one press-and-hold, held by the hotkey or overlay state that
 * started it so a replaced hold's later `end` cannot close the live session.
 */
export type TransportHoldOwner = object;

export function isControllerAction(value: unknown): value is ControllerAction {
  return isSiteHotkeyAction(value);
}

export function isTabSpeedAction(value: unknown): value is TabSpeedAction {
  return typeof value === 'string' && (TAB_SPEED_ACTIONS as readonly string[]).includes(value);
}

export function isMediaNavigationAction(value: unknown): value is MediaNavigationAction {
  return (
    typeof value === 'string' && (MEDIA_NAVIGATION_ACTIONS as readonly string[]).includes(value)
  );
}

export function isJumpPercentAction(value: unknown): value is JumpPercentAction {
  return typeof value === 'string' && Object.hasOwn(JUMP_PERCENT_BY_ACTION, value);
}

export function isMediaVolumeAction(value: unknown): value is MediaVolumeAction {
  return typeof value === 'string' && (MEDIA_VOLUME_ACTIONS as readonly string[]).includes(value);
}

export function isMediaLocalAction(value: unknown): value is MediaLocalAction {
  return isMediaNavigationAction(value) || isJumpPercentAction(value) || isMediaVolumeAction(value);
}

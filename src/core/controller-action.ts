// SPDX-License-Identifier: GPL-3.0-only

import { isSiteHotkeyAction, type SiteHotkeyAction } from '../settings/site-behavior';
import type { Equal } from '../types/equal';

/** Actions that can have a stored binding. */
export type { SiteHotkeyAction };

/** Actions content can execute: tab-wide speed plus media-local navigation. */
export type ControllerAction = SiteHotkeyAction;

export const TAB_SPEED_ACTIONS = ['increaseSpeed', 'decreaseSpeed', 'resetSpeed'] as const;

/** Actions that may cross DISPATCH_TAB_ACTION. Stays the tab-wide speed subset. */
export type TabSpeedAction = (typeof TAB_SPEED_ACTIONS)[number];

/** Actions that run against one video and never reach the background. */
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

true satisfies Equal<ControllerAction, TabSpeedAction | MediaNavigationAction>;

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
